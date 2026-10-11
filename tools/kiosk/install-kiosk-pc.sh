#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  PrintLoop — unified kiosk-PC installer (Linux, V2-35)
#  ─────────────────────────────────────────────────────────────────────
#
#  Mirror of install-kiosk-pc.ps1 for Debian/Ubuntu, Fedora/RHEL,
#  CentOS, and Arch. ONE entrypoint, two modes:
#
#    [Default]   Full kiosk — Electron .AppImage / .deb / .rpm from
#                printloop-kiosk-app/dist/. Falls through to the agent
#                path automatically if no Linux build is in dist/.
#    [--agent-only]  Headless agent — runs as a systemd service under
#                a dedicated 'printloop' user. No Electron, no UI.
#
#  Runtime dependencies installed (both modes):
#    • CUPS + cups-client (provides `lp`) — universal Linux print layer
#    • Ghostscript (skip with --no-ghostscript) — PDF→PostScript fallback
#    • poppler-utils — for PDF inspection downstream of cups-filters
#  Added only in --agent-only mode (Electron bundles its own runtime):
#    • Node.js LTS (via NodeSource on apt/dnf; distro repo on pacman)
#
#  Quick start (single shop):
#     sudo bash install-kiosk-pc.sh
#
#  Flags:
#    --uninstall        remove the kiosk app + systemd unit
#    --agent-only       headless path (no Electron UI)
#    --build-app        build printloop-kiosk-app for Linux first
#                       (requires Node 20+; produces .AppImage in dist/)
#    --installer-path P explicit path to an existing .AppImage/.deb/.rpm
#    --skip-deps        skip CUPS / Ghostscript / Node installs
#    --no-ghostscript   skip Ghostscript only
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$REPO_ROOT/printloop-kiosk-app"
AGENT_DIR="$REPO_ROOT/printloop-agent"

UNINSTALL=0
AGENT_ONLY=0
BUILD_APP=0
INSTALLER_PATH=''
SKIP_DEPS=0
NO_GHOSTSCRIPT=0

for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=1 ;;
    --agent-only) AGENT_ONLY=1 ;;
    --build-app) BUILD_APP=1 ;;
    --installer-path=*) INSTALLER_PATH="${arg#*=}" ;;
    --installer-path)
      shift; INSTALLER_PATH="${1-}";
      ;;
    --skip-deps) SKIP_DEPS=1 ;;
    --no-ghostscript) NO_GHOSTSCRIPT=1 ;;
    -h|--help)
      sed -n '1,38p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

INSTALLED=()
SKIPPED=()
log()  { printf '[install] %s\n' "$*"; }
warn() { printf '[install] [warn] %s\n' "$*" >&2; }
fail() { printf '[install] [error] %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "must run as root (try: sudo bash install-kiosk-pc.sh)"
  fi
}

detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then echo apt
  elif command -v dnf  >/dev/null 2>&1; then echo dnf
  elif command -v yum  >/dev/null 2>&1; then echo yum
  elif command -v pacman >/dev/null 2>&1; then echo pacman
  else echo none
  fi
}

# Idempotent package install with probe.
pm_install() {
  local pm="$1"; shift
  local display="$1"; shift
  local probe="$1"; shift     # command on PATH after install; '-' to skip
  local pkgs_apt="$1"; shift
  local pkgs_dnf="$1"; shift
  local pkgs_pacman="$1"; shift

  if [[ "$probe" != '-' ]] && command -v "$probe" >/dev/null 2>&1; then
    log "[skip] $display already installed."
    SKIPPED+=("$display"); return 0
  fi
  case "$pm" in
    apt)    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $pkgs_apt ;;
    dnf)    dnf install -y $pkgs_dnf ;;
    yum)    yum install -y $pkgs_dnf ;;
    pacman) pacman -Sy --needed --noconfirm $pkgs_pacman ;;
  esac
  log "[ok] $display installed."
  INSTALLED+=("$display")
}

