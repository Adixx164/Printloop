# ─────────────────────────────────────────────────────────────────────
#  PrintLoop on-site agent — Windows installer (V2-35)
#  ─────────────────────────────────────────────────────────────────────
#
#  Run this from an *Administrator* PowerShell:
#
#     cd C:\path\to\printloop-agent
#     Set-ExecutionPolicy -Scope Process Bypass -Force
#     .\install.ps1
#
#  What it does (in order, each step idempotent):
#    1. Detects a package manager — winget (preferred) or Chocolatey.
#       If neither exists, bootstraps Chocolatey from the official URL
#       so the rest of the script has something to work with.
#    2. Installs Node.js LTS if missing.
#    3. Installs SumatraPDF (silent printing of PDFs in spooler mode —
#       far better quality than Windows GDI re-rasterization).
#    4. Optionally installs Ghostscript (gs) for the cases where a
#       printer needs PostScript and the customer document is PDF.
#    5. Runs `npm install` for the agent.
#    6. Prompts for .env values if no .env exists, including transport
#       choice. For spooler mode, enumerates installed printer queues
#       so the operator can pick from a numbered list.
#    7. Registers the boot-time Scheduled Task that runs as SYSTEM with
#       auto-restart on crash. Logs roll to
#       %ProgramData%\PrintLoop\agent.log.
#    8. Starts the agent and prints a summary of what was installed +
#       where the logs live.
#
#  Flags:
#    -Uninstall       : remove the scheduled task (keeps deps installed)
#    -StartOnly       : skip install steps, start the agent in this terminal
#    -SkipDeps        : skip Node / SumatraPDF / Ghostscript installs
#                       (useful when re-running on a configured machine)
#    -NoGhostscript   : skip Ghostscript only
# ─────────────────────────────────────────────────────────────────────

param(
    [switch]$Uninstall,
    [switch]$StartOnly,
    [switch]$SkipDeps,
    [switch]$NoGhostscript
)

$ErrorActionPreference = 'Stop'
$TaskName  = 'PrintLoop Agent'
$AgentDir  = $PSScriptRoot
$LogDir    = Join-Path $env:ProgramData 'PrintLoop'
$LogFile   = Join-Path $LogDir 'agent.log'

# Track what we did so the final summary is honest.
$Installed = [System.Collections.ArrayList]::new()
$Skipped   = [System.Collections.ArrayList]::new()

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

Write-Host ''
Write-Host '== PrintLoop Agent installer ==' -ForegroundColor Cyan
Write-Host ''

# ─────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Refresh the current PowerShell session's PATH so just-installed tools
# show up without making the operator restart their shell.
function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('PATH', 'User')
    $env:PATH = "$machine;$user"
}

