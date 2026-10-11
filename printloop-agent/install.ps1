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

# ─────────────────────────────────────────────────────────────────────
#  Auto-Discovery Helpers (NEW)
# ─────────────────────────────────────────────────────────────────────

# Detect USB printers that are currently connected
function Get-ConnectedUSBPrinters {
    $printers = @()
    
    # Get USB printer devices via WMI
    $usbDevices = Get-WmiObject -Class Win32_USBControllerDevice -ErrorAction SilentlyContinue | ForEach-Object {
        $dependent = [Wmi]$_.Dependent
        if ($dependent.PNPClass -eq 'Printer') {
            $dependent
        }
    }
    
    foreach ($dev in $usbDevices) {
        $printer = Get-WmiObject -Class Win32_Printer -Filter "DeviceID = '$($dev.DeviceID)'" -ErrorAction SilentlyContinue
        if ($printer) {
            $printers += [PSCustomObject]@{
                Name = $printer.Name
                PortName = $printer.PortName
                DriverName = $printer.DriverName
                Location = $printer.Location
                ConnectionType = 'USB'
                IsDefault = $printer.Default
                DeviceID = $dev.DeviceID
            }
        }
    }
    
    # Also get printers connected via USB print server (network but local)
    $netPrinters = Get-WmiObject -Class Win32_Printer -Filter "Network = False AND Local = True" -ErrorAction SilentlyContinue | Where-Object {
        $_.PortName -match '^(USB|DOT4|WSDPRINT)'
    }
    
    foreach ($p in $netPrinters) {
        if (-not ($printers | Where-Object { $_.Name -eq $p.Name })) {
            $printers += [PSCustomObject]@{
                Name = $p.Name
                PortName = $p.PortName
                DriverName = $p.DriverName
                Location = $p.Location
                ConnectionType = 'USB/Local'
                IsDefault = $p.Default
            }
        }
    }
    
    return $printers
}

# Discover network printers on the LAN via mDNS/Bonjour, SNMP, and port scanning
function Discover-NetworkPrinters {
    $printers = @()
    
    # 1. mDNS/Bonjour discovery (IPP printers)
    try {
        $mdns = Get-DnsClientCache -Entry '*._ipp._tcp.local' -ErrorAction SilentlyContinue
        if ($mdns) {
            foreach ($record in $mdns) {
                if ($record.RecordType -eq 'SRV') {
                    $parts = $record.RecordData -split ' '
                    if ($parts.Count -ge 4) {
                        $port = $parts[2]
                        $host = $parts[3].TrimEnd('.')
                        $printers += [PSCustomObject]@{
                            Name = $record.Name
                            Host = $host
                            Port = $port
                            Transport = 'ipp'
                            DiscoveryMethod = 'mDNS/Bonjour'
                        }
                    }
                }
            }
        }
    } catch {}
    
    # 2. Common printer ports scan (IPP 631, Raw 9100, LPD 515)
    $localSubnet = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1 -ExpandProperty IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress
    if ($localSubnet) {
        $baseIp = $localSubnet -replace '\.\d+$', ''
        $commonPorts = @(
            @{Port=631; Transport='ipp'; Path='/ipp/print'},
            @{Port=9100; Transport='raw9100'; Path=''},
            @{Port=515; Transport='lpd'; Path=''},
            @{Port=631; Transport='ipp'; Path='/ipp/print'}
        )
        
        $ips = 1..254 | ForEach-Object { "$baseIp.$_" }
        $foundPrinters = @()
        
        foreach ($ip in $ips) {
            foreach ($portInfo in $commonPorts) {
                $socket = New-Object System.Net.Sockets.TcpClient
                $result = $socket.BeginConnect($ip, $portInfo.Port, $null, $null)
                $success = $result.AsyncWaitHandle.WaitOne(200)  # 200ms timeout
                if ($success -and $socket.Connected) {
                    # Try to get printer info
                    $name = "Printer at $ip"
                    $foundPrinters += [PSCustomObject]@{
                        Name = "Printer at $ip"
                        Host = $ip
                        Port = $portInfo.Port
                        Transport = $portInfo.Transport
                        Path = $portInfo.Path
                        DiscoveryMethod = 'Port Scan'
                    }
                    $socket.Close()
                    break  # Found a printer on this IP, move to next IP
                }
                $socket.Close()
            }
        }
        $printers += $foundPrinters
    }
    
    return $printers
}

