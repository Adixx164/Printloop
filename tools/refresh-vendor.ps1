# Refresh shallow clones of every OpenPrinting repo we vendor.
# Safe to re-run: existing repos are git-fetched + reset to origin/HEAD.
# New repos are cloned --depth 1.

param(
    [string]$Root = (Join-Path $PSScriptRoot "..\vendor\openprinting")
)

$ErrorActionPreference = "Stop"

$repos = @(
    # Core CUPS print stack
    'cups', 'cups-filters', 'libcups', 'libcupsfilters',
    'cups-browsed', 'cups-local', 'cups-sharing',
    # IPP-over-USB
    'ipp-usb', 'ippusbxd',
    # Driverless Printer Applications
    'hplip-printer-app', 'ps-printer-app',
    'ghostscript-printer-app', 'gutenprint-printer-app',
    'pappl-retrofit',
    # Backend bindings
    'goipp', 'go-mfp', 'go-avahi', 'pycups',
    # Common Print Dialog Backends
    'cpdb-libs', 'cpdb-backend-cups',
    # Docs / rendering / DB
    'libpdfrip', 'foomatic-db-engine',
    # Reference UI
    'system-config-printer',
    # Test / hardening
    'fuzzing'
    # NOTE: 'foomatic-db' (~183 MB) and 'sample-files' (~214 MB)
    # are intentionally NOT vendored. They overflow the local
    # Windows Schannel git-pack streaming. See
    # vendor/openprinting/README.md → "Intentionally not vendored".
)

if (-not (Test-Path $Root)) {
    New-Item -ItemType Directory -Force -Path $Root | Out-Null
}

$summary = @()
foreach ($r in $repos) {
    $dest = Join-Path $Root $r
    $url = "https://github.com/OpenPrinting/$r.git"
    if (Test-Path (Join-Path $dest ".git")) {
        Write-Host "==> refresh $r"
        try {
            git -C $dest fetch --depth 1 origin --quiet
            $head = (git -C $dest symbolic-ref --short HEAD).Trim()
            git -C $dest reset --hard "origin/$head" --quiet
            $summary += "ok    $r"
        } catch {
            $summary += "FAIL  $r ($($_.Exception.Message))"
        }
    } else {
        Write-Host "==> clone   $r"
        try {
            git clone --depth 1 --quiet $url $dest
            $summary += "ok    $r (new)"
        } catch {
            $summary += "FAIL  $r ($($_.Exception.Message))"
        }
    }
}

Write-Host ""
Write-Host "Summary"
Write-Host "-------"
$summary | ForEach-Object { Write-Host "  $_" }

$totalMB = (Get-ChildItem $Root -Recurse -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host ("Total vendor size: {0:N1} MB" -f $totalMB)