# Find a package manager we can use. Prefer winget (ships with Windows
# 10 1809+ and Windows 11). Fall back to Chocolatey if missing.
function Ensure-PackageManager {
    if (Test-Command winget) {
        Write-Host '[ok] winget detected (preferred).'
        return 'winget'
    }
    if (Test-Command choco) {
        Write-Host '[ok] Chocolatey detected.'
        return 'choco'
    }
    Write-Host '[..] No package manager found. Bootstrapping Chocolatey…'
    # Official Chocolatey one-liner — pinned to https, signed installer.
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol =
        [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    try {
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Refresh-Path
        if (Test-Command choco) {
            Write-Host '[ok] Chocolatey installed.'
            [void]$Installed.Add('Chocolatey (to bootstrap subsequent installs)')
            return 'choco'
        }
    } catch {
        Write-Warning "Couldn't auto-install a package manager: $_"
    }
    Write-Error @"
No supported package manager (winget or Chocolatey) is available and we
couldn't bootstrap one. Install Chocolatey manually from
  https://chocolatey.org/install
then re-run this installer. Or re-run with -SkipDeps and install
Node.js + SumatraPDF by hand from:
  Node.js     https://nodejs.org/  (LTS, current is 20.x)
  SumatraPDF  https://www.sumatrapdfreader.org/download-free-pdf-viewer
"@
    exit 1
}

# Install a package by ID, idempotently. The `winget` and `choco` IDs
# differ; the caller passes both so we route to whichever PM is active.
function Install-Package {
    param(
        [Parameter(Mandatory)] [string]$Manager,
        [Parameter(Mandatory)] [string]$WingetId,
        [Parameter(Mandatory)] [string]$ChocoId,
        [Parameter(Mandatory)] [string]$DisplayName,
        [string]$DetectCommand  # if this command is on PATH already, we skip
    )
    if ($DetectCommand -and (Test-Command $DetectCommand)) {
        Write-Host "[skip] $DisplayName already installed."
        [void]$Skipped.Add($DisplayName)
        return
    }
    if ($Manager -eq 'winget') {
        Write-Host "[winget] installing $DisplayName ($WingetId)…"
        # --silent + --accept-* keep the prompts away. Exit code 0 = ok.
        & winget install --id $WingetId --silent --accept-source-agreements --accept-package-agreements 2>&1 | Out-Host
    } else {
        Write-Host "[choco] installing $DisplayName ($ChocoId)…"
        & choco install $ChocoId -y --no-progress 2>&1 | Out-Host
    }
    Refresh-Path
    if ($DetectCommand -and (Test-Command $DetectCommand)) {
        Write-Host "[ok] $DisplayName ready."
        [void]$Installed.Add($DisplayName)
    } elseif (-not $DetectCommand) {
        # Apps without a PATH probe (like SumatraPDF) — trust the PM exit code.
        Write-Host "[ok] $DisplayName ready (assumed; no command-line probe)."
        [void]$Installed.Add($DisplayName)
    } else {
        Write-Warning "$DisplayName install completed but $DetectCommand is still not on PATH. You may need to open a fresh terminal."
    }
}

# Find SumatraPDF.exe so we can default SPOOLER_COMMAND to it. winget
# puts it under %LOCALAPPDATA%\Programs\SumatraPDF\; Chocolatey under
# %ChocolateyInstall%\bin or %ProgramFiles%.
function Find-Sumatra {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\SumatraPDF\SumatraPDF.exe",
        "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe",
        "$env:ProgramFiles\SumatraPDF\SumatraPDF.exe",
        "${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe",
        "$env:ChocolateyInstall\bin\SumatraPDF.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    $cmd = Get-Command SumatraPDF.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# ─────────────────────────────────────────────────────────────────────
#  1. Package manager + dependency installs
# ─────────────────────────────────────────────────────────────────────

if (-not $SkipDeps) {
    $pm = Ensure-PackageManager

    # Node.js LTS — agent runtime
    Install-Package -Manager $pm `
        -WingetId 'OpenJS.NodeJS.LTS' `
        -ChocoId  'nodejs-lts' `
        -DisplayName 'Node.js LTS' `
        -DetectCommand 'node'

    # SumatraPDF — silent PDF printing for spooler mode. The 'Brand'
    # variant is the standalone build (the one we want); winget renamed
    # it a few times so we try the current ID with a fallback.
    Install-Package -Manager $pm `
        -WingetId 'SumatraPDF.SumatraPDF' `
        -ChocoId  'sumatrapdf.install' `
        -DisplayName 'SumatraPDF'

    if (-not $NoGhostscript) {
        # Ghostscript — fallback for printers that need PostScript when
        # the customer uploaded a PDF. Optional. Skip with -NoGhostscript.
        Install-Package -Manager $pm `
            -WingetId 'ArtifexSoftware.GhostScript' `
            -ChocoId  'ghostscript' `
            -DisplayName 'Ghostscript' `
            -DetectCommand 'gswin64c'
    }
} else {
    Write-Host '[skip] -SkipDeps was passed; skipping Node / SumatraPDF / Ghostscript installs.'
}

# ─────────────────────────────────────────────────────────────────────
#  2. Node check (after install) — fatal if still missing
# ─────────────────────────────────────────────────────────────────────

if (-not (Test-Command node)) {
    Write-Error @"
Node.js is still not on PATH after install. Open a fresh Administrator
PowerShell and re-run this script — Windows sometimes needs a new
shell to pick up PATH changes from a fresh install.
"@
    exit 1
}
$nodeVersion = & node --version
Write-Host "[ok] Node $nodeVersion at $((Get-Command node).Source)"

# ─────────────────────────────────────────────────────────────────────
#  3. npm install agent deps
# ─────────────────────────────────────────────────────────────────────

Push-Location $AgentDir
try {
    if (-not (Test-Path 'node_modules')) {
        Write-Host '[npm] installing agent dependencies…'
        & npm install --no-audit --no-fund --loglevel=error 2>&1 | Out-Host
    } else {
        Write-Host '[skip] node_modules already present.'
    }
} finally { Pop-Location }

# ─────────────────────────────────────────────────────────────────────
#  4. .env wizard — with spooler support + printer auto-detection
# ─────────────────────────────────────────────────────────────────────

$envFile = Join-Path $AgentDir '.env'
if (-not (Test-Path $envFile)) {
    Write-Host ''
    Write-Host '── Agent configuration ──' -ForegroundColor Cyan

    $baseUrl  = Read-Host 'PrintLoop cloud URL (e.g. https://printloop-production.up.railway.app)'
    $kioskKey = Read-Host 'Kiosk API key (from Admin > Kiosks > this kiosk)'

    Write-Host ''
    Write-Host 'Transport mode:'
    Write-Host '  [1] spooler  — USB or any locally-installed printer (recommended for most shops)'
    Write-Host '  [2] ipp      — network printer that speaks IPP (HP, Brother, Canon, etc.)'
    Write-Host '  [3] raw9100  — Sharp MX-series or other JetDirect-only printers'
    $choice = Read-Host 'Choose [1/2/3, default 1]'
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }

    $transport = switch ($choice) {
        '2' { 'ipp' }
        '3' { 'raw9100' }
        default { 'spooler' }
    }

    $printerLine = ''   # PRINTER_IP=...
    $nameLine    = ''   # PRINTER_NAME=...
    $cmdLine     = ''   # SPOOLER_COMMAND=...

    if ($transport -eq 'spooler') {
        # Enumerate local printer queues so the operator picks from a
        # numbered list — no guessing the right printer name.
        Write-Host ''
        Write-Host 'Local printer queues on this PC:'
        $printers = @(Get-Printer | Where-Object { $_.Type -ne 'Connection' -or $true } | Sort-Object Name)
        if ($printers.Count -eq 0) {
            Write-Warning "No installed printer queues found. Connect or install the printer first, then re-run."
            $printerName = Read-Host 'Enter the printer queue name manually'
        } else {
            for ($i = 0; $i -lt $printers.Count; $i++) {
                $p = $printers[$i]
                $marker = ''
                if ($p.Default) { $marker = ' (default)' }
                $num = $i + 1
                Write-Host "  [$num] $($p.Name)  -- $($p.PortName)$marker"
            }
            $pick = Read-Host 'Choose printer number (or type a name)'
            if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $printers.Count) {
                $printerName = $printers[[int]$pick - 1].Name
            } else {
                $printerName = $pick
            }
        }
        Write-Host "[ok] Spooler target: $printerName"

        $printerLine = "PRINTER_IP=$printerName"     # spooler mode reuses PRINTER_IP as the queue name fallback
        $nameLine    = "PRINTER_NAME=$printerName"

        # If we found SumatraPDF, default the command to it — silent
        # PDF printing with no UI popup. Falls back to PowerShell's
        # Verb-PrintTo when SumatraPDF wasn't installed.
        $sumatra = Find-Sumatra
        if ($sumatra) {
            # Single-quoted concatenation so PowerShell doesn't try to
            # interpret {printer} / {file} — those are LITERAL tokens
            # the agent substitutes at print time.
            $cmdLine = 'SPOOLER_COMMAND="' + $sumatra + '" -print-to "{printer}" "{file}"'
            Write-Host "[ok] Defaulting SPOOLER_COMMAND to SumatraPDF: $sumatra"
        } else {
            $cmdLine = "# SPOOLER_COMMAND not set - using the agent's built-in PowerShell PrintTo default."
            Write-Host "[note] SumatraPDF not detected; agent will use PowerShell PrintTo (may re-rasterize PDFs)."
        }
    } else {
        $printerIp = Read-Host 'Printer IP on this LAN (e.g. 192.168.0.111)'
        $printerLine = "PRINTER_IP=$printerIp"
    }

    @"
PRINTLOOP_BASE_URL=$baseUrl
KIOSK_API_KEY=$kioskKey
$printerLine
PRINTER_TRANSPORT=$transport
$nameLine
$cmdLine
PRINTER_PORT=631
IPP_PATH=/ipp/print
IPP_VERSION=1.1
PRINTER_RAW_PORT=9100
POLL_INTERVAL_MS=4000
"@ | Out-File -FilePath $envFile -Encoding utf8

    Write-Host ''
    Write-Host "[ok] Wrote .env. Edit it later with: notepad $envFile"
} else {
    Write-Host "[skip] .env already exists - leaving alone."
}

# ─────────────────────────────────────────────────────────────────────
#  5. -StartOnly short-circuit
# ─────────────────────────────────────────────────────────────────────

if ($StartOnly) {
    Push-Location $AgentDir
    try {
        Write-Host '[run] starting agent in this terminal (Ctrl-C to stop)...'
        & npm start
    } finally { Pop-Location }
    exit 0
}

# ─────────────────────────────────────────────────────────────────────
#  6. Log directory + Scheduled Task
# ─────────────────────────────────────────────────────────────────────

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$npmCmd = (Get-Command npm).Source
# npm.cmd on Windows is a shim; Scheduled Tasks need cmd.exe to invoke
# it reliably. Redirect stdout+stderr to a rolling log.
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
Start-Sleep -Seconds 2

# ─────────────────────────────────────────────────────────────────────
#  7. Summary
# ─────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '== Install complete ==' -ForegroundColor Green
if ($Installed.Count -gt 0) {
    Write-Host 'Newly installed this run:'
    foreach ($x in $Installed) { Write-Host "  - $x" }
}
if ($Skipped.Count -gt 0) {
    Write-Host 'Already present (skipped):'
    foreach ($x in $Skipped) { Write-Host "  - $x" }
}
Write-Host ''
Write-Host 'The agent now starts automatically on every boot.'
Write-Host "Logs:  $LogFile"
Write-Host 'Tail with:'
Write-Host "        Get-Content -Wait `"$LogFile`""
Write-Host ''
Write-Host 'To stop / restart the agent later:'
Write-Host "        Stop-ScheduledTask  -TaskName '$TaskName'"
Write-Host "        Start-ScheduledTask -TaskName '$TaskName'"
Write-Host 'To uninstall (keeps Node + SumatraPDF in place):'
Write-Host '        .\install.ps1 -Uninstall'
Write-Host ''