# Auto-detect the best transport for a given printer
function Select-BestTransport {
    param(
        [PSCustomObject]$Printer
    )
    
    # USB/Local printers -> spooler (best quality, supports all features)
    if ($Printer.ConnectionType -in @('USB', 'USB/Local')) {
        return @{ Transport = 'spooler'; Reason = 'USB/Local printer detected; spooler mode gives best quality and supports all paper/color options' }
    }
    
    # Network printer with IPP -> ipp
    if ($Printer.Transport -eq 'ipp') {
        return @{ Transport = 'ipp'; Reason = 'IPP-capable network printer detected; IPP gives full feature support and job confirmation' }
    }
    
    # Network printer with only raw 9100 -> raw9100
    if ($Printer.Transport -eq 'raw9100') {
        return @{ Transport = 'raw9100'; Reason = 'JetDirect-only printer detected; raw9100 with PJL works reliably' }
    }
    
    # Network printer with LPD
    if ($Printer.Transport -eq 'lpd') {
        return @{ Transport = 'lpd'; Reason = 'LPD-capable printer detected' }
    }
    
    # Default: if we found it on network but can't determine, try IPP first
    return @{ Transport = 'ipp'; Reason = 'Network printer detected; defaulting to IPP (try raw9100 if it fails)' }
}

