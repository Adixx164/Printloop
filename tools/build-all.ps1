# Build all PrintLoop v2 Infrastructure components
# Run from repository root: pwsh tools/build-all.ps1

Write-Host "=== Building PrintLoop v2 Infrastructure ===" -ForegroundColor Green

# Build render worker
Write-Host "`n--- Building render-worker ---" -ForegroundColor Cyan
Set-Location render-worker
npm install
npm run build
Write-Host "Render worker built successfully" -ForegroundColor Green

Write-Host "Building render-worker Docker image..." -ForegroundColor Cyan
docker build -t printloop/render-worker:latest .
Write-Host "Render worker Docker image built" -ForegroundColor Green

# Build kiosk app
Write-Host "`n--- Building printloop-kiosk-app ---" -ForegroundColor Cyan
Set-Location ../printloop-kiosk-app
npm install
npm run build
Write-Host "Kiosk app built successfully" -ForegroundColor Green

Write-Host "Building kiosk app Docker image..." -ForegroundColor Cyan
docker build -t printloop/kiosk-app:latest .
Write-Host "Kiosk app Docker image built" -ForegroundColor Green

# Package Windows installer
Write-Host "`n--- Packaging Windows installer ---" -ForegroundColor Cyan
npm run package
Write-Host "Windows installer created in dist/" -ForegroundColor Green

Write-Host "`n=== All builds completed successfully ===" -ForegroundColor Green
Write-Host "`nArtifacts:" -ForegroundColor Yellow
Write-Host "  - render-worker: dist/worker.js (Docker: printloop/render-worker:latest)"
Write-Host "  - kiosk-app (Linux): Docker image printloop/kiosk-app:latest"
Write-Host "  - kiosk-app (Windows): dist/PrintLoop Kiosk Setup x.x.x.exe"