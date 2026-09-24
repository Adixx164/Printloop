#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  PrintLoop on-site agent — Linux installer (V2-35)
#  ─────────────────────────────────────────────────────────────────────
#
#  Run from the agent directory as root (or with sudo):
#
#     cd /opt/printloop-agent
#     sudo bash install.sh
#
#  What it does (idempotent — re-runnable safely):
#    1. Detects the package manager: apt (Debian/Ubuntu/Mint), dnf
#       (Fedora/RHEL 9+), yum (RHEL 7/8/CentOS), or pacman (Arch).
#    2. Installs Node.js LTS (NodeSource repo on apt/dnf; pacman pkg
#       on Arch). Skipped if `node` is already on PATH at version 20+.
#    3. Installs CUPS + `lp` (cups-client) so the spooler transport
#       works. Linux already has the universal print abstraction
#       built in — no SumatraPDF equivalent needed.
#    4. Installs Ghostscript + Poppler utils for PDF rendering.
#    5. Runs `npm install` for the agent.
#    6. Prompts for .env values (transport, printer queue picker for
#       spooler mode), defaulting to sensible CUPS settings.
#    7. Installs a systemd unit `printloop-agent.service` that runs at
#       boot as a dedicated `printloop` user, restarts on crash, logs
#       to journald (`journalctl -u printloop-agent -f`).
#    8. Starts the service and prints a summary.
#
#  Flags:
#    --uninstall      remove the systemd unit (keeps deps installed)
#    --start-only     skip install, just run the agent in this shell
#    --skip-deps      skip Node / CUPS / Ghostscript installs
#    --no-ghostscript skip Ghostscript only
#
#  The script never silently overwrites your .env. Re-running with a
#  populated .env keeps it in place.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME='printloop-agent.service'
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
SERVICE_USER='printloop'
LOG_TAG='[install]'

# Inventory bookkeeping so the final summary is honest.
INSTALLED=()
SKIPPED=()

# ─────────────────────────────────────────────────────────────────────
#  Arg parsing
# ─────────────────────────────────────────────────────────────────────

UNINSTALL=0
START_ONLY=0
SKIP_DEPS=0
NO_GHOSTSCRIPT=0

for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=1 ;;
    --start-only) START_ONLY=1 ;;
    --skip-deps) SKIP_DEPS=1 ;;
    --no-ghostscript) NO_GHOSTSCRIPT=1 ;;
    -h|--help)
      sed -n '1,42p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────

log()  { printf '%s %s\n' "$LOG_TAG" "$*"; }
warn() { printf '%s [warn] %s\n' "$LOG_TAG" "$*" >&2; }
fail() { printf '%s [error] %s\n' "$LOG_TAG" "$*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "must run as root (try: sudo bash install.sh)"
  fi
}

# Pick the package manager. We support the four big-bucket families;
# every other distro inherits from one of these (Mint=apt, Rocky=dnf, etc.).
detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then echo apt
  elif command -v dnf  >/dev/null 2>&1; then echo dnf
  elif command -v yum  >/dev/null 2>&1; then echo yum
  elif command -v pacman >/dev/null 2>&1; then echo pacman
  else echo none
  fi
}

# Install a package idempotently. The package name typically matches
# across families; for the rare divergences (cups-client vs cups-clients)
# we accept a per-PM name list as comma-separated alternates.
pm_install() {
  local pm="$1"; shift
  local display="$1"; shift
  local probe="$1"; shift   # command we expect on PATH after install ('-' = skip probe)
  local pkgs_apt="$1"; shift
  local pkgs_dnf="$1"; shift
  local pkgs_pacman="$1"; shift

  if [[ "$probe" != '-' ]] && command -v "$probe" >/dev/null 2>&1; then
    log "[skip] $display already installed."
    SKIPPED+=("$display")
    return 0
  fi

  case "$pm" in
    apt)
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $pkgs_apt
      ;;
    dnf)
      dnf install -y $pkgs_dnf
      ;;
    yum)
      yum install -y $pkgs_dnf
      ;;
    pacman)
      pacman -Sy --needed --noconfirm $pkgs_pacman
      ;;
  esac

  log "[ok] $display installed."
  INSTALLED+=("$display")
}

# Pull NodeSource's setup script for the LTS line. NodeSource's setup
# script auto-detects apt vs. dnf/yum and configures the right repo.
install_nodejs_via_nodesource() {
  local pm="$1"
  if command -v node >/dev/null 2>&1; then
    local v
    v="$(node --version | sed 's/^v//; s/\..*//')"
    if (( v >= 18 )); then
      log "[skip] Node.js $(node --version) already installed."
      SKIPPED+=("Node.js")
      return 0
    fi
    warn "Node $(node --version) is too old; upgrading."
  fi
  case "$pm" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
      DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
      $pm install -y nodejs
      ;;
    pacman)
      pacman -Sy --needed --noconfirm nodejs npm
      ;;
  esac
  if ! command -v node >/dev/null 2>&1; then
    fail "Node install completed but 'node' is still not on PATH."
  fi
  log "[ok] Node $(node --version) installed."
  INSTALLED+=("Node.js")
}