install_nodejs() {
  local pm="$1"
  if command -v node >/dev/null 2>&1; then
    local v
    v="$(node --version | sed 's/^v//; s/\..*//')"
    if (( v >= 18 )); then
      log "[skip] Node.js $(node --version) already installed."
      SKIPPED+=('Node.js'); return 0
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
  command -v node >/dev/null 2>&1 || fail "Node install completed but 'node' is still not on PATH."
  log "[ok] Node $(node --version) installed."
  INSTALLED+=('Node.js')
}

ensure_cups_running() {
  if systemctl list-unit-files cups.service >/dev/null 2>&1; then
    systemctl enable --now cups.service >/dev/null 2>&1 || \
      warn "couldn't enable cups.service; spooler-mode prints may fail."
    log "[ok] cups.service enabled + running."
  else
    warn "cups.service unit not found; spooler mode may not work."
  fi
}

# ─────────────────────────────────────────────────────────────────────
#  Mode 1 — Find a Linux kiosk build
# ─────────────────────────────────────────────────────────────────────

find_installer() {
  if [[ -n "$INSTALLER_PATH" && -f "$INSTALLER_PATH" ]]; then
    echo "$INSTALLER_PATH"; return 0
  fi
  local dist="$APP_DIR/dist"
  [[ -d "$dist" ]] || return 1
  # Prefer AppImage (most portable), then .deb (on apt distros),
  # then .rpm (on dnf/yum/pacman? pacman has no rpm but the user
  # might have built one).
  local found
  found="$(ls -1 "$dist"/*.AppImage 2>/dev/null | head -n1 || true)"
  [[ -z "$found" ]] && found="$(ls -1 "$dist"/*.deb 2>/dev/null | head -n1 || true)"
  [[ -z "$found" ]] && found="$(ls -1 "$dist"/*.rpm 2>/dev/null | head -n1 || true)"
  [[ -n "$found" ]] && echo "$found"
}

install_kiosk_appimage() {
  local src="$1"
  local target="/opt/printloop-kiosk/PrintLoopKiosk.AppImage"
  mkdir -p /opt/printloop-kiosk
  cp -f "$src" "$target"
  chmod +x "$target"
  # Desktop entry so it shows up in the launcher.
  cat > /usr/share/applications/printloop-kiosk.desktop <<EOF
[Desktop Entry]
Name=PrintLoop Kiosk
Comment=PrintLoop on-site kiosk + agent
Exec=$target
Icon=printloop
Terminal=false
Type=Application
Categories=Office;Utility;
StartupNotify=true
EOF
  log "[ok] Installed PrintLoop Kiosk AppImage at $target"
  INSTALLED+=('PrintLoop Kiosk (Electron AppImage)')
}

install_kiosk_deb() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$1"
  INSTALLED+=('PrintLoop Kiosk (Electron .deb)')
}

install_kiosk_rpm() {
  case "$1" in
    *) if command -v dnf >/dev/null 2>&1; then dnf install -y "$1"; else rpm -ivh "$1"; fi ;;
  esac
  INSTALLED+=('PrintLoop Kiosk (Electron .rpm)')
}

install_kiosk_mode() {
  if (( BUILD_APP )); then
    [[ -d "$APP_DIR" ]] || fail "Missing $APP_DIR — is the repo intact?"
    command -v node >/dev/null 2>&1 || fail "--build-app requested but node isn't on PATH."
    log "[build] running 'npm install && npm run build -- --linux' in $APP_DIR…"
    (cd "$APP_DIR" && [[ -d node_modules ]] || npm install --no-audit --no-fund --loglevel=error)
    (cd "$APP_DIR" && npx electron-builder --linux)
  fi

  local exe
  exe="$(find_installer || true)"
  if [[ -z "$exe" ]]; then
    warn "No Linux kiosk build found in $APP_DIR/dist/ — falling through to --agent-only mode."
    warn "(To get the full kiosk UI on Linux, run with --build-app on a Node-equipped box.)"
    install_agent_mode
    return 0
  fi
  log "[install] using $exe"
  case "$exe" in
    *.AppImage) install_kiosk_appimage "$exe" ;;
    *.deb)      install_kiosk_deb "$exe" ;;
    *.rpm)      install_kiosk_rpm "$exe" ;;
    *) fail "Unrecognised installer file: $exe" ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────
