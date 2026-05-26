#!/usr/bin/env bash
# PrintLoop backend start script for Railway (or any container host).
#
# Brings Tailscale up so the backend can reach printers that live on a
# private LAN (i.e. the Sharp MX-5112N at 192.168.0.111 — which is on
# the user's home network, not Railway's). The user installs Tailscale
# as a subnet router at home advertising 192.168.0.0/24; this script
# joins the same tailnet from the Railway container.
#
# Required env var:
#   TS_AUTHKEY   reusable, ephemeral Tailscale auth key
#                (https://login.tailscale.com/admin/settings/keys)
#
# Falls back to running without Tailscale if TS_AUTHKEY is unset —
# useful for local builds + the e2e test scripts.
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
TS_DIR="$DATA_DIR/tailscale"
TS_VERSION="${TS_VERSION:-1.78.1}"
TS_SOCKET="/tmp/tailscaled.sock"

if [ -n "$TS_AUTHKEY" ]; then
  mkdir -p "$DATA_DIR"

  # ── 1. Install Tailscale (cached on the persistent volume) ──────────
  if [ ! -x "$TS_DIR/tailscaled" ] || [ ! -x "$TS_DIR/tailscale" ]; then
    echo "[tailscale] installing $TS_VERSION…"
    mkdir -p "$TS_DIR"
    cd "$TS_DIR"
    # Static x86_64 binary — works in any Linux container without apt.
    curl -fsSL \
      "https://pkgs.tailscale.com/stable/tailscale_${TS_VERSION}_amd64.tgz" \
      | tar xz --strip-components=1
    cd -
  fi

  # ── 2. Start tailscaled ─────────────────────────────────────────────
  # `--tun=userspace-networking` is the safest mode for containers that
  # don't expose /dev/net/tun. Tailscale provides a SOCKS5 proxy
  # (--socks5-server) and a transparent HTTP proxy so the Node app can
  # route outbound traffic through the tailnet without kernel TUN.
  echo "[tailscale] starting tailscaled (userspace mode)…"
  "$TS_DIR/tailscaled" \
    --tun=userspace-networking \
    --state="$DATA_DIR/tailscaled.state" \
    --socket="$TS_SOCKET" \
    --socks5-server=127.0.0.1:1055 \
    --outbound-http-proxy-listen=127.0.0.1:1055 \
    --port=0 \
    > "$DATA_DIR/tailscaled.log" 2>&1 &
  TS_PID=$!

  # Wait until the unix socket is live (max 10s) so `tailscale up`
  # below doesn't race.
  for i in $(seq 1 20); do
    [ -S "$TS_SOCKET" ] && break
    sleep 0.5
  done

  # ── 3. Bring the link up + accept subnet routes ─────────────────────
  echo "[tailscale] joining tailnet…"
  "$TS_DIR/tailscale" --socket="$TS_SOCKET" up \
    --authkey="$TS_AUTHKEY" \
    --hostname=printloop-railway \
    --accept-routes \
    --accept-dns=false \
    --reset

  # Show what we got — useful when debugging in logs.
  "$TS_DIR/tailscale" --socket="$TS_SOCKET" status || true
  "$TS_DIR/tailscale" --socket="$TS_SOCKET" ip -4 || true

  # ── 4. Hint our SOCKS5-aware code to route through Tailscale ───────
  # The raw9100 transport in ipp.service.ts checks TS_SOCKS5_PROXY and
  # opens its socket via tailscale's local SOCKS5 listener when set.
  # We deliberately DON'T export HTTP_PROXY / HTTPS_PROXY — that would
  # also route npm + axios + node-fetch through tailscale, which a)
  # breaks npm's registry calls in this container and b) isn't what
  # we want (the cloud backend's other outbound traffic should go
  # direct to the public internet, not through the home tailnet).
  export TS_SOCKS5_PROXY="127.0.0.1:1055"
else
  echo "[tailscale] TS_AUTHKEY unset — skipping Tailscale (running unconnected)"
fi

# ── 5. Start the actual app ────────────────────────────────────────────
# Bypass `npx` because it does a registry probe each invocation; with
# Tailscale's SOCKS5 proxy in the env this would race and fail. Run
# the locally-installed tsx binary directly.
echo "[printloop] starting Express server…"
# ./node_modules/.bin/tsx is the npm bin shim — call it directly
# rather than via `node` (the shim is a shell script, not JS).
exec ./node_modules/.bin/tsx server.ts
