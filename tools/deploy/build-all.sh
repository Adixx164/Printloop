#!/bin/bash
set -e

echo "=== Building PrintLoop v2 Infrastructure ==="

# Build render worker
echo ""
echo "--- Building render-worker ---"
cd render-worker
npm install
npm run build
echo "Render worker built successfully"

# Build render worker Docker image
echo "Building render-worker Docker image..."
docker build -t printloop/render-worker:latest .
echo "Render worker Docker image built"

# Build kiosk app
echo ""
echo "--- Building printloop-kiosk-app ---"
cd ../printloop-kiosk-app
npm install
npm run build
echo "Kiosk app built successfully"

# Build kiosk app Docker image (Linux)
echo "Building kiosk app Docker image..."
docker build -t printloop/kiosk-app:latest .
echo "Kiosk app Docker image built"

# Package Windows installer
echo ""
echo "--- Packaging Windows installer ---"
npm run package
echo "Windows installer created in dist/"

echo ""
echo "=== All builds completed successfully ==="
echo ""
echo "Artifacts:"
echo "  - render-worker: dist/worker.js (Docker: printloop/render-worker:latest)"
echo "  - kiosk-app (Linux): Docker image printloop/kiosk-app:latest"
echo "  - kiosk-app (Windows): dist/PrintLoop Kiosk Setup x.x.x.exe"