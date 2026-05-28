# ─────────────────────────────────────────────────────────────────────
#  DEPRECATED — use ..\printloop-kiosk-app instead.
#  ─────────────────────────────────────────────────────────────────────
#
#  This script set up the kiosk UI as a static page served on :8080
#  with Chrome --kiosk pointing at it. It's been replaced by a real
#  Electron app (printloop-kiosk-app/) that ships as a Windows
#  installer — no browser, no localhost server, just a PrintLoop
#  Kiosk.exe with its own Start Menu entry and auto-launch at login.
#
#  Build + install:
#     cd ..\printloop-kiosk-app
#     npm install
#     npm run build
#     # → produces dist\PrintLoop Kiosk Setup *.exe
#
#  Or use the all-in-one installer at the repo root:
#     ..\install-kiosk-pc.ps1 -BuildApp
#
#  The static HTML in this folder (index.html) is still the canonical
#  source — the Electron wrapper just bundles it. Keep editing it
#  here; `npm run sync` in printloop-kiosk-app/ pulls the latest copy
#  into the renderer at build time.
# ─────────────────────────────────────────────────────────────────────

Write-Warning 'This installer is deprecated.'
Write-Host ''
Write-Host 'Use the new Electron-app installer:'
Write-Host '    cd ..\printloop-kiosk-app'
Write-Host '    npm install'
Write-Host '    npm run build'
Write-Host '    # → dist\PrintLoop Kiosk Setup *.exe'
Write-Host ''
Write-Host 'Or run the all-in-one PC installer at the repo root:'
Write-Host '    ..\install-kiosk-pc.ps1 -BuildApp'
Write-Host ''
Write-Host 'See the printloop-kiosk-app folder for details.'
exit 1
