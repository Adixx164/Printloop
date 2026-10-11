# PrintLoop SaaS v2 — Production Deployment Script
# Run: pwsh tools/deploy-prod.ps1

param(
    [string]$Platform = "railway",  # railway, fly, render
    [string]$Environment = "production"
)

$ErrorActionPreference = "Stop"

Write-Host "=== PrintLoop SaaS v2 Production Deploy ===" -ForegroundColor Green
Write-Host "Platform: $Platform" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Cyan

# Check required tools
$tools = @("docker", "git", "pnpm")
foreach ($tool in $tools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool not found: $tool"
        exit 1
    }
}

# Build all Docker images
Write-Host "`n--- Building Docker Images ---" -ForegroundColor Cyan
docker build -t printloop/api:latest ./01-backend
docker build -t printloop/render-worker:latest ./render-worker
docker build -t printloop/kiosk-app:latest ./printloop-kiosk-app

if ($Platform -eq "railway") {
    Write-Host "`n--- Deploying to Railway ---" -ForegroundColor Cyan
    
    # Railway uses railway CLI or GitHub integration
    # This assumes you have railway CLI installed and logged in
    if (Get-Command railway -ErrorAction SilentlyContinue) {
        railway up --detach
    } else {
        Write-Warning "Railway CLI not found. Push to GitHub and Railway will auto-deploy."
        Write-Host "Make sure these env vars are set in Railway dashboard:"
        Get-Content .env.production.example | ForEach-Object {
            if ($_ -match '^[A-Z_]+=') { Write-Host "  $_" }
        }
    }
}
elseif ($Platform -eq "fly") {
    Write-Host "`n--- Deploying to Fly.io ---" -ForegroundColor Cyan
    
    if (Get-Command flyctl -ErrorAction SilentlyContinue) {
        flyctl deploy --config ./fly.toml
    } else {
        Write-Warning "Flyctl not found. Create fly.toml and run 'flyctl deploy'."
    }
}
elseif ($Platform -eq "render") {
    Write-Host "`n--- Deploying to Render ---" -ForegroundColor Cyan
    
    Write-Host "Render uses render.yaml for infrastructure as code."
    Write-Host "Push to GitHub and Render will auto-deploy from render.yaml."
}
else {
    Write-Error "Unknown platform: $Platform"
    exit 1
}

# Verify deployment
Write-Host "`n--- Post-Deployment Verification ---" -ForegroundColor Cyan
$apiUrl = Read-Host "Enter your production API URL (e.g., https://api.printloop.app)"
try {
    $health = Invoke-RestMethod -Uri "$apiUrl/health" -TimeoutSec 10
    if ($health.status -eq 'ok') {
        Write-Host "✅ Health check passed" -ForegroundColor Green
    } else {
        Write-Warning "Health check returned unexpected status: $($health.status)"
    }
} catch {
    Write-Error "Health check failed: $_"
}

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Verify all services in Railway/Fly/Render dashboard"
Write-Host "  2. Run end-to-end test: npx tsx tools/e2e-render-test.ts"
Write-Host "  3. Configure custom domains in Cloudflare dashboard"
Write-Host "  4. Set up monitoring (Sentry, BetterStack, PostHog)"