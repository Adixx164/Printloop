# Render worker — Debian base because OpenPrinting cups-filters is
# packaged natively. Multi-stage: build TS in node:22, run in slim
# debian with ghostscript + cups-filters tools installed.

FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --omit=dev=false
COPY src ./src
RUN npx tsc

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        ghostscript \
        cups-filters-core-drivers \
        printer-driver-cups-pdf \
        nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
ENV WORKER_CONCURRENCY=2

CMD ["node", "dist/index.js"]