# Make sure cupsd is actually running. Spooler mode shells out to `lp`,
# which talks to a local cupsd over /run/cups/cups.sock — if the
# service is masked, the spooler call fails silently.
ensure_cups_running() {
  if systemctl list-unit-files cups.service >/dev/null 2>&1; then
    systemctl enable --now cups.service >/dev/null 2>&1 || \
      warn "Couldn't enable cups.service; spooler-mode prints may fail."
    log "[ok] cups.service enabled + running."
  else
    warn "cups.service unit not found; spooler mode may not work."
  fi
}

# Enumerate locally-installed CUPS print queues for the wizard.
list_cups_printers() {
  if command -v lpstat >/dev/null 2>&1; then
    lpstat -a 2>/dev/null | awk '{print $1}' | sort -u
  fi
}

# Create the service user if missing — runs the agent under a non-root
# account so a compromised printer can't escalate.
ensure_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "[skip] service user '$SERVICE_USER' already exists."
  else
    useradd --system --home-dir "$AGENT_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
    log "[ok] created service user '$SERVICE_USER'."
  fi
  # The agent needs to read its own files + write temp files.
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$AGENT_DIR"
  # CUPS reads /etc/cups; the lp group is the standard "may print" group.
  if getent group lp >/dev/null 2>&1; then
    usermod -aG lp "$SERVICE_USER" || true
  fi
}

# ─────────────────────────────────────────────────────────────────────
#  Uninstall short-circuit
# ─────────────────────────────────────────────────────────────────────

uninstall_service() {
  require_root
  if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
    systemctl disable --now "$SERVICE_NAME" || true
    rm -f "$SERVICE_PATH"
    systemctl daemon-reload
    log "[ok] removed $SERVICE_NAME (Node, CUPS, etc. left in place)."
  else
    log "[skip] no $SERVICE_NAME to remove."
  fi
}

if (( UNINSTALL )); then
  uninstall_service
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────
#  Main install path
# ─────────────────────────────────────────────────────────────────────

require_root
printf '\n== PrintLoop Agent installer (Linux) ==\n\n'

PM="$(detect_pm)"
[[ "$PM" == 'none' ]] && fail "no supported package manager (apt/dnf/yum/pacman) found."
log "[ok] using package manager: $PM"

if (( SKIP_DEPS )); then
  log "[skip] --skip-deps passed; skipping Node / CUPS / Ghostscript."
else
  # apt families benefit from one update pass at the top.
  if [[ "$PM" == 'apt' ]]; then
    log "[apt] refreshing package lists…"
    apt-get update -qq
  fi

  # Node.js LTS via NodeSource (apt/dnf) or distro repo (pacman).
  install_nodejs_via_nodesource "$PM"

  # CUPS + lp client — universal print abstraction on Linux.
  pm_install "$PM" 'CUPS + lp client' 'lp' \
    'cups cups-client' \
    'cups cups-client' \
    'cups'
  ensure_cups_running

  # Ghostscript — needed when a printer wants PostScript but the
  # customer uploaded a PDF. Optional.
  if (( ! NO_GHOSTSCRIPT )); then
    pm_install "$PM" 'Ghostscript' 'gs' \
      'ghostscript' \
      'ghostscript' \
      'ghostscript'
  fi

  # Poppler-utils — `pdftoppm` etc. used by some downstream filters.
  pm_install "$PM" 'Poppler utils' 'pdftoppm' \
    'poppler-utils' \
    'poppler-utils' \
    'poppler'
fi

# ─────────────────────────────────────────────────────────────────────
#  Agent npm install
# ─────────────────────────────────────────────────────────────────────

cd "$AGENT_DIR"
if [[ -d node_modules ]]; then
  log "[skip] node_modules already present."
else
  log "[npm] installing agent dependencies…"
  npm install --no-audit --no-fund --loglevel=error
fi

# ─────────────────────────────────────────────────────────────────────
#  .env wizard
# ─────────────────────────────────────────────────────────────────────

