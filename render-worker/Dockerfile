# Render Worker Dockerfile
# Builds a container with cups-filters/libcupsfilters for PDF -> PWG-Raster conversion

FROM node:20-bookworm-slim AS base

# Install system dependencies for cups-filters and Ghostscript
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    libcups2 \
    libcupsfilters1 \
    libcupsimage2 \
    libfontconfig1 \
    libfreetype6 \
    libjpeg62-turbo \
    libpng16-16 \
    libtiff6 \
    libpaper1 \
    libavahi-client3 \
    libavahi-common3 \
    libexpat1 \
    libxml2 \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY dist ./dist
COPY .env.example .env

# Create temp directory
RUN mkdir -p /tmp/printloop-render

# Non-root user
RUN useradd -m -u 1000 renderworker && chown -R renderworker:renderworker /app /tmp/printloop-render
USER renderworker

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('net').connect(6379, 'redis').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

EXPOSE 3000

CMD ["node", "dist/worker.js"]