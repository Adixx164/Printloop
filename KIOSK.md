# PrintLoop kiosk — install guide

**One page** for setting up a print shop's computer to receive jobs from
the PrintLoop cloud and drive the local printer. Covers Windows and
Linux, the Electron kiosk app and the headless agent, the three printer
transports (IPP / raw9100 / spooler), and the troubleshooting steps that
come up most often.

---

## Pick your path

| You have… | You want… | Read |
|---|---|---|
| A modern Windows shop PC, you want the touchscreen UI for customers | Full kiosk | [§ Windows — full kiosk](#windows-full-kiosk) |
| A Windows back-office PC that already has something on the screen | Headless agent | [§ Windows — agent-only](#windows-agent-only) |
| Linux box (Ubuntu, Fedora, Mint, Arch) | Either — defaults to agent (no Linux Electron build yet) | [§ Linux](#linux) |
| Already-installed kiosk that needs reconfiguration | Re-open setup wizard | [§ Re-open setup wizard](#re-open-setup-wizard) |

---

## Before you start

You need three pieces of information from a PrintLoop platform admin:

1. **Cloud URL** — e.g. `https://printloop-production.up.railway.app`
2. **Kiosk API key** — generated from Admin → Kiosks → "Add kiosk". Treat
   like a password; don't paste it in chats or commit it.
3. **Printer details** — depending on transport:
   - **spooler** (recommended): the printer must already work from the
     shop computer's normal apps (Word, browser print, etc.)
   - **ipp**: the printer's LAN IP address
   - **raw9100**: same — LAN IP. Used for Sharp MX-series and JetDirect-only printers.

---

## Windows — full kiosk

This is the path for a customer-facing kiosk PC with a touchscreen, or
any PC where you want the PrintLoop kiosk UI taking the screen.

**Easiest:** double-click **`PrintLoopSetup.exe`** at the repo root.

1. Right-click `PrintLoopSetup.exe` → Run as administrator
2. UAC prompts → Yes
3. Console window opens — it does:
   - Auto-detect [winget](https://learn.microsoft.com/windows/package-manager/winget/)
     (Windows 10 1809+ / Windows 11) or fall back to
     [Chocolatey](https://chocolatey.org/)
   - Install **SumatraPDF** (byte-faithful PDF printing in spooler mode)
   - Install **Ghostscript** (optional, skip with `-NoGhostscript`)
   - Run the Electron `PrintLoop Kiosk Setup 1.0.0.exe` from
     `printloop-kiosk-app\dist\` silently
4. After install:
   - Start Menu → **PrintLoop Kiosk** (or desktop shortcut)
   - First launch shows the setup wizard — paste cloud URL + kiosk
     key, pick the transport, choose your printer, click *Save & launch*
5. The app auto-starts on every login from here on.

**Without the .exe** (power users): same script directly —

```powershell
cd C:\path\to\printloop
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install-kiosk-pc.ps1
```

**Need to build the Electron app first** (e.g. fresh repo clone, no
`printloop-kiosk-app\dist\` yet) — add `-BuildApp`:

```powershell
.\install-kiosk-pc.ps1 -BuildApp
```

This requires Node.js 20+ on the build PC. The script runs
`npm install && npm run build` in `printloop-kiosk-app\` and then
installs the produced Setup.exe.

---

## Windows — agent-only

Use this when the shop already has something on the kiosk screen and
you only want the background "claim job → print → report complete"
loop. No touchscreen UI, no Electron, no auto-start app.

```powershell
.\install-kiosk-pc.ps1 -AgentOnly
```

What it does:
1. Installs Node.js LTS (only this mode needs it; the Electron app
   bundles its own runtime)
2. Installs SumatraPDF + Ghostscript (same as full mode)
3. `npm install` in `printloop-agent\`
4. Wizard:
   - Cloud URL + kiosk API key
   - Transport choice (spooler / ipp / raw9100)
   - In spooler mode: enumerates installed printer queues via
     `Get-Printer` and lets you pick from a numbered list
   - If SumatraPDF is found, defaults `SPOOLER_COMMAND` to
     `"<sumatra path>" -print-to "{printer}" "{file}"`
5. Registers a Scheduled Task "PrintLoop Agent" that runs as SYSTEM,
   restarts on crash, logs to `%ProgramData%\PrintLoop\agent.log`
6. Starts the task

Tail the log:

```powershell
Get-Content -Wait "$env:ProgramData\PrintLoop\agent.log"
```

Manage the task:

```powershell
Stop-ScheduledTask  -TaskName 'PrintLoop Agent'
Start-ScheduledTask -TaskName 'PrintLoop Agent'
```

Uninstall:

```powershell
.\install-kiosk-pc.ps1 -Uninstall -AgentOnly
```

---

## Linux

One command:

```bash
sudo bash install-kiosk-pc.sh
```

Detects package manager (apt / dnf / yum / pacman) and installs:

- **CUPS + `lp` client** — Linux's universal print abstraction
- **Ghostscript** (skip with `--no-ghostscript`)
- **poppler-utils** — `pdftoppm` and friends
- **Node.js LTS** — only when `--agent-only` or `--build-app` is passed

Then chooses the install path:

- If `printloop-kiosk-app/dist/` contains a Linux build (`.AppImage`,
  `.deb`, or `.rpm`) — installs it as the full kiosk
- Otherwise (the default state today) — **automatically falls through
  to agent mode** with a clear console message

Force agent mode:

```bash
sudo bash install-kiosk-pc.sh --agent-only
```

Build the Linux kiosk on a Node-equipped box first:

```bash
sudo bash install-kiosk-pc.sh --build-app
```

The agent runs as a systemd service under a dedicated `printloop` user
(non-root, member of the `lp` group). Hardening flags:
`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`,
`RestrictNamespaces`, `LockPersonality`.

Live logs:

```bash
journalctl -u printloop-agent.service -f
```

Manage:

```bash
sudo systemctl status   printloop-agent.service
sudo systemctl restart  printloop-agent.service
sudo systemctl stop     printloop-agent.service
```

Uninstall:

```bash
sudo bash install-kiosk-pc.sh --uninstall
```

---

## Three printer transports — which to pick

| Transport | What it covers | When to use |
|---|---|---|
| **spooler** (default in wizard) | Anything the host OS can print to: USB, GDI, Bluetooth, virtual PDF, etc. | The shop's printer already works from Word / browser print. ~99% of small-shop setups. |
| **ipp** | Network printer that speaks IPP — HP, Brother, Canon, Epson, Lexmark, Ricoh, Xerox, Kyocera, any AirPrint-compatible printer (~85–90% of business-grade printers post-2010) | The shop has a modern networked printer and you want lower-level control |
| **raw9100** | TCP socket on port 9100 with PJL. Sharp MX-series, older HPs, thermal/label printers, line printers | The printer speaks JetDirect / AppSocket but not IPP |

Why spooler is the default: it gives near-universal compatibility
because it defers to the OS, which already has the universal abstraction
(Windows Print Spooler, CUPS on Linux). If Microsoft Word can print to
your printer, PrintLoop can too. On Windows, install SumatraPDF (the
installer does this for you) for byte-faithful PDF printing instead of
GDI re-rasterization.

---

## Re-open setup wizard

The Electron kiosk app: **Ctrl + Shift + S** anywhere in the app.
Quit with **Ctrl + Shift + Q**.

The headless agent: edit the `.env` directly —

| OS | Path |
|---|---|
| Windows | `C:\path\to\printloop-agent\.env` |
| Linux | `/path/to/printloop-agent/.env` |

Then restart the service:

- Windows: `Start-ScheduledTask -TaskName 'PrintLoop Agent'`
- Linux: `sudo systemctl restart printloop-agent.service`

---

## Troubleshooting

### "winget is not recognized" on Windows
`winget` ships with Windows 10 1809+ and Windows 11. Older Windows 10
needs an App Installer update from the Microsoft Store, OR Chocolatey
(the installer falls back automatically). Worst case, install Node and
SumatraPDF by hand from
[nodejs.org](https://nodejs.org/) and
[sumatrapdfreader.org](https://www.sumatrapdfreader.org/download-free-pdf-viewer)
and re-run with `-SkipDeps`.

### "Node install completed but `node` is still not on PATH"
PATH changes don't propagate to the running shell — open a fresh
Administrator PowerShell and re-run.

### Agent says it printed but nothing came out
Check the spooler queue. On Windows: Settings → Printers & scanners →
your printer → Open print queue. If a job is stuck there, the agent
spooled correctly but the OS / driver got stuck — usually a driver
restart or a printer power-cycle fixes it.

### `[agent] startup probe FAILED`
Wrong cloud URL or wrong kiosk key. Re-open setup (Ctrl+Shift+S in the
Electron app, or edit `.env` for the headless agent) and verify both.

### Printer drivers
The installer does not install printer drivers — they're vendor-specific
and per-model. Install them the way you would for any other Windows /
Linux printer: vendor's website on Windows, the distro's printer setup
GUI on Linux. The kiosk + agent only need the printer to be visible to
the OS.

### Spooler mode prints, but pages look wrong (rasterized)
Windows GDI is re-rasterizing PDFs. Install SumatraPDF (the installer
does this automatically) and verify `SPOOLER_COMMAND` in the agent's
`.env` points at `SumatraPDF.exe -print-to "{printer}" "{file}"`.

### Where are the logs?

| Path | What |
|---|---|
| Windows kiosk app | `%APPDATA%\PrintLoop Kiosk\logs\` |
| Windows agent | `%ProgramData%\PrintLoop\agent.log` |
| Linux agent | `journalctl -u printloop-agent.service -f` |

---

## Architecture (one paragraph)

The kiosk app or agent **claims** jobs the customer paid for from the
cloud backend (BullMQ queue), downloads the document bytes via a
signed URL, dispatches to the printer via the configured transport,
reports completion. The kiosk app additionally hosts a touchscreen UI
for the customer to enter their 6-character code and watch progress.
Both paths use the same `agent` core — the Electron app embeds it; the
headless install runs it as a service.

For the cloud side, see
[`DEPLOY-SAAS.md`](DEPLOY-SAAS.md) (multi-tenant SaaS deployment) and
[`ARCHITECTURE.md`](ARCHITECTURE.md).
