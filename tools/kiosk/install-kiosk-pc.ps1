# ─────────────────────────────────────────────────────────────────────
#  PrintLoop — unified kiosk-PC installer (Windows, V2-35)
#  ─────────────────────────────────────────────────────────────────────
#
#  ONE script for every shop install path. Decides what to do based on
#  what's available in the repo and the flags you pass.
#
#  Modes (chosen automatically — override with flags):
#    [Default] Full kiosk: Electron app (setup wizard + agent + dispatcher
#              bundled) installed via NSIS. The shop sees a desktop icon;
#              the kiosk UI runs full-screen on the touchscreen if any.
#    [-AgentOnly] Headless agent: just the cloud-polling agent + printer
#              dispatcher, no UI. Use for back-office PCs that already
#              have something else on the screen.
#
#  Runtime deps installed for BOTH modes:
#    • SumatraPDF — byte-faithful PDF printing in spooler mode
#    • Ghostscript (skippable with -NoGhostscript) — PDF→PostScript fallback
#  Added only in -AgentOnly mode (Electron ships its own Node runtime):
#    • Node.js LTS
#
#  Quick start (single shop):
#     1. Right-click PowerShell → Run as Administrator
#     2. cd C:\path\to\printloop
#     3. Set-ExecutionPolicy -Scope Process Bypass -Force
#     4. .\install-kiosk-pc.ps1
#
#  Even quicker — double-click the wrapped exe (built by
#  `.\build-setup-exe.ps1`):  PrintLoopSetup.exe
#
#  Switches:
#    -Uninstall        Remove the installed kiosk (or agent task)
#    -BuildApp         Build the Electron Setup.exe from source first
#                      (requires Node 20+; printloop-kiosk-app must exist)
#    -InstallerPath    Path to a pre-built kiosk Setup.exe; if omitted we
#                      look in printloop-kiosk-app\dist\
#    -AgentOnly        Skip Electron — install the headless agent
#                      (printloop-agent\) and register its Scheduled Task
#    -SkipDeps         Don't install Node / SumatraPDF / Ghostscript
#    -NoGhostscript    Skip Ghostscript only
# ─────────────────────────────────────────────────────────────────────

param(
    [switch]$Uninstall,
    [switch]$BuildApp,
    [string]$InstallerPath = '',
    [switch]$AgentOnly,
    [switch]$SkipDeps,
    [switch]$NoGhostscript
)

$ErrorActionPreference = 'Stop'
$RepoRoot  = $PSScriptRoot
$AppDir    = Join-Path $RepoRoot 'printloop-kiosk-app'
$AgentDir  = Join-Path $RepoRoot 'printloop-agent'
$TaskName  = 'PrintLoop Agent'
$LogDir    = Join-Path $env:ProgramData 'PrintLoop'
$LogFile   = Join-Path $LogDir 'agent.log'

# Bookkeeping for an honest end-of-run summary.
$Installed = [System.Collections.ArrayList]::new()
$Skipped   = [System.Collections.ArrayList]::new()

# ─────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────

function Require-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error 'Run this from an Administrator PowerShell.'
        exit 1
    }
}

function Test-Command { param([string]$Name) [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('PATH', 'User')
    $env:PATH = "$machine;$user"
}

function Ensure-PackageManager {
    if (Test-Command winget) { return 'winget' }
    if (Test-Command choco)  { return 'choco'  }
    Write-Host '[..] no package manager — bootstrapping Chocolatey…'
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol =
        [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    try {
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Refresh-Path
        if (Test-Command choco) {
            [void]$Installed.Add('Chocolatey (bootstrap)')
            return 'choco'
        }
    } catch {
        Write-Warning "Couldn't bootstrap Chocolatey: $_"
    }
    Write-Error 'No package manager available. Install winget (Microsoft Store > "App Installer") or Chocolatey by hand, then re-run.'
    exit 1
}

function Install-Package {
    param(
        [string]$Manager,
        [string]$WingetId,
        [string]$ChocoId,
        [string]$Display,
        [string]$Probe
    )
    if ($Probe -and (Test-Command $Probe)) {
        [void]$Skipped.Add($Display)
        Write-Host "[skip] $Display already installed."
        return
    }
    if ($Manager -eq 'winget') {
        Write-Host "[winget] installing $Display ($WingetId)…"
        & winget install --id $WingetId --silent --accept-source-agreements --accept-package-agreements 2>&1 | Out-Host
    } else {
        Write-Host "[choco] installing $Display ($ChocoId)…"
        & choco install $ChocoId -y --no-progress 2>&1 | Out-Host
    }
    Refresh-Path
    [void]$Installed.Add($Display)
    Write-Host "[ok] $Display done."
}

function Find-Sumatra {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\SumatraPDF\SumatraPDF.exe",
        "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe",
        "$env:ProgramFiles\SumatraPDF\SumatraPDF.exe",
        "${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe",
        "$env:ChocolateyInstall\bin\SumatraPDF.exe"
    )
    foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
    $cmd = Get-Command SumatraPDF.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
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

# ─────────────────────────────────────────────────────────────────────
#  Uninstall paths
# ─────────────────────────────────────────────────────────────────────

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
                Write-Host "[uninstall] $($p.DisplayName)"
                $cmd = $p.UninstallString.Trim('"')
                $cmdArgs = '/S /allusers'
                if ($cmd -match '^"?(.+?)"?\s*(.*)$') {
                    $cmd = $matches[1]
                    $cmdArgs = ($matches[2] + ' /S /allusers').Trim()
                }
                Start-Process -FilePath $cmd -ArgumentList $cmdArgs -Wait
            }
        }
    }
}

