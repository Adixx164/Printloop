# ─────────────────────────────────────────────────────────────────────
#  build-installer-exe.ps1 — Compile install.ps1 to a single .exe (V2-35)
#  ─────────────────────────────────────────────────────────────────────
#
#  This is run ONCE by a developer (you) to produce
#  `PrintLoopAgentInstaller.exe`. Shop owners then double-click that
#  .exe — no PowerShell knowledge required.
#
#  The wrapper uses ps2exe (https://github.com/MScholtes/PS2EXE), a
#  widely-used PowerShell-to-exe compiler. It installs ps2exe from the
#  PowerShell Gallery if missing, then runs it with:
#    - --requireAdmin (UAC prompt on launch)
#    - --noConsole = $false (we WANT the console — the installer is
#      interactive: it asks for the cloud URL, kiosk key, printer choice)
#    - --noOutput  = $false (we want stdout visible)
#    - icon embedded if `installer.ico` is present
#
#  Usage:
#     Set-ExecutionPolicy -Scope Process Bypass -Force
#     .\build-installer-exe.ps1
#
#  Output:  PrintLoopAgentInstaller.exe (next to install.ps1)
#
#  The produced .exe is self-contained: it bundles the PowerShell script
#  bytes inside a Windows executable header. End users do NOT need
#  PowerShell expertise — they just right-click → Run as administrator.
#  (The exe itself spawns powershell.exe internally; PowerShell 5.1
#  ships with every Windows 10/11.)
# ─────────────────────────────────────────────────────────────────────

[CmdletBinding()]
param(
    [string]$OutputName = 'PrintLoopAgentInstaller.exe',
    [string]$IconPath   = ''
)

$ErrorActionPreference = 'Stop'

$Here       = $PSScriptRoot
$SourceFile = Join-Path $Here 'install.ps1'
$OutputFile = Join-Path $Here $OutputName

if (-not (Test-Path $SourceFile)) {
    Write-Error "install.ps1 not found at $SourceFile"
    exit 1
}

# Default icon path falls back to a project-shipped icon if present.
if (-not $IconPath) {
    $candidate = Join-Path $Here 'installer.ico'
    if (Test-Path $candidate) { $IconPath = $candidate }
}

Write-Host '== Building PrintLoopAgentInstaller.exe ==' -ForegroundColor Cyan
Write-Host "Source : $SourceFile"
Write-Host "Output : $OutputFile"
if ($IconPath) { Write-Host "Icon   : $IconPath" }
Write-Host ''

# ─── 1. Ensure ps2exe is available ────────────────────────────────────
$ps2exe = Get-Module -ListAvailable -Name ps2exe |
          Sort-Object Version -Descending | Select-Object -First 1

if (-not $ps2exe) {
    Write-Host '[ps2exe] not installed — pulling from PowerShell Gallery…'
    # CurrentUser scope so the build doesn't need admin. NuGet provider
    # may need installing on a fresh PS5.1 machine.
    if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    }
    Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
    $ps2exe = Get-Module -ListAvailable -Name ps2exe |
              Sort-Object Version -Descending | Select-Object -First 1
    if (-not $ps2exe) {
        Write-Error 'ps2exe install failed. Manually run: Install-Module ps2exe -Scope CurrentUser'
        exit 1
    }
}
Import-Module ps2exe -Force
Write-Host "[ok] ps2exe $($ps2exe.Version) ready."

# ─── 2. Compile ───────────────────────────────────────────────────────
$args = @{
    InputFile     = $SourceFile
    OutputFile    = $OutputFile
    Title         = 'PrintLoop Agent Installer'
    Description   = 'Sets up PrintLoop on the shop computer'
    Company       = 'PrintLoop'
    Product       = 'PrintLoop Agent'
    Version       = '2.35.0.0'
    RequireAdmin  = $true     # spawns UAC on double-click
    LongPaths     = $true
    ExitOnCancel  = $true
    Verbose       = $false
}
if ($IconPath) { $args['IconFile'] = $IconPath }

# Remove any stale exe first so a half-compiled file can't masquerade.
if (Test-Path $OutputFile) { Remove-Item -Force $OutputFile }

Invoke-PS2EXE @args

if (-not (Test-Path $OutputFile)) {
    Write-Error 'ps2exe completed but the output file is missing.'
    exit 1
}

$sizeKb = [int]((Get-Item $OutputFile).Length / 1024)
Write-Host ''
Write-Host "[ok] Built $OutputName ($sizeKb KB)" -ForegroundColor Green
Write-Host ''
Write-Host 'Distribute this file to shops alongside the agent folder:'
Write-Host "  - $OutputName"
Write-Host '  - agent.ts, package.json, .env.example (the rest of printloop-agent/)'
Write-Host ''
Write-Host 'Shop owners double-click the .exe — UAC prompts, then the same'
Write-Host 'wizard from install.ps1 runs in a console window. No PowerShell'
Write-Host 'expertise required on their end.'