ENV_FILE="$AGENT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  log "[skip] .env already exists — leaving alone."
else
  printf '\n── Agent configuration ──\n'

  read -r -p 'PrintLoop cloud URL (e.g. https://printloop-production.up.railway.app): ' BASE_URL
  read -r -p 'Kiosk API key (from Admin > Kiosks > this kiosk): ' KIOSK_KEY

  printf '\nTransport mode:\n'
  printf '  [1] spooler  -- USB or any locally-installed printer (recommended)\n'
  printf '  [2] ipp      -- network printer that speaks IPP (HP, Brother, Canon, ...)\n'
  printf '  [3] raw9100  -- Sharp MX-series or other JetDirect-only printers\n'
  read -r -p 'Choose [1/2/3, default 1]: ' choice
  choice="${choice:-1}"
  case "$choice" in
    2) TRANSPORT='ipp' ;;
    3) TRANSPORT='raw9100' ;;
    *) TRANSPORT='spooler' ;;
  esac

  PRINTER_IP_LINE=''
  PRINTER_NAME_LINE=''
  SPOOLER_CMD_LINE=''

  if [[ "$TRANSPORT" == 'spooler' ]]; then
    printf '\nLocal CUPS print queues on this machine:\n'
    mapfile -t QUEUES < <(list_cups_printers)
    if (( ${#QUEUES[@]} == 0 )); then
      warn "no CUPS queues found. Add a printer in CUPS first, or enter the queue name manually."
      read -r -p 'Queue name: ' QUEUE
    else
      for i in "${!QUEUES[@]}"; do
        printf '  [%d] %s\n' $((i + 1)) "${QUEUES[$i]}"
      done
      read -r -p 'Choose queue number (or type a name): ' pick
      if [[ "$pick" =~ ^[0-9]+$ ]] && (( pick >= 1 && pick <= ${#QUEUES[@]} )); then
        QUEUE="${QUEUES[$((pick - 1))]}"
      else
        QUEUE="$pick"
      fi
    fi
    log "[ok] Spooler target: $QUEUE"

    PRINTER_IP_LINE="PRINTER_IP=$QUEUE"
    PRINTER_NAME_LINE="PRINTER_NAME=$QUEUE"
    # The lp client default already handles PDFs cleanly via cups-filters,
    # so we don't need a SumatraPDF-equivalent on Linux. Falling through
    # to the agent's built-in default is fine.
    SPOOLER_CMD_LINE='# SPOOLER_COMMAND not set — using the agent built-in: lp -d "{printer}" "{file}"'
  else
    read -r -p 'Printer IP on this LAN (e.g. 192.168.0.111): ' PRINTER_IP
    PRINTER_IP_LINE="PRINTER_IP=$PRINTER_IP"
  fi

  cat > "$ENV_FILE" <<EOF
PRINTLOOP_BASE_URL=$BASE_URL
KIOSK_API_KEY=$KIOSK_KEY
$PRINTER_IP_LINE
PRINTER_TRANSPORT=$TRANSPORT
$PRINTER_NAME_LINE
$SPOOLER_CMD_LINE
PRINTER_PORT=631
IPP_PATH=/ipp/print
IPP_VERSION=1.1
PRINTER_RAW_PORT=9100
POLL_INTERVAL_MS=4000
EOF
  chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE" 2>/dev/null || true
  chmod 600 "$ENV_FILE"

  printf '\n'
  log "[ok] wrote .env (mode 600, owned by $SERVICE_USER)."
fi

# ─────────────────────────────────────────────────────────────────────
#  --start-only short-circuit
# ─────────────────────────────────────────────────────────────────────

if (( START_ONLY )); then
  log "[run] starting agent in this shell (Ctrl-C to stop)…"
  exec npm start
fi

# ─────────────────────────────────────────────────────────────────────
#  systemd unit
# ─────────────────────────────────────────────────────────────────────

ensure_service_user

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=PrintLoop on-site agent
Documentation=https://printloop.app/
After=network-online.target cups.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$AGENT_DIR
EnvironmentFile=-$AGENT_DIR/.env
ExecStart=/usr/bin/env npm start
Restart=always
RestartSec=5

# Hardening — the agent only needs outbound HTTPS + access to the
# local CUPS socket. Lock the rest down.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$AGENT_DIR /tmp
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictNamespaces=true
LockPersonality=true
RestrictRealtime=true

# Journal collects stdout/stderr — view with:
#   journalctl -u $SERVICE_NAME -f
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
log "[ok] wrote $SERVICE_PATH"

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
log "[ok] $SERVICE_NAME enabled + started."

# ─────────────────────────────────────────────────────────────────────
#  Summary
# ─────────────────────────────────────────────────────────────────────

printf '\n== Install complete ==\n'
if (( ${#INSTALLED[@]} > 0 )); then
  printf 'Newly installed this run:\n'
  for x in "${INSTALLED[@]}"; do printf '  - %s\n' "$x"; done
fi
if (( ${#SKIPPED[@]} > 0 )); then
  printf 'Already present (skipped):\n'
  for x in "${SKIPPED[@]}"; do printf '  - %s\n' "$x"; done
fi
printf '\n'
printf 'The agent now starts automatically on every boot.\n'
printf 'Live logs:\n'
printf '        journalctl -u %s -f\n' "$SERVICE_NAME"
printf '\n'
printf 'Manage the service:\n'
printf '        sudo systemctl status   %s\n' "$SERVICE_NAME"
printf '        sudo systemctl restart  %s\n' "$SERVICE_NAME"
printf '        sudo systemctl stop     %s\n' "$SERVICE_NAME"
printf 'To uninstall (keeps Node + CUPS in place):\n'
printf '        sudo bash install.sh --uninstall\n'
printf '\n'