function Uninstall-AgentTask {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[ok] removed Scheduled Task '$TaskName'."
    } else {
        Write-Host "[skip] no Scheduled Task '$TaskName' to remove."
    }
}

# ─────────────────────────────────────────────────────────────────────
#  Mode 1 — Full Electron kiosk install (default)
# ─────────────────────────────────────────────────────────────────────

function Install-KioskMode {
    if ($BuildApp) {
        if (-not (Test-Path $AppDir)) {
            Write-Error "Missing folder: $AppDir  (is the repo intact?)"
            exit 1
        }
        if (-not (Test-Command node)) {
            Write-Error '-BuildApp requested but Node.js is not on PATH. Install Node 20+ first or use -SkipDeps off.'
            exit 1
        }
        Write-Host '[build] running `npm install && npm run build` in printloop-kiosk-app …'
        Push-Location $AppDir
        try {
            if (-not (Test-Path 'node_modules')) {
                & npm install --no-audit --no-fund --loglevel=error 2>&1 | Out-Host
            }
            & npm run build 2>&1 | Out-Host
        } finally { Pop-Location }
    }

    $exe = Find-Installer
    if (-not $exe) {
        Write-Warning 'No PrintLoop Kiosk Setup*.exe found.'
        Write-Host '  Either build it (Node-equipped PC):'
        Write-Host '       cd printloop-kiosk-app'
        Write-Host '       npm install && npm run build'
        Write-Host '  Or re-run with -BuildApp.'
        Write-Host '  Or pass -AgentOnly to install the headless agent instead.'
        exit 1
    }

    Write-Host "[install] running $exe (silent NSIS install)…"
    Start-Process -FilePath $exe -ArgumentList '/S' -Wait
    [void]$Installed.Add('PrintLoop Kiosk (Electron app)')
    Write-Host '[ok] PrintLoop Kiosk installed.'
}

# ─────────────────────────────────────────────────────────────────────
#  Mode 2 — Headless agent install (-AgentOnly)
# ─────────────────────────────────────────────────────────────────────

