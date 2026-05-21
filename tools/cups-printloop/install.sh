#!/usr/bin/env bash
# Install the PrintLoop CUPS backend on Linux/macOS and add a print queue.
#
# Usage:
#   sudo ./install.sh                               # interactive
#   sudo PRINTLOOP_HOST=printloop.ng \
#        PRINTLOOP_TOKEN=...hex... \
#        QUEUE_NAME=PrintLoop \
#        ./install.sh                               # unattended
#
# Mints the queue using a generic PostScript PPD that CUPS ships with — your
# OS print dialog will then offer "PrintLoop" alongside any local printer.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Re-run with sudo (needs root to write into /usr/lib/cups/backend)."
  exit 1
fi

# Detect the CUPS backend dir. Linux uses /usr/lib/cups/backend, macOS
# /usr/libexec/cups/backend, some distros use /usr/libexec/cups/backend too.
BACKEND_DIR=""
for d in /usr/lib/cups/backend /usr/libexec/cups/backend; do
  [ -d "$d" ] && BACKEND_DIR="$d" && break
done
if [ -z "$BACKEND_DIR" ]; then
  echo "Couldn't find a CUPS backend directory. Is CUPS installed?"
  exit 1
fi
echo "→ CUPS backend dir: $BACKEND_DIR"

# Copy the backend script in place. CUPS requires it to be owned by root,
# mode 0700 (Linux) or 0755 (macOS / older CUPS) — 0755 works for both.
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
install -m 0755 "$SRC_DIR/printloop" "$BACKEND_DIR/printloop"
echo "→ Installed $BACKEND_DIR/printloop"

# Reload CUPS so it picks up the new backend.
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart cups || systemctl restart cupsd || true
elif command -v launchctl >/dev/null 2>&1; then
  launchctl kickstart -k system/org.cups.cupsd || true
fi
echo "→ CUPS reloaded"

# Gather queue config (interactive unless env-set).
QUEUE_NAME="${QUEUE_NAME:-PrintLoop}"
PRINTLOOP_HOST="${PRINTLOOP_HOST:-}"
PRINTLOOP_TOKEN="${PRINTLOOP_TOKEN:-}"

if [ -z "$PRINTLOOP_HOST" ]; then
  printf 'PrintLoop host (e.g. printloop.ng or localhost:4000): '
  read -r PRINTLOOP_HOST
fi
if [ -z "$PRINTLOOP_TOKEN" ]; then
  printf 'Your PrintLoop print token (rotate one at /account/print-token): '
  stty -echo 2>/dev/null || true
  read -r PRINTLOOP_TOKEN
  stty echo 2>/dev/null || true
  echo ""
fi

if [ -z "$PRINTLOOP_HOST" ] || [ -z "$PRINTLOOP_TOKEN" ]; then
  echo "Host and token are both required."
  exit 1
fi

DEVICE_URI="printloop://$PRINTLOOP_HOST/?token=$PRINTLOOP_TOKEN"

# Pick a PPD. CUPS ships `everywhere` and `drv:///sample.drv/generic.ppd` —
# the latter is universally present. Driverless ("everywhere") would need
# an actual IPP-Everywhere printer to query, so we use the generic PPD.
PPD_ARG="-m drv:///sample.drv/generic.ppd"

# Create or update the queue.
if lpstat -p "$QUEUE_NAME" >/dev/null 2>&1; then
  echo "→ Updating existing CUPS queue '$QUEUE_NAME'"
  lpadmin -p "$QUEUE_NAME" -E -v "$DEVICE_URI"
else
  echo "→ Creating CUPS queue '$QUEUE_NAME'"
  # shellcheck disable=SC2086
  lpadmin -p "$QUEUE_NAME" -E -v "$DEVICE_URI" $PPD_ARG -L "PrintLoop"
fi
cupsaccept "$QUEUE_NAME" || true
cupsenable "$QUEUE_NAME" || true

echo ""
echo "Done. From any app you can now choose '$QUEUE_NAME' in the print dialog."
echo "After printing, look at the print queue (or run \`lpq -P $QUEUE_NAME -l\`)"
echo "to see the PrintLoop release code; enter it at any PrintLoop kiosk."
