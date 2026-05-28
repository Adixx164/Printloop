# ─────────────────────────────────────────────────────────────────────
#  PrintLoop on-site agent — Windows installer
#  ─────────────────────────────────────────────────────────────────────
#
#  Run this from an *Administrator* PowerShell:
#
#     cd C:\path\to\printloop-agent
#     Set-ExecutionPolicy -Scope Process Bypass -Force
#     .\install.ps1
#
#  What it does:
#    1. Verifies Node.js is on PATH (errors if missing — we don't
#       silently install runtimes).
#    2. Runs `npm install` (idempotent).
#    3. Prompts for the .env values if no .env exists yet, otherwise
#       leaves it alone.
#    4. Registers a Windows Scheduled Task ("PrintLoop Agent") that
#       starts the agent at boot and restarts it on crash. Logs go to
#       %ProgramData%\PrintLoop\agent.log.
#
#  To uninstall:    .\install.ps1 -Uninstall
#  To just start:   .\install.ps1 -StartOnly
# ─────────────────────────────────────────────────────────────────────

param(
    [switch]$Uninstall,
    [switch]$StartOnly
)

$ErrorActionPreference = 'Stop'
$TaskName  = 'PrintLoop Agent'
$AgentDir  = $PSScriptRoot
$LogDir    = Join-Path $env:ProgramData 'PrintLoop'
$LogFile   = Join-Path $LogDir 'agent.log'

function Require-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error 'This script must be run from an Administrator PowerShell.'
        exit 1
    }
}

function Uninstall-Task {
    Require-Admin
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[ok] Removed scheduled task '$TaskName'."
    } else {
        Write-Host "[skip] No scheduled task '$TaskName' to remove."
    }
}

if ($Uninstall) {
    Uninstall-Task
    exit 0
}

Require-Admin

# ── 1. Node check ────────────────────────────────────────────────────
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'Node.js is not installed (or not on PATH). Install Node 20+ from https://nodejs.org/ and re-run.'
    exit 1
}
$nodeVersion = & node --version
Write-Host "[ok] Node $nodeVersion at $($node.Source)"

# ── 2. Install deps ──────────────────────────────────────────────────
Push-Location $AgentDir
try {
    if (-not (Test-Path 'node_modules')) {
        Write-Host '[npm] installing dependencies…'
        npm install --no-audit --no-fund --loglevel=error
    } else {
        Write-Host '[skip] node_modules already present.'
    }
} finally { Pop-Location }

# ── 3. .env wizard ───────────────────────────────────────────────────
$envFile = Join-Path $AgentDir '.env'
if (-not (Test-Path $envFile)) {
    Write-Host ''
    Write-Host '── Agent configuration ──' -ForegroundColor Cyan
    $baseUrl   = Read-Host 'PrintLoop cloud URL (e.g. https://printloop-production.up.railway.app)'
    $kioskKey  = Read-Host 'Kiosk API key (from Admin → Kiosks → this kiosk)'
    $printerIp = Read-Host 'Printer IP on this LAN (e.g. 192.168.0.111)'
    $transport = Read-Host 'Transport: "raw9100" (Sharp MX-series) or "ipp" (default IPP) [raw9100]'
    if ([string]::IsNullOrWhiteSpace($transport)) { $transport = 'raw9100' }

    @"
PRINTLOOP_BASE_URL=$baseUrl
KIOSK_API_KEY=$kioskKey
PRINTER_IP=$printerIp
PRINTER_TRANSPORT=$transport
PRINTER_PORT=631
IPP_PATH=/ipp/print
IPP_VERSION=1.1
PRINTER_RAW_PORT=9100
POLL_INTERVAL_MS=4000
"@ | Out-File -FilePath $envFile -Encoding utf8

    Write-Host "[ok] Wrote .env. Edit it later with notepad $envFile"
} else {
    Write-Host "[skip] .env already exists — leaving alone."
}

if ($StartOnly) {
    Push-Location $AgentDir
    try {
        Write-Host '[run] starting agent in this terminal (Ctrl-C to stop)…'
        npm start
    } finally { Pop-Location }
    exit 0
}

# ── 4. Log dir ───────────────────────────────────────────────────────
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# ── 5. Scheduled task ────────────────────────────────────────────────
$npmCmd = (Get-Command npm).Source
# npm.cmd on Windows is a shim; Scheduled Tasks need cmd.exe to invoke it
# reliably. We redirect stdout+stderr to a rolling log.
$action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument "/c npm start >> `"$LogFile`" 2>&1" `
    -WorkingDirectory $AgentDir

$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'PrintLoop on-site agent: polls cloud backend and dispatches jobs to the local LAN printer.' | Out-Null

Write-Host "[ok] Registered Scheduled Task '$TaskName' (runs as SYSTEM, restarts on crash)."

Start-ScheduledTask -TaskName $TaskName
Write-Host "[ok] Started the task. Tail the log with:"
Write-Host "        Get-Content -Wait `"$LogFile`""
Write-Host ''
Write-Host 'Install complete. The agent will now start automatically on every boot.'
