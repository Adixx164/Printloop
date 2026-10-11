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

# ─────────────────────────────────────────────────────────────────────
#  Auto-Discovery Helpers (NEW)
# ─────────────────────────────────────────────────────────────────────

# Detect USB printers on Linux
detect_usb_printers() {
  local printers=()
  
  # Check USB printer devices via lsusb
  if command -v lsusb >/dev/null 2>&1; then
    while IFS= read -r line; do
      if [[ "$line" =~ Printer|Print ]]; then
        # Extract device info
        local bus=$(echo "$line" | awk '{print $2}')
        local dev=$(echo "$line" | awk '{print $4}' | sed 's/:$//')
        local desc=$(echo "$line" | cut -d' ' -f7-)
        printers+=("USB:$bus:$dev:$desc")
      fi
    done < <(lsusb 2>/dev/null)
  fi
  
  # Check USB printer devices via /sys
  for dev in /sys/bus/usb/devices/*/; do
    if [[ -f "$dev/bInterfaceClass" ]]; then
      local class=$(cat "$dev/bInterfaceClass" 2>/dev/null)
      if [[ "$class" == "07" ]]; then  # 07 = Printer class
        local devpath=$(basename "$dev")
        printers+=("USB:sys:$devpath")
      fi
    done
  
  # Check lp devices (parallel/USB printers)
  for dev in /dev/usb/lp* /dev/lp* 2>/dev/null; do
    if [[ -e "$dev" ]]; then
      printers+=("LP:$dev")
    fi
  done
  
  printf '%s\n' "${printers[@]}"
}

# Discover network printers on Linux
discover_network_printers() {
  local printers=()
  
  # 1. Avahi/Bonjour discovery (IPP printers)
  if command -v avahi-browse >/dev/null 2>&1; then
    while IFS= read -r line; do
      if [[ "$line" =~ = ]]; then
        local name=$(echo "$line" | cut -d'=' -f2 | cut -d'[' -f1)
        local host=$(echo "$line" | grep -oP 'address = \K[^ ]+' | head -1)
        local port=$(echo "$line" | grep -oP 'port = \K[0-9]+' | head -1)
        if [[ -n "$host" && -n "$port" ]]; then
          printers+=("IPP|$name|$host|$port|mDNS")
        fi
      fi
    done < <(avahi-browse -r -t _ipp._tcp 2>/dev/null | grep -E '^(hostname|address|port)' | paste - - - | sed 's/\t/=/g')
  fi
  
  # 2. CUPS discovered printers
  if command -v lpstat >/dev/null 2>&1; then
    while IFS= read -r queue; do
      printers+=("CUPS|$queue|local|631|CUPS")
    done < <(lpstat -a 2>/dev/null | awk '{print $1}' | sort -u)
  fi
  
  # 3. Common port scan for network printers
  local local_ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1)
  if [[ -n "$local_ip" ]]; then
    local base_ip=$(echo "$local_ip" | sed 's/\.[0-9]*$//')
    local common_ports=(631 9100 515)
    local ports_info=("631:ipp:/ipp/print" "9100:raw9100:" "515:lpd:")
    
    for ip in $(seq 1 254); do
      local target_ip="$base_ip.$ip"
      for port_info in "${ports_info[@]}"; do
        local port="${port_info%%:*}"
        local transport="${port_info#*:}"
        transport="${transport%%:*}"
        local path="${port_info##*:}"
        
        timeout 0.2 bash -c "cat < /dev/null > /dev/tcp/$target_ip/$port" 2>/dev/null && {
          printers+=("SCAN|Printer at $target_ip|$target_ip|$port|$transport|$path|PortScan")
          break  # Found printer on this IP
        }
      done
    done
  fi
  
  printf '%s\n' "${printers[@]}"
}

# Auto-detect best transport for a printer
select_best_transport() {
  local printer_info="$1"
  local type=$(echo "$printer_info" | cut -d'|' -f1)
  
  case "$type" in
    USB|LP)
      echo "spooler|USB/Local printer detected; spooler mode gives best quality"
      ;;
    CUPS)
      echo "ipp|CUPS queue detected; IPP gives full feature support"
      ;;
    IPP)
      echo "ipp|IPP-capable network printer detected"
      ;;
    SCAN)
      local transport=$(echo "$printer_info" | cut -d'|' -f5)
      case "$transport" in
        ipp) echo "ipp|IPP-capable network printer detected" ;;
        raw9100) echo "raw9100|JetDirect-only printer detected" ;;
        lpd) echo "lpd|LPD-capable printer detected" ;;
        *) echo "ipp|Network printer detected; defaulting to IPP" ;;
      esac
      ;;
    *)
      echo "ipp|Defaulting to IPP"
      ;;
  esac
}

# Auto-configure printer with zero prompts
auto_configure_printer() {
  printf '\n%s %s\n' "$LOG_TAG" 'Auto-Discovering Printers...' >&2
  
  local usb_printers=($(detect_usb_printers))
  local net_printers=($(discover_network_printers))
  
  local all_printers=("${usb_printers[@]}" "${net_printers[@]}")
  
  if (( ${#all_printers[@]} == 0 )); then
    warn "No printers detected. Please connect a printer (USB or network) and re-run."
    return 1
  fi
  
  log "Found ${#all_printers[@]} printer(s):"
  for p in "${all_printers[@]}"; do
    log "  - $p"
  done
  
  # Auto-select: prefer CUPS queues, then USB, then first network
  local selected=""
  for p in "${all_printers[@]}"; do
    if [[ "$p" == CUPS* ]]; then
      selected="$p"
      break
    fi
  done
  if [[ -z "$selected" ]]; then
    for p in "${all_printers[@]}"; do
      if [[ "$p" == USB:* || "$p" == LP:* ]]; then
        selected="$p"
        break
      fi
    done
  done
  if [[ -z "$selected" ]]; then
    selected="${all_printers[0]}"
  fi
  
  local transport_info=$(select_best_transport "$selected")
  local transport=$(echo "$transport_info" | cut -d'|' -f1)
  local reason=$(echo "$transport_info" | cut -d'|' -f2)
  
  local name=$(echo "$selected" | cut -d'|' -f2)
  log "[ok] Auto-selected: $name → $transport ($reason)"
  
  # Output configuration
  cat <<EOF
AUTO_CONFIG=1
TRANSPORT=$transport
PRINTER_NAME=$name
SELECTED_INFO=$selected
REASON=$reason
EOF
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

# ─────────────────────────────────────────────────────────────────────
#  .env wizard — AUTO-DISCOVERY with manual fallback
# ─────────────────────────────────────────────────────────────────────

ENV_FILE="$AGENT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  log "[skip] .env already exists — leaving alone."
else
  printf '\n── Agent configuration ──\n'

  read -r -p 'PrintLoop cloud URL (e.g. https://printloop-production.up.railway.app): ' BASE_URL
  read -r -p 'Kiosk API key (from Admin > Kiosks > this kiosk): ' KIOSK_KEY

  # Try auto-discovery first
  printf '\n%s\n' 'Attempting automatic printer discovery...' >&2
  if auto_config=$(auto_configure_printer 2>/dev/null); then
    eval "$auto_config"
    if [[ "$AUTO_CONFIG" == "1" ]]; then
      log "Using auto-discovered configuration: $TRANSPORT for $PRINTER_NAME ($REASON)"
      
      PRINTER_IP_LINE="PRINTER_IP=$PRINTER_NAME"
      PRINTER_NAME_LINE="PRINTER_NAME=$PRINTER_NAME"
      SPOOLER_CMD_LINE='# SPOOLER_COMMAND not set — using the agent built-in: lp -d "{printer}" "{file}"'
      
      if [[ "$TRANSPORT" == "spooler" ]]; then
        SPOOLER_CMD_LINE='# SPOOLER_COMMAND not set — using the agent built-in: lp -d "{printer}" "{file}"'
      fi
    else
      # Fallback to manual mode
      printf '\n%s\n' 'Auto-discovery failed or no printers found. Falling back to manual configuration...' >&2
      printf '\nTransport mode:\n'
      printf '  [1] spooler  -- USB or any locally-installed printer (recommended)\n'
      printf '  [2] ipp      -- network printer that speaks IPP (HP, Brother, Canon, ...)\n'
      printf '  [3] raw9100  -- Sharp MX-series or other JetDirect-only printers\n'
      printf '  [4] printnode -- PrintNode cloud proxy (works behind NAT/firewall)\n'
      printf '  [5] lpd       -- Legacy LPD/LPR protocol (Kyocera, Ricoh, Unix print servers)\n'
      printf '  [6] email     -- Email-to-print (HP ePrint, Canon, Epson)\n'
      read -r -p 'Choose [1/2/3/4/5/6, default 1]: ' choice
      choice="${choice:-1}"
      case "$choice" in
        2) TRANSPORT='ipp' ;;
        3) TRANSPORT='raw9100' ;;
        4) TRANSPORT='printnode' ;;
        5) TRANSPORT='lpd' ;;
        6) TRANSPORT='email' ;;
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
        SPOOLER_CMD_LINE='# SPOOLER_COMMAND not set — using the agent built-in: lp -d "{printer}" "{file}"'
      elif [[ "$TRANSPORT" == 'printnode' ]]; then
        read -r -p 'PrintNode API Key: ' PN_KEY
        read -r -p 'PrintNode Printer ID: ' PN_PRINTER_ID
        PRINTER_IP_LINE="PRINTNODE_API_KEY=$PN_KEY\nPRINTNODE_PRINTER_ID=$PN_PRINTER_ID"
      elif [[ "$TRANSPORT" == 'email' ]]; then
        read -r -p 'Printer Email Address (e.g. printer123@hpeprint.com): ' EMAIL_ADDR
        PRINTER_IP_LINE="EMAIL_TO_PRINT_ADDRESS=$EMAIL_ADDR"
        read -r -p 'SMTP Host (e.g. smtp.gmail.com): ' SMTP_HOST
        read -r -p 'SMTP Port (e.g. 587): ' SMTP_PORT
        read -r -p 'SMTP Username: ' SMTP_USER
        read -r -p 'SMTP Password: ' SMTP_PASS
        read -r -p 'From Address (e.g. PrintLoop <noreply@printloop.ng>): ' SMTP_FROM
        SPOOLER_CMD_LINE="SMTP_HOST=$SMTP_HOST\nSMTP_PORT=$SMTP_PORT\nSMTP_USER=$SMTP_USER\nSMTP_PASS=$SMTP_PASS\nSMTP_FROM=$SMTP_FROM"
      else
        read -r -p 'Printer IP on this LAN (e.g. 192.168.0.111): ' PRINTER_IP
        PRINTER_IP_LINE="PRINTER_IP=$PRINTER_IP"
      fi
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