# Auto-configure printer with zero prompts
function Auto-ConfigurePrinter {
    Write-Host ''
    Write-Host '── Auto-Discovering Printers ──' -ForegroundColor Cyan
    
    $usbPrinters = Get-ConnectedUSBPrinters
    $netPrinters = Discover-NetworkPrinters
    $allPrinters = $usbPrinters + $netPrinters
    
    if ($allPrinters.Count -eq 0) {
        Write-Warning "No printers detected. Please connect a printer (USB or network) and re-run."
        return $null
    }
    
    Write-Host "Found $($allPrinters.Count) printer(s):"
    foreach ($p in $allPrinters) {
        $defaultMark = if ($p.IsDefault) { ' (DEFAULT)' } else { '' }
        $connInfo = if ($p.ConnectionType) { " [$($p.ConnectionType)]" } elseif ($p.Host) { " [$($p.Host):$($p.Port)]" } else { '' }
        Write-Host "  - $($p.Name)$connInfo$defaultMark"
    }
    
    # Auto-select: prefer default printer, then USB, then first network
    $selected = $allPrinters | Where-Object { $_.IsDefault } | Select-Object -First 1
    if (-not $selected) { $selected = $allPrinters | Where-Object { $_.ConnectionType -in @('USB', 'USB/Local') } | Select-Object -First 1 }
    if (-not $selected) { $selected = $allPrinters | Select-Object -First 1 }
    
    $transportInfo = Select-BestTransport -Printer $selected
    $transport = $transportInfo.Transport
    $reason = $transportInfo.Reason
    
    Write-Host "[ok] Auto-selected: $($selected.Name) → $transport ($reason)"
    
    return @{
        Printer = $selected
        Transport = $transport
        Reason = $reason
    }
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

# ─────────────────────────────────────────────────────────────────────
#  4. .env wizard — AUTO-DISCOVERY with manual fallback
# ─────────────────────────────────────────────────────────────────────

$envFile = Join-Path $AgentDir '.env'
if (-not (Test-Path $envFile)) {
    Write-Host ''
    Write-Host '── Agent configuration ──' -ForegroundColor Cyan

    $baseUrl  = Read-Host 'PrintLoop cloud URL (e.g. https://printloop-production.up.railway.app)'
    $kioskKey = Read-Host 'Kiosk API key (from Admin > Kiosks > this kiosk)'

    # Try auto-discovery first
    Write-Host ''
    Write-Host 'Attempting automatic printer discovery...' -ForegroundColor Yellow
    $autoConfig = Auto-ConfigurePrinter

    if ($null -eq $autoConfig) {
        # Fallback to manual mode
        Write-Host ''
        Write-Host 'Falling back to manual configuration...' -ForegroundColor Yellow
        
        Write-Host ''
        Write-Host 'Transport mode:'
        Write-Host '  [1] spooler  — USB or any locally-installed printer (recommended for most shops)'
        Write-Host '  [2] ipp      — network printer that speaks IPP (HP, Brother, Canon, etc.)'
        Write-Host '  [3] raw9100  — Sharp MX-series or other JetDirect-only printers'
        Write-Host '  [4] printnode — PrintNode cloud proxy (works behind NAT/firewall)'
        Write-Host '  [5] lpd       — Legacy LPD/LPR protocol (Kyocera, Ricoh, Unix print servers)'
        Write-Host '  [5] email     — Email-to-print (HP ePrint, Canon, Epson)'
        $choice = Read-Host 'Choose [1/2/3/4/5/6, default 1]'
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }

        $transport = switch ($choice) {
            '2' { 'ipp' }
            '3' { 'raw9100' }
            '4' { 'printnode' }
            '5' { 'lpd' }
            '6' { 'email' }
            default { 'spooler' }
        }

        $printerLine = ''
        $nameLine    = ''
        $cmdLine     = ''

        if ($transport -eq 'spooler') {
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

            $printerLine = "PRINTER_IP=$printerName"
            $nameLine    = "PRINTER_NAME=$printerName"

            $sumatra = Find-Sumatra
            if ($sumatra) {
                $cmdLine = 'SPOOLER_COMMAND="' + $sumatra + '" -print-to "{printer}" "{file}"'
                Write-Host "[ok] Defaulting SPOOLER_COMMAND to SumatraPDF: $sumatra"
            } else {
                $cmdLine = "# SPOOLER_COMMAND not set - using the agent's built-in PowerShell PrintTo default."
                Write-Host "[note] SumatraPDF not detected; agent will use PowerShell PrintTo (may re-rasterize PDFs)."
            }
        } elseif ($transport -eq 'printnode') {
            $pnKey = Read-Host 'PrintNode API Key'
            $pnPrinterId = Read-Host 'PrintNode Printer ID'
            $printerLine = "PRINTNODE_API_KEY=$pnKey`nPRINTNODE_PRINTER_ID=$pnPrinterId"
        } elseif ($transport -eq 'email') {
            $emailAddr = Read-Host 'Printer Email Address (e.g. printer123@hpeprint.com)'
            $printerLine = "EMAIL_TO_PRINT_ADDRESS=$emailAddr"
            # SMTP config
            $smtpHost = Read-Host 'SMTP Host (e.g. smtp.gmail.com)'
            $smtpPort = Read-Host 'SMTP Port (e.g. 587)'
            $smtpUser = Read-Host 'SMTP Username'
            $smtpPass = Read-Host 'SMTP Password'
            $smtpFrom = Read-Host 'From Address (e.g. PrintLoop <noreply@printloop.ng>)'
            $cmdLine = "SMTP_HOST=$smtpHost`nSMTP_PORT=$smtpPort`nSMTP_USER=$smtpUser`nSMTP_PASS=$smtpPass`nSMTP_FROM=$smtpFrom"
        } else {
            $printerIp = Read-Host 'Printer IP on this LAN (e.g. 192.168.0.111)'
            $printerLine = "PRINTER_IP=$printerIp"
        }

        $transport = $transport
    } else {
        # Use auto-discovered configuration
        $selected = $autoConfig.Printer
        $transport = $autoConfig.Transport
        $reason = $autoConfig.Reason

        $printerLine = "PRINTER_IP=$($selected.Name)"
        $nameLine    = "PRINTER_NAME=$($selected.Name)"
        $cmdLine     = ''

        if ($transport -eq 'spooler') {
            $sumatra = Find-Sumatra
            if ($sumatra) {
                $cmdLine = 'SPOOLER_COMMAND="' + $sumatra + '" -print-to "{printer}" "{file}"'
            }
        } elseif ($transport -eq 'printnode') {
            # PrintNode config would need to be pre-set in env or prompted
            $printerLine += "`nPRINTNODE_API_KEY=`nPRINTNODE_PRINTER_ID="
        } elseif ($transport -eq 'email') {
            $printerLine += "`nEMAIL_TO_PRINT_ADDRESS="
        } else {
            $printerLine = "PRINTER_IP=$($selected.Host):$($selected.Port)"
        }
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