function Install-AgentMode {
    if (-not (Test-Path $AgentDir)) {
        Write-Error "Missing folder: $AgentDir  (the standalone agent isn't in this repo)."
        exit 1
    }
    if (-not (Test-Command node)) {
        Write-Error 'Node.js is required for the headless agent and is not on PATH. Re-open a fresh Administrator PowerShell after the runtime install, or pass -SkipDeps off.'
        exit 1
    }
    Push-Location $AgentDir
    try {
        if (-not (Test-Path 'node_modules')) {
            Write-Host '[npm] installing agent dependencies…'
            & npm install --no-audit --no-fund --loglevel=error 2>&1 | Out-Host
        } else {
            Write-Host '[skip] agent node_modules already present.'
        }
    } finally { Pop-Location }

    # .env wizard — same as printloop-agent\install.ps1's wizard, with
    # transport menu + spooler queue picker + SumatraPDF default.
    $envFile = Join-Path $AgentDir '.env'
    if (Test-Path $envFile) {
        Write-Host "[skip] $envFile already exists - leaving alone."
    } else {
        Write-Host ''
        Write-Host '── Agent configuration ──' -ForegroundColor Cyan
        $baseUrl  = Read-Host 'PrintLoop cloud URL'
        $kioskKey = Read-Host 'Kiosk API key'

        Write-Host ''
        Write-Host 'Transport mode:'
        Write-Host '  [1] spooler  — USB or any locally-installed printer (recommended)'
        Write-Host '  [2] ipp      — network printer that speaks IPP'
        Write-Host '  [3] raw9100  — Sharp MX-series / JetDirect-only printers'
        $choice = Read-Host 'Choose [1/2/3, default 1]'
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
        $transport = switch ($choice) {
            '2' { 'ipp' }
            '3' { 'raw9100' }
            default { 'spooler' }
        }

        $printerLine = ''; $nameLine = ''; $cmdLine = ''
        if ($transport -eq 'spooler') {
            $printers = @(Get-Printer | Sort-Object Name)
            if ($printers.Count -eq 0) {
                $printerName = Read-Host 'No queues found. Type printer queue name manually'
            } else {
                Write-Host ''
                Write-Host 'Local printer queues:'
                for ($i = 0; $i -lt $printers.Count; $i++) {
                    $p = $printers[$i]
                    $marker = ''
                    if ($p.Default) { $marker = ' (default)' }
                    $num = $i + 1
                    Write-Host "  [$num] $($p.Name)  -- $($p.PortName)$marker"
                }
                $pick = Read-Host 'Choose number (or type a name)'
                if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $printers.Count) {
                    $printerName = $printers[[int]$pick - 1].Name
                } else {
                    $printerName = $pick
                }
            }
            $printerLine = "PRINTER_IP=$printerName"
            $nameLine    = "PRINTER_NAME=$printerName"
            $sumatra = Find-Sumatra
            if ($sumatra) {
                $cmdLine = 'SPOOLER_COMMAND="' + $sumatra + '" -print-to "{printer}" "{file}"'
                Write-Host "[ok] Defaulting SPOOLER_COMMAND to SumatraPDF: $sumatra"
            } else {
                $cmdLine = "# SPOOLER_COMMAND not set - using PowerShell PrintTo (may re-rasterize PDFs)"
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

        Write-Host "[ok] Wrote $envFile"
    }

    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

    $action = New-ScheduledTaskAction `
        -Execute 'cmd.exe' `
        -Argument "/c npm start >> `"$LogFile`" 2>&1" `
        -WorkingDirectory $AgentDir
    $trigger  = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -RestartCount 99 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)
    $principal = New-ScheduledTaskPrincipal `
        -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description 'PrintLoop on-site agent — polls cloud, dispatches to printer.' | Out-Null

    Start-ScheduledTask -TaskName $TaskName
    [void]$Installed.Add("PrintLoop Agent (Scheduled Task '$TaskName')")
    Write-Host "[ok] Scheduled Task '$TaskName' started."
}

# ─────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────

Require-Admin

Write-Host ''
Write-Host '== PrintLoop kiosk-PC installer ==' -ForegroundColor Cyan
Write-Host ''

if ($Uninstall) {
    if ($AgentOnly) {
        Uninstall-AgentTask
    } else {
        Uninstall-KioskApp
        Uninstall-AgentTask  # belt-and-braces in case both were installed
    }
    Write-Host ''
    Write-Host '── Uninstall complete. ──' -ForegroundColor Yellow
    exit 0
}

# Dependency install (runs for BOTH modes — SumatraPDF + Ghostscript
# benefit the Electron kiosk's embedded agent AND the standalone one).
if (-not $SkipDeps) {
    $pm = Ensure-PackageManager
    if ($AgentOnly) {
        Install-Package -Manager $pm `
            -WingetId 'OpenJS.NodeJS.LTS' `
            -ChocoId  'nodejs-lts' `
            -Display 'Node.js LTS' `
            -Probe 'node'
    }
    Install-Package -Manager $pm `
        -WingetId 'SumatraPDF.SumatraPDF' `
        -ChocoId  'sumatrapdf.install' `
        -Display 'SumatraPDF' `
        -Probe ''
    if (-not $NoGhostscript) {
        Install-Package -Manager $pm `
            -WingetId 'ArtifexSoftware.GhostScript' `
            -ChocoId  'ghostscript' `
            -Display 'Ghostscript' `
            -Probe 'gswin64c'
    }
}

if ($AgentOnly) {
    Install-AgentMode
} else {
    Install-KioskMode
}

# ─────────────────────────────────────────────────────────────────────
#  Summary
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
if ($AgentOnly) {
    Write-Host "Logs:  $LogFile"
    Write-Host "Tail:  Get-Content -Wait `"$LogFile`""
    Write-Host "Uninstall:  .\install-kiosk-pc.ps1 -Uninstall -AgentOnly"
} else {
    Write-Host 'Start Menu > PrintLoop Kiosk, or use the desktop shortcut.'
    Write-Host 'First launch: setup wizard for cloud URL, kiosk key, printer.'
    Write-Host 'Re-open setup later with Ctrl+Shift+S.  Quit with Ctrl+Shift+Q.'
    Write-Host 'Uninstall:  .\install-kiosk-pc.ps1 -Uninstall'
}
Write-Host ''
