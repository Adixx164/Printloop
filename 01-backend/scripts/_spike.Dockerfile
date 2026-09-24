# THROWAWAY SPIKE image — Option A render validation.
# (docs/OPENPRINTING-INTEGRATION.md). Renders a PDF to PostScript + PCL with
# print attributes baked in, so we can print both on the Sharp and pick a
# language. Self-contained: no host setup beyond Docker.
#
# Build (context = this scripts/ dir):
#   docker build -f 01-backend/scripts/_spike.Dockerfile -t plspike 01-backend/scripts
#
# Run (mount a folder of PDFs as /work; outputs land in /work/spike-out):
#   docker run --rm -v "/c/Users/abdur/Downloads:/work" plspike \
#     "/work/MUTUAL 4 - integrated.pdf" /work/spike-out
#
FROM debian:stable-slim

# ghostscript + poppler-utils are the certain baseline; ippsample + cups-filters
# are the richer OpenPrinting chain (best-effort — the gs path works without them).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ghostscript poppler-utils \
 && (apt-get install -y --no-install-recommends ippsample cups-filters \
       || echo "NOTE: ippsample/cups-filters unavailable in this base — using the Ghostscript fallback only.") \
 && rm -rf /var/lib/apt/lists/*

COPY _spike-render.sh /usr/local/bin/spike-render
RUN chmod +x /usr/local/bin/spike-render

ENTRYPOINT ["/usr/local/bin/spike-render"]
