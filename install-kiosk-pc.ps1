# ─────────────────────────────────────────────────────────────────────
#  PrintLoop — kiosk PC installer (Windows)
#  ─────────────────────────────────────────────────────────────────────
#
#  THIS SCRIPT IS OPTIONAL — for unattended / multi-PC rollouts only.
#
#  For a single PC, the easier path is to double-click the .exe:
#
#     PrintLoop Kiosk Setup 1.0.0.exe
#
#  The .exe is fully self-contained: NSIS installer + Electron kiosk
#  UI + embedded cloud-polling agent + embedded printer dispatcher.
#  First launch shows a setup wizard (cloud URL, kiosk key, printer
#  IP, transport) — no PowerShell, no Node install, no Scheduled Task,
#  no .env file.
#
#  ──────────────────────────────────────────────────────────────────
#
#  Use THIS script when:
#    • Deploying to many PCs unattended (CI / RMM / Group Policy)
#    • You want silent install (no NSIS wizard click-through)
#    • You want to build the .exe and install it in one go
#
#  Run from Administrator PowerShell:
#
#     cd C:\path\to\printloop
#     Set-ExecutionPolicy -Scope Process Bypass -Force
#     .\install-kiosk-pc.ps1
#
#  Switches:
#    -Uninstall      Remove the installed PrintLoop Kiosk app.
#    -BuildApp       Build the Setup.exe from source before installing
#                    (requires Node.js 20+ on this PC).
#    -InstallerPath  Path to a pre-built kiosk Setup.exe. If omitted
#                    the script looks under printloop-kiosk-app\dist\.
# ─────────────────────────────────────────────────────────────────────

param(
    [switch]$Uninstall,
    [switch]$BuildApp,
    [string]$InstallerPath = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = $PSScriptRoot
$AppDir   = Join-Path $RepoRoot 'printloop-kiosk-app'

function Require-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error 'Run this from an Administrator PowerShell.'
        exit 1
    }
}

function Find-Installer {
    if ($InstallerPath -and (Test-Path $InstallerPath)) { return (Resolve-Path $InstallerPath).Path }
    $distDir = Join-Path $AppDir 'dist'
    if (Test-Path $distDir) {
        $exe = Get-ChildItem -Path $distDir -Filter 'PrintLoop Kiosk Setup*.exe' -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($exe) { return $exe.FullName }
    }
    return $null
}

function Uninstall-KioskApp {
    $hives = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($h in $hives) {
        if (-not (Test-Path $h)) { continue }
        Get-ChildItem $h | ForEach-Object {
            $p = Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue
            if ($p.DisplayName -eq 'PrintLoop Kiosk' -and $p.UninstallString) {
                Write-Host "[uninstall] $($p.DisplayName) — $($p.UninstallString)"
                $cmd = $p.UninstallString.Trim('"')
                $args = '/S /allusers'
                if ($cmd -match '^"?(.+?)"?\s*(.*)$') { $cmd = $matches[1]; $args = ($matches[2] + ' /S /allusers').Trim() }
                Start-Process -FilePath $cmd -ArgumentList $args -Wait
            }
        }
    }
}

Require-Admin
Write-Host ''
Write-Host '╔══════════════════════════════════════════════════════════╗'
Write-Host '║  PrintLoop — kiosk PC installer                         ║'
Write-Host '╚══════════════════════════════════════════════════════════╝'
Write-Host ''

if ($Uninstall) {
    Uninstall-KioskApp
    Write-Host ''
    Write-Host '── Uninstall complete. ──' -ForegroundColor Yellow
    exit 0
}

if ($BuildApp) {
    if (-not (Test-Path $AppDir)) {
        Write-Error "Missing folder: $AppDir  (is the repo intact?)"
        exit 1
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error '-BuildApp requested but Node.js is not on PATH. Install Node 20+ first.'
        exit 1
    }
    Write-Host '[build] running `npm install && npm run build` in printloop-kiosk-app …'
    Push-Location $AppDir
    try {
        if (-not (Test-Path 'node_modules')) {
            npm install --no-audit --no-fund --loglevel=error
        }
        npm run build
    } finally { Pop-Location }
}

$exe = Find-Installer
if (-not $exe) {
    Write-Warning 'No PrintLoop Kiosk Setup*.exe found.'
    Write-Host '  Build it once on a Node-equipped PC:'
    Write-Host '       cd printloop-kiosk-app'
    Write-Host '       npm install && npm run build'
    Write-Host '  Then re-run this installer with -InstallerPath ".\printloop-kiosk-app\dist\PrintLoop Kiosk Setup 1.0.0.exe"'
    Write-Host '  …or pass -BuildApp to build it now (requires Node).'
    exit 1
}

Write-Host "[install] running $exe (silent NSIS install)…"
Start-Process -FilePath $exe -ArgumentList '/S' -Wait
Write-Host '[ok] PrintLoop Kiosk installed.'

Write-Host ''
Write-Host '╔══════════════════════════════════════════════════════════╗'
Write-Host '║  Install complete.                                       ║'
Write-Host '╚══════════════════════════════════════════════════════════╝'
Write-Host ''
Write-Host 'Start Menu → "PrintLoop Kiosk" or use the desktop shortcut.'
Write-Host 'First launch shows a setup wizard:'
Write-Host '    1. Paste the PrintLoop cloud URL'
Write-Host '    2. Paste the kiosk API key (Admin → Kiosks)'
Write-Host '    3. Enter the printer IP + pick IPP or raw-9100'
Write-Host '    4. Click "Test cloud" + "Test printer" — both should turn green'
Write-Host '    5. Save & launch'
Write-Host ''
Write-Host 'After that, the app auto-starts on every login and polls'
Write-Host 'the cloud for jobs. No PowerShell required again.'
Write-Host ''
Write-Host 'Re-open the setup wizard later with Ctrl+Shift+S.'
Write-Host 'Quit the app with Ctrl+Shift+Q.'
