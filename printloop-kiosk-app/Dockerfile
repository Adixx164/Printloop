# PrintLoop Kiosk App Dockerfile
# Builds a container for Linux kiosk deployment (Raspberry Pi, x86 mini-PC)

FROM node:20-bookworm-slim AS base

# Install system dependencies for CUPS, IPP, and printing
RUN apt-get update && apt-get install -y --no-install-recommends \
    cups \
    cups-browsed \
    cups-filters \
    ghostscript \
    libcups2 \
    libcupsfilters1 \
    libcupsimage2 \
    ipp-usb \
    avahi-daemon \
    libnss-mdns \
    dbus \
    && rm -rf /var/lib/apt/lists/*

# Configure CUPS for local (no daemon) mode
RUN mkdir -p /etc/cups /var/spool/cups /var/cache/cups /var/log/cups \
    && echo "Port 631" > /etc/cups/cupsd.conf \
    && echo "Listen localhost:631" >> /etc/cups/cupsd.conf \
    && echo "Browsing Off" >> /etc/cups/cupsd.conf \
    && echo "DefaultAuthType None" >> /etc/cups/cupsd.conf \
    && echo "<Location />" >> /etc/cups/cupsd.conf \
    && echo "  Order allow,deny" >> /etc/cups/cupsd.conf \
    && echo "  Allow all" >> /etc/cups/cupsd.conf \
    && echo "</Location>" >> /etc/cups/cupsd.conf

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY dist ./dist
COPY public ./public
COPY .env.example .env

# Create kiosk user
RUN useradd -m -u 1000 kiosk && chown -R kiosk:kiosk /app
USER kiosk

# Expose CUPS port (for local IPP)
EXPOSE 631

# Start script
COPY --chown=kiosk:kiosk docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]