#  Mode 2 — Headless agent (delegates to printloop-agent/install.sh)
# ─────────────────────────────────────────────────────────────────────

install_agent_mode() {
  [[ -d "$AGENT_DIR" ]] || fail "Missing $AGENT_DIR — the standalone agent isn't in this repo."
  [[ -f "$AGENT_DIR/install.sh" ]] || fail "Missing $AGENT_DIR/install.sh."

  # We already installed CUPS/Ghostscript above; tell the inner script
  # to skip its own dep pass. It still handles the env wizard, the
  # systemd unit, the printloop user, and starting the service.
  log "[delegate] handing off to printloop-agent/install.sh…"
  bash "$AGENT_DIR/install.sh" --skip-deps
}

# ─────────────────────────────────────────────────────────────────────
#  Uninstall
# ─────────────────────────────────────────────────────────────────────

uninstall_all() {
  # Kiosk app
  if [[ -f /opt/printloop-kiosk/PrintLoopKiosk.AppImage ]]; then
    rm -rf /opt/printloop-kiosk
    rm -f /usr/share/applications/printloop-kiosk.desktop
    log "[ok] Removed AppImage install at /opt/printloop-kiosk."
  fi
  if dpkg -l 2>/dev/null | awk '{print $2}' | grep -q '^printloop-kiosk$'; then
    DEBIAN_FRONTEND=noninteractive apt-get remove -y printloop-kiosk || true
  fi
  if rpm -q printloop-kiosk >/dev/null 2>&1; then
    rpm -e printloop-kiosk || true
  fi
  # Agent
  if [[ -f "$AGENT_DIR/install.sh" ]]; then
    bash "$AGENT_DIR/install.sh" --uninstall || true
  fi
  log "[ok] Uninstall complete (deps like Node, CUPS left in place)."
}

# ─────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────

require_root

printf '\n== PrintLoop kiosk-PC installer (Linux) ==\n\n'

if (( UNINSTALL )); then
  uninstall_all
  exit 0
fi

PM="$(detect_pm)"
[[ "$PM" == 'none' ]] && fail "no supported package manager (apt/dnf/yum/pacman) found."
log "[ok] using package manager: $PM"

if (( ! SKIP_DEPS )); then
  if [[ "$PM" == 'apt' ]]; then
    log "[apt] refreshing package lists…"
    apt-get update -qq
  fi

  # CUPS + lp — needed for BOTH the Electron kiosk and the agent.
  pm_install "$PM" 'CUPS + lp client' 'lp' \
    'cups cups-client' \
    'cups cups-client' \
    'cups'
  ensure_cups_running

  if (( ! NO_GHOSTSCRIPT )); then
    pm_install "$PM" 'Ghostscript' 'gs' \
      'ghostscript' \
      'ghostscript' \
      'ghostscript'
  fi

  pm_install "$PM" 'Poppler utils' 'pdftoppm' \
    'poppler-utils' \
    'poppler-utils' \
    'poppler'

  # Node only needed for --agent-only (Electron bundles its own).
  if (( AGENT_ONLY )) || (( BUILD_APP )); then
    install_nodejs "$PM"
  fi
fi

if (( AGENT_ONLY )); then
  install_agent_mode
else
  install_kiosk_mode
fi

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
if (( AGENT_ONLY )); then
  printf 'Headless agent installed.\n'
  printf 'Live logs:        journalctl -u printloop-agent.service -f\n'
  printf 'Manage:           sudo systemctl {status|restart|stop} printloop-agent.service\n'
  printf 'Uninstall:        sudo bash install-kiosk-pc.sh --uninstall\n'
else
  printf 'Full kiosk installed.\n'
  printf 'Launch:           click "PrintLoop Kiosk" in the apps menu\n'
  printf '                  (or run /opt/printloop-kiosk/PrintLoopKiosk.AppImage directly)\n'
  printf 'First launch shows a setup wizard for cloud URL, kiosk key, printer.\n'
  printf 'Uninstall:        sudo bash install-kiosk-pc.sh --uninstall\n'
fi
printf '\n'
