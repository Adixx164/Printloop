#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# THROWAWAY SPIKE — Option A render validation (docs/OPENPRINTING-INTEGRATION.md)
#
# Renders a PDF to the printer's NATIVE language (PostScript + PCL-XL) with
# colour / resolution / duplex / copies baked in, so we can print each on the
# Sharp MX-5112N and pick the language for the real `renderNative` step.
#
# It needs Linux print tools (Ghostscript required; ipptransform optional).
# This box has none, so run it where they exist:
#   • Docker (any host):  see 01-backend/scripts/_spike.Dockerfile
#   • Railway:            gs is already installed; deploy the nixpacks change
#                         for ipptransform/cups-filters.
#
# Usage:   _spike-render.sh <input.pdf> [out-dir]
# Example: _spike-render.sh "/work/MUTUAL 4 - integrated.pdf" /work/spike-out
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

IN="${1:?usage: _spike-render.sh <input.pdf> [out-dir]}"
OUT="${2:-./spike-out}"
DPI="${DPI:-600}"            # print-quality high
MEDIA="${MEDIA:-iso_a4_210x297mm}"
COPIES="${COPIES:-1}"
mkdir -p "$OUT"
base="$(basename "$IN" .pdf)"

have() { command -v "$1" >/dev/null 2>&1; }
say()  { printf '  %s\n' "$*"; }

echo "Input : $IN"
echo "Output: $OUT  (dpi=$DPI media=$MEDIA copies=$COPIES)"
echo

# ── Ghostscript paths (always available; the zero-extra-deps baseline) ──────
if have gs; then
  echo "[gs] PostScript (vector, keeps text crisp) — ps2write"
  # Colour, N dpi
  gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=ps2write -r"$DPI" \
     -sOutputFile="$OUT/${base}-color-${DPI}.ps" "$IN"
  say "${base}-color-${DPI}.ps"
  # Grayscale (print-color-mode=monochrome), N dpi
  gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=ps2write -r"$DPI" \
     -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray \
     -sOutputFile="$OUT/${base}-bw-${DPI}.ps" "$IN"
  say "${base}-bw-${DPI}.ps"
  # Grayscale + DUPLEX + COPIES baked via setpagedevice (proves sides/copies)
  gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=ps2write -r"$DPI" \
     -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray \
     -sOutputFile="$OUT/${base}-bw-${DPI}-duplex-x${COPIES}.ps" \
     -c "<</Duplex true /Tumble false /NumCopies $COPIES>> setpagedevice" -f "$IN"
  say "${base}-bw-${DPI}-duplex-x${COPIES}.ps"

  echo "[gs] PCL-XL (raster, fully deterministic) — pxlmono / pxlcolor"
  gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pxlcolor -r"$DPI" \
     -sOutputFile="$OUT/${base}-color-${DPI}.pcl" "$IN"
  say "${base}-color-${DPI}.pcl"
  gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pxlmono -r"$DPI" -dDuplex=true \
     -sOutputFile="$OUT/${base}-bw-${DPI}-duplex.pcl" "$IN"
  say "${base}-bw-${DPI}-duplex.pcl"
else
  echo "[gs] Ghostscript not found — cannot produce the baseline outputs." >&2
fi

echo
# ── ipptransform path (richer: drives the cups-filters chain by IPP attrs) ──
if have ipptransform; then
  echo "[ipptransform] PCL via the OpenPrinting filter chain (IPP attributes)"
  ipptransform -i application/pdf -m application/vnd.hp-PCL \
    -o "print-color-mode=monochrome print-quality=5 sides=two-sided-long-edge copies=${COPIES} media=${MEDIA}" \
    "$IN" > "$OUT/${base}-ipptransform-bw.pcl" && say "${base}-ipptransform-bw.pcl"
  ipptransform -i application/pdf -m application/vnd.hp-PCL \
    -o "print-color-mode=color print-quality=5 media=${MEDIA}" \
    "$IN" > "$OUT/${base}-ipptransform-color.pcl" && say "${base}-ipptransform-color.pcl"
else
  echo "[ipptransform] not installed — skipped (gs outputs above are enough to pick a language)."
fi

echo
echo "Done. Send the .ps and .pcl files to the Sharp (raw 9100), e.g.:"
echo "  for f in \"$OUT\"/*.ps \"$OUT\"/*.pcl; do nc -q1 <printer-ip> 9100 < \"\$f\"; done"
echo "Compare: colour fidelity, sharpness at ${DPI}dpi, duplex, and the signature."
