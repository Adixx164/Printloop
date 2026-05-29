# PrintLoop Build Journal

A running log of everything done in this build session — additions,
removals, decisions, dead-ends, fixes, and the reasoning behind each
turn. Anchored to git commits where available. Each phase ends with
"What's on disk after this" so the state at every checkpoint is
explicit.

This file is a **living document** — update it every time we
finish a unit of work. Append to the latest phase or start a new
one; do not silently rewrite history above the current cursor.

---

## Phase 0 — Pre-session foundation (committed up to 2026-05-25)

State of the repo before this conversation started.

**Commits (from `git log`):**

| When | Hash | Title |
|---|---|---|
| 2026-05-21 13:30 | `8a7dc41` | Initial commit |
| 2026-05-21 13:44 | `ae5ee3c` | Update pnpm lockfile for Vercel deployment |
| 2026-05-25 01:06 | `20b1451` | chore: gitignore runtime data + untrack dev SQLite + stale zip |
| 2026-05-25 01:07 | `466b5f0` | deploy: vercel.json for the frontend + DEPLOY.md with the honest split |
| 2026-05-25 01:09 | `f9d0ed4` | feat: full session — security, pricing matrix, CUPS, group, orientation, raw9100 |

**What was already in place:**
- Backend (`01-backend/`) — Express / TypeORM / SQLite, with the
  customer + admin + kiosk APIs, Paystack wallet, the 24-cell
  pricing matrix, group sessions, the `raw9100 + PJL` printer
  transport, and the CUPS-ingress path.
- Frontend (`printloop-new-frontend/`) — React / Vite / RTK Query
  customer + admin app, desktop-shaped layout.
- Static kiosk UI (`printloop-kiosk/index.html`) — single-page
  touchscreen UI that POSTs to `/api/printer/*`.
- CUPS backend script (`tools/cups-printloop/`) — a tiny POSIX
  script that lets a CUPS queue forward jobs to PrintLoop.
- `DEPLOY.md` documenting the Vercel + Railway split.

**Open question entering this session:** how to take this from "local
dev with a virtual printer" to "actually printing on a real Sharp
sitting on the user's home Wi-Fi."

---

## Phase 1 — Real-printer testing on a Sharp MX-5112N (2026-05-26)

**Prompted by:** "i have a printer at home and i want to start
testing with this software."

The user picked the Sharp MX-5112N on Wi-Fi at `192.168.0.111`.

**What we tried first — IPP `/ipp/lp`:**
- Sent a PDF over IPP using `IppService.printJob()` against
  `ipp://192.168.0.111:631/ipp/lp`.
- Printer returned `successful-ok` to every request — but **nothing
  came out the tray.**
- Diagnosis: Sharp's IPP filter accepts anonymous Print-Job
  operations and then silently discards them. Confirmed by reading
  Sharp service notes for the MX series.

**Pivot — raw-9100 + PJL prologue:**
- Sent the same PDF directly to TCP port 9100 with a PJL prologue
  (`UEL + @PJL JOB NAME / SET COPIES / SET DUPLEX / SET RENDERMODE
  / SET PAPER / SET ORIENTATION / ENTER LANGUAGE=PDF`) and a UEL
  epilogue.
- **Paper came out.** Byte-exact.

**Files added/changed:** none committed at this point — the
raw-9100 transport was already in `01-backend/services/ipp.service.ts`
from the pre-session work. We just exercised it.

---

## Phase 2 — Going live on GitHub, Vercel, and Railway (2026-05-26 → 27)

**Prompted by:** "it work worked. now how can make this live. on
GitHub and vercel… can you push to github / do it for me."

The user shared:
- A Railway API token (used for the deploy, not committed)
- Acceptance of "add Railway volume + Tailscale" recommendation
- A Tailscale auth key (used for the deploy, not committed)

**Commits this phase:**

| When | Hash | Title | Why |
|---|---|---|---|
| 2026-05-26 23:34 | `507ee4a` | `fix(deploy): move vercel.json into printloop-new-frontend/` | Vercel was looking at the wrong directory. |
| 2026-05-26 23:46 | `f1acc31` | `deploy(railway): .npmrc with legacy-peer-deps + railway.toml` | sqlite3 had a TypeORM peer-dep conflict on Railway's Nixpacks. |
| 2026-05-27 00:26 | `22a0d86` | `deploy(tailscale): cloud backend joins tailnet to reach LAN printers` | Railway can't reach a home printer; Tailscale subnet routing was the chosen bridge. |
| 2026-05-27 00:30 | `b09b135` | `deploy(railway): bump healthcheck timeout to 180s for tailscale boot` | First Tailscale install on the persistent volume took longer than the 30 s default. |
| 2026-05-27 00:35 | `70fd2f0` | `fix(deploy): don't poison npm with HTTP_PROXY; call tsx directly` | Setting `HTTP_PROXY=http://127.0.0.1:1055` for Tailscale broke npm's registry calls. Removed; kept `TS_SOCKS5_PROXY` only. |
| 2026-05-27 00:41 | `6c7bc5c` | `fix(deploy): exec tsx shim directly (not via node)` | `node ./node_modules/.bin/tsx` failed — tsx's bin is a shell shim, not JS. |
| 2026-05-27 00:47 | `47e3165` | `fix(deploy): move tsx + typescript to dependencies so prod build includes them` | They were in `devDependencies`; Railway's prod build strips those. |
| 2026-05-27 00:51 | `1595a1d` | `fix(deploy): bind tailscale socks5 to 127.0.0.1 not localhost (IPv6 mismatch)` | tailscaled binds IPv4-only; `localhost:1055` resolved to `::1` and `ECONNREFUSED`'d. |

**Files added/changed:**
- `vercel.json` moved from repo root → `printloop-new-frontend/`
- `.npmrc` at repo root with `legacy-peer-deps=true`
- `01-backend/railway.toml` — `startCommand="bash start.sh"`,
  `healthcheckTimeout=180`
- `01-backend/start.sh` (new) — installs Tailscale on the cached
  volume, starts `tailscaled` in `--tun=userspace-networking`
  mode, joins the tailnet with `--accept-routes --reset`, exports
  `TS_SOCKS5_PROXY=127.0.0.1:1055`, then `exec ./node_modules/.bin/tsx server.ts`.
- `01-backend/package.json` — `tsx` and `typescript` moved from
  `devDependencies` to `dependencies`.
- `01-backend/services/ipp.service.ts` — `openSocket(host, port)`
  helper that opens a direct `net.createConnection` OR routes via
  the Tailscale SOCKS5 proxy when `TS_SOCKS5_PROXY` is set.

**What worked:** Vercel deployed cleanly. Railway deployed after the
seven `fix(deploy)` commits.

**What was shaky:** the Tailscale subnet route from the cloud to the
user's home LAN needed manual approval in the Tailscale admin
panel. The user could see the tailnet was up but couldn't yet hit
`192.168.0.111` from the Railway container.

---

## Phase 3 — Pivot to kiosk-pull architecture (2026-05-27 → 28)

**Prompted by:** "why do i need tailscale" → followed by "my initial
idea of how i expected things to work is that when user has uploaded
and paid, the unique code given to the user holds the document in
the cloud, so that when the kiosk receives the code, it would be
download the document to the kiosk and process the command. now i
want to understand if it's possible that way."

**Decision:** add a second architecture mode — "kiosk-pull" — where
an on-site agent polls the cloud for ready jobs and dispatches them
locally. Tailscale becomes optional rather than required. The user
said **"go"** to implement.

### Backend changes

- `01-backend/entities/printJob.entity.ts` — added `RELEASING =
  'releasing'` to the `PrintJobStatus` enum (between `READY` and
  `PRINTING`). A job is RELEASING from the moment the kiosk types
  the code to the moment the agent claims it.
- `01-backend/config/settings.ts` — added a new SystemSetting:
  ```
  { key: 'printDispatchMode', value: 'cloud-push', valueType: 'string',
    category: 'Printing', description: '"cloud-push" or "kiosk-pull"' }
  ```
- `01-backend/services/printPolicy.service.ts` — added
  `printDispatchMode()` reader that consults the SystemSetting (or
  the `PRINT_DISPATCH_MODE` env var as override) and returns
  `'cloud-push' | 'kiosk-pull'`.
- `01-backend/routes/agent.routes.ts` (**new file**, ~250 lines) —
  the agent-pull API at `/api/agent`. Endpoints:
  - `GET /jobs/ready` — kiosk-key-authed; returns RELEASING jobs
    bound to this kiosk OR unbound. Includes a JWT-signed
    `downloadUrl` per item (5 min TTL).
  - `GET /jobs/:id/file?t=<jwt>` — JWT-token-authed; streams the
    PDF bytes via `loadDocumentBytes(file.fileURL)`.
  - `POST /jobs/:id/start` — atomic conditional UPDATE; transitions
    RELEASING → PRINTING with the kiosk's ID. Returns 409 on race.
  - `POST /jobs/:id/complete` — reuses the existing
    `printerExt.completePrintJob()` so counters, cleanup, and
    audit log entries match the cloud-push path.
  - `POST /jobs/:id/failed` — marks FAILED with a reason.
- `01-backend/app.ts` — mounted `agentRoutes` at `/api/agent`
  under the appliance CORS (same shape as `/api/printer`).
- `01-backend/routes/printer.routes.ts` — `/printer/complete`
  branches on `printDispatchMode`:
  - `cloud-push` (default) — existing IPP / raw-9100 dispatch.
  - `kiosk-pull` — persists any policy mutations to the job's
    `printConfiguration`, atomically transitions READY →
    RELEASING binding to the kiosk, returns immediately with
    `status=releasing`. No printer dispatch from the cloud.
- `01-backend/start.sh` — Tailscale block now explicitly marked
  optional. When `TS_AUTHKEY` is unset, prints a helpful message
  pointing at the `printDispatchMode = kiosk-pull` setting.

### Standalone agent — `printloop-agent/` (**new directory**)

For headless deployments and local testing.

- `printloop-agent/package.json` — `axios`, `ipp`, `socks`, `dotenv`,
  `tsx`, `typescript`.
- `printloop-agent/agent.ts` — polls `/api/agent/jobs/ready` every
  `POLL_INTERVAL_MS` (default 4 s). For each job: claim, download,
  dispatch via raw-9100 or IPP, report `/complete` or `/failed`.
- `printloop-agent/.env.example` — `PRINTLOOP_BASE_URL`,
  `KIOSK_API_KEY`, `PRINTER_IP`, `PRINTER_TRANSPORT`,
  `PRINTER_PORT`, `IPP_PATH`, `IPP_VERSION`, `PRINTER_RAW_PORT`,
  `POLL_INTERVAL_MS`. Notes inline on Sharp's quirks.
- `printloop-agent/install.ps1` — Windows installer that registers
  a Scheduled Task running as SYSTEM.

### Tests for the new pipeline

- `01-backend/scripts/e2eAgentPullTest.cjs` (new) — verifies the
  whole chain: register → upload → flip setting → POST
  `/printer/complete` → assert `status=releasing` → GET
  `/agent/jobs/ready` → POST `/agent/start` → fetch signed URL,
  assert byte-exact SHA against source → POST `/agent/complete` →
  assert second `/start` returns 409.
- `01-backend/scripts/liveAgentSmoke.cjs` (new) — runs the same
  flow against a live agent process, lets it dispatch to whatever
  printer/virtual printer the agent's `.env` points at.

**Verified live (this session):** customer-upload → cloud (READY) →
kiosk POST (RELEASING) → bundled-agent claim → signed download
(byte-exact SHA match) → IPP to virtual printer → cloud `/complete`
(DONE). Status transitions in 2 s.

---

## Phase 4 — "How do I install the kiosks on any PC?" → Electron app (2026-05-28)

**Prompted by:** "how do i install the kiosks on any pc / make sure
it has every thing we did from the start." Then: "i want it to be
as an app not browser."

The user wanted a real Windows app, not Chrome `--kiosk` mode.
Asked via `AskUserQuestion`: Chrome `--app` vs Electron wrapper vs
Tauri wrapper. **User chose: Electron wrapper.**

### `printloop-kiosk-app/` (**new directory** — Electron wrapper)

- `package.json` — Electron 33, electron-builder 25. NSIS target
  (`oneClick:false`, `perMachine:true`, `allowToChangeInstallationDirectory:true`).
  Product name "PrintLoop Kiosk", appId `ng.printloop.kiosk`.
- `main.js` — single-instance lock, kiosk-mode `BrowserWindow`
  (`fullscreen:true`, `kiosk:true`, `autoHideMenuBar:true`,
  `devTools:false`), `Menu.setApplicationMenu(null)`,
  `setWindowOpenHandler` deny + `shell.openExternal`, navigation
  block. Hotkeys: `Ctrl+Shift+S` opens settings (page's gear),
  `Ctrl+Shift+Q` quits. `app.setLoginItemSettings({ openAtLogin:
  true })`.
- `build/make-icon.js` (new) — hand-rolled PNG encoder that emits
  a 256×256 brand-colored "PL" icon. CRC32, ASN.1-free pure
  Node — no native deps. Output: `build/icon.png`.
- `.gitignore` — `node_modules/`, `dist/`, `renderer/index.html`
  (generated by `npm run sync`).
- `tsconfig.json` — for the make-icon script's typings only.
- `npm run sync` — copies `../printloop-kiosk/index.html` into
  `renderer/index.html` so the Electron build picks up the
  canonical source.

### Root-level orchestrator

- `install-kiosk-pc.ps1` (new) — Administrator-PowerShell
  orchestrator for unattended / multi-PC rollouts. Flags:
  `-Uninstall`, `-BuildApp`, `-InstallerPath`. Default flow:
  silently install whatever `Setup *.exe` is in
  `printloop-kiosk-app/dist/`.

### Deprecation note

- `printloop-kiosk/install.ps1` rewritten to print a deprecation
  notice pointing at the Electron build.

### `.gitignore` carve-out

The root `.gitignore` had `build/` excluding any folder named
`build/`. Added `!printloop-kiosk-app/build/` exception so the
icon source ships.

**Built:** `PrintLoop Kiosk Setup 1.0.0.exe`, 78 MB. Installs to
`C:\Program Files\PrintLoop Kiosk\`, registers in Add/Remove
Programs as "PrintLoop Kiosk" v1.0.0 publisher "PrintLoop".

---

## Phase 5 — Install on this PC + first end-to-end (2026-05-28)

**Prompted by:** "insrtall on this pc."

Installed via `Start-Process Setup.exe /S -Verb RunAs`. Exit code 0.
Verified Start Menu entry + Desktop shortcut + registry uninstall
entry all landed.

**First real test against the Sharp:**
- Configured the kiosk app via Ctrl+Shift+S, dev backend at
  `localhost:4000`, kiosk key from `regenerate-key`, printer
  `192.168.0.111` raw9100.
- Uploaded a 1-page PDF via the customer flow.
- Typed the code at the kiosk.
- The bundled-agent path **did not exist yet** at this point — the
  app was still wired to call `/printer/complete` and rely on the
  backend's cloud-push.
- Result: cloud-push dispatch with the dev backend on the same
  LAN worked — paper came out.

---

## Phase 6 — Bundle the agent into the .exe (2026-05-28)

**Prompted by:** "why do i have to Run install-kiosk-pc.ps1
-BuildApp / because I'd like that when i have my .exe i does every
thing from that single install without going outside the .exe."

**Decision:** the agent moves INSIDE the Electron main process.
No more sidecar agent, no more separate Scheduled Task. The .exe
contains the touchscreen UI AND the polling/dispatch logic.

### Files added

- `printloop-kiosk-app/agent.js` (**new**, ~330 lines) — the
  polling + dispatch logic lifted from `printloop-agent/agent.ts`
  and refactored into a Node-importable module. Exports
  `startAgent(config, emit)` and a stop function.
- `printloop-kiosk-app/setup.html` (**new**) — the first-run
  configuration wizard. Brutalist styled to match the kiosk's
  aesthetic. Sections:
  - Cloud (backend URL, kiosk API key, **"Test cloud
    connection"** button).
  - Printer (IP, transport radio IPP/Raw-9100, IPP port/path/
    version, raw port, **"Test printer reachability"** button).
  - Behaviour (poll interval, auto-start checkbox).
- `printloop-kiosk-app/setup-preload.js` (**new**) — minimal
  contextBridge exposing `window.printloopSetup.{getConfig,
  testCloud, testPrinter, save, cancel}`. `nodeIntegration:false`,
  `contextIsolation:true`.

### Files updated

- `printloop-kiosk-app/main.js` rewritten:
  - Reads config from `app.getPath('userData')/config.json` on
    boot. If incomplete, opens the setup wizard window.
  - On `setup:save`, persists config, sets `LoginItemSettings`,
    boots the agent inline, opens the kiosk window.
  - Adds `bootAgent(cfg)` → calls `startAgent` and forwards every
    emit via `kioskWin.webContents.send('agent:event', ev)`.
  - File logger that mirrors `console.{log,error,warn}` to
    `userData/app.log` (so production builds without an attached
    console leave a paper trail).
  - Kiosk window now seeds `pl_kiosk_apiBase` + `pl_kiosk_key`
    into the page's localStorage from saved config (`reload()`
    after seeding if the values differ — guarded by a flag to
    avoid an infinite reload loop).
- `printloop-kiosk-app/package.json` — `"dependencies":` block
  added (`axios`, `ipp`). The `"build.files"` glob now includes
  `agent.js`, `setup.html`, `setup-preload.js`.
- `install-kiosk-pc.ps1` simplified — the .exe now self-installs
  + self-configures, so this script's only job is the silent NSIS
  install for multi-PC rollouts.
- `printloop-agent/README-deprecated.txt` (new) — points at the
  bundled version.

**Built v2 .exe** (still 78 MB). Uninstalled v1, installed v2,
cleared userData to force the wizard. The wizard appeared on
first launch.

### BOM bug

PowerShell's `Out-File -Encoding utf8` writes UTF-8 **with BOM**.
`JSON.parse` rejects strings starting with `﻿`. After patching
the config via PowerShell, the kiosk app booted with
`config: baseUrl=null printerIp=null transport=null complete=false`
and opened the wizard.

**Fix:** `readConfig()` in `main.js` now strips BOM before
`JSON.parse`. Also rewrote the existing config via Node (UTF-8
no BOM) to recover the running instance.

### Wake-on-sleep retry

Added to `agent.js` after the first live test against the Sharp
showed it kept dropping the network after a few minutes idle:
- Per-attempt: if `dispatchToPrinter` fails with `ETIMEDOUT` /
  `ECONNREFUSED` / `EHOSTUNREACH`, send a "wake-up" TCP knock to
  port 80 (the printer's web admin — kept warmer than 9100 by
  most firmware), wait 3 s, retry once with a longer timeout.
- Background: a `keepAliveMs` timer (default 30 s) taps the
  printer's lighter ports (80 → 631 → rawPort) to keep its
  network stack hot.

---

## Phase 7 — Auto-discover the printer (2026-05-28)

**Prompted by:** "its starting to get stressful / why not let the
printloop kiosk software have the ability to scan and detect
printers."

The user was tired of finding the printer's IP manually as it
moved around the LAN.

### Files added

- `printloop-kiosk-app/discovery.js` (**new**) — three discovery
  sources, merged:
  1. **mDNS / Bonjour** (`bonjour-service`) — listens for `_ipp`,
     `_ipps`, `_pdl-datastream` service types. Modern printers
     advertise themselves; we get IP + model + capabilities
     instantly.
  2. **TCP port scan** of the local `/24` for ports 631 + 9100
     in parallel chunks of 48. Catches older / quirky printers.
  3. **IPP enrichment** — for each candidate without a model
     name yet, runs `Get-Printer-Attributes` with a 4-second
     budget across `/ipp/print`, `/ipp/lp`, `/ipp`, `/` paths.
  Returns a deduplicated list. The recommended transport is
  picked per-printer: Sharp/MX/MFP model names → `raw9100` +
  IPP 1.1; everything else → `ipp` + default path; raw-only →
  `raw9100`.

### Files updated

- `main.js` — added `setup:discoverPrinters` IPC handler.
- `setup-preload.js` — exposed `printloopSetup.discoverPrinters`.
- `setup.html` — added a big orange **"🔍 Scan for printers on
  this network"** button. Hits the IPC, renders results as
  click-to-fill cards.
- `package.json` — added `bonjour-service`, added `discovery.js`
  to the build files glob.

**Verified:** the scan found "SHARP MX-5112N" at `192.168.0.100`
in 4 seconds, click-to-filled all the printer fields with `raw9100`
preselected.

---

## Phase 8 — The Sharp keeps falling off the network (2026-05-28)

A series of "try again" rounds while the user worked through their
printer's behavior. None of this required code changes — it was all
diagnostic. Captured here for completeness.

**Symptoms observed:**
- Sharp would appear via mDNS announcement, but every TCP port
  would be `ECONNREFUSED` seconds later — print services
  administratively dead while the mDNS responder kept running.
- ARP cache would show two different MACs at `.100` between
  probes (`c8:a6:ef:34:f1:14` vs `2a:ee:52:bf:ee:03`) —
  signature of a DHCP conflict between two devices that both
  claimed the IP.
- Wake-on-LAN magic packet sent to the MAC didn't bring the
  printer back (WOL was disabled on the device).
- Subnet-wide scan found zero printers on `192.168.0.0/24`.

**What ruled out a kiosk-software bug:** every layer of the
pipeline succeeded against a virtual IPP printer in this same
session (cloud → bundled agent → vprinter → byte-exact bytes in
`data/printed/`). The chain works; the Sharp's network state was
the variable.

---

## Phase 9 — Direct Ethernet, APIPA, and the Tailscale black hole (2026-05-28)

**Prompted by:** "im now connected to the printer using an ethernet
cable / the ip seem to have change on it own / 169.254.220.73."

Series of events:

1. User plugged a direct Ethernet cable from PC to Sharp.
2. PC's Ethernet got an APIPA address (`169.254.151.137/16`).
3. Sharp's wired interface got its own APIPA (`169.254.220.73/16`).
4. Both on the same `/16` — should be directly reachable.
5. But every probe to `169.254.220.73` returned `ETIMEDOUT`. Even
   ping.

**Root cause discovered with `Find-NetRoute`:** Windows was
routing `169.254.220.73` through the **Tailscale tunnel**
(left over from the cloud-push experiments in Phase 2), which has
its own `169.254.83.107/16` interface. Tailscale's route metric
won; packets disappeared into the tunnel.

**Fix:** source-IP binding. In `agent.js`:
- New `pickSourceAddress(destIp)` — if `destIp` is in
  `169.254.0.0/16`, walk `os.networkInterfaces()` and return the
  IP of a **physical** adapter (Ethernet/Wi-Fi) in that range,
  skipping any whose name matches a tunnel signature:
  ```
  /^(tailscale|wg|wireguard|openvpn|tap|tun|zerotier|nordvpn|
       expressvpn|hamachi|outline|vmware|virtualbox|hyper-v|
       loopback pseudo)/i
  ```
- All `net.createConnection` calls (raw dispatch, the keep-alive
  taps, the wake-up knock) pass `localAddress` from this picker.

**First attempt at the fix shipped Tailscale's APIPA as the
source** because the iteration order put Tailscale first. The
`TUNNEL_NAME_RX` filter was the second iteration.

**Verified live:** with source-binding, a direct Node script sent
a 1.2 KB PJL+PDF stream to `169.254.220.73:9100` and a sheet came
out of the Sharp. Then the same logic running inside the bundled
agent succeeded through the full kiosk-pull pipeline:
```
[0s] releasing
[2s] done
```

This was the first end-to-end cloud-customer → cloud → bundled
agent → real Sharp → physical paper succession.

---

## Phase 10 — Push everything to GitHub (2026-05-28 13:01)

**Prompted by:** "push to all update to github."

**Commit `b054c06`** — `feat: kiosk-pull architecture + bundled
Electron kiosk app`. Combined the work of Phases 3, 4, 6, 7, 9
into one commit. 28 files added/modified. Vercel auto-redeployed
the frontend; Railway auto-redeployed the backend (which now
has the agent endpoints + RELEASING enum live).

What carried in this single push:
- All the kiosk-pull backend changes
- All the standalone agent files
- All the Electron-kiosk-app files (source, not the .exe)
- The auto-discovery module
- The APIPA source-binding + tunnel filter
- The install-kiosk-pc.ps1 orchestrator
- The deprecation notes for the old shells

---

## Phase 11 — Phone-first frontend redesign (2026-05-28 14:00 → 17:51)

**Prompted by:** "the frontend is not well optimized for phones,
its great on pc on full screen and starts to becoome scattered
once it shrinks."

Asked via `AskUserQuestion`: scope (which areas) and approach
(small fixes vs phone-first redesign). **User chose: all areas +
phone-first redesign.**

### Tracked as 6 tasks (#45 → #50)

- **#45 Foundation** — built the responsive shell + primitives.
- **#46 Landing + auth** — phone-first hero, form keyboard hints.
- **#47 Dashboard / wallet / jobs** — ResponsiveTable for lists.
- **#48 Print flows** — single/batch/group new-print pages.
- **#49 Group participant upload** — phone-shaped Shell.
- **#50 Settings + admin console** — admin sidebar collapses to
  scrolling tab strip on mobile.

### New layout primitives (`printloop-new-frontend/src/components/layout/`)

- **`MobileNav.tsx`** — full-height drawer that slides in from
  the right with backdrop, scroll lock, focus trap, Esc to close,
  auto-close on route change.
- **`BottomTabBar.tsx`** — fixed-bottom 4-tab nav on phones
  (`md:hidden`). Honors `env(safe-area-inset-bottom)` for iOS
  notch.
- **`ResponsiveTable.tsx`** — `<table>` on `md:+`, stacked phone
  cards below. Drop-in replacement for hand-rolled grid tables.
- **`StickyCTA.tsx`** — bottom-sticky summary + primary action
  for long forms.

### Updated layouts + pages

- `AppLayout.tsx` — logo + MENU button on mobile, full horizontal
  nav on `lg:`. Reserves bottom padding for the tab bar.
- `EditorialFooter.tsx` — stacks vertically on phone.
- `index.html` — `viewport-fit=cover` for iOS notch handling +
  `<meta name="theme-color">`.
- 14 pages touched with scaled type + responsive padding +
  `inputMode` / `autoComplete` / `autoCapitalize` on every email
  / phone / password field.

### Untrack the local TS build cache

- `printloop-new-frontend/tsconfig.tsbuildinfo` was previously
  tracked despite matching `*.tsbuildinfo` in `.gitignore`. Removed
  from the index in the commit.

**Commit `38d49a4`** — `feat(frontend): phone-first responsive
redesign across all customer surfaces`. 25 files. Vercel
auto-redeployed.

---

## Phase 12 — Backend URL bug (2026-05-28 18:19)

**Prompted by:** "when adding backend url to the kiosk it doesnt
work / printloop-production.up.railway.app."

The user typed just the hostname (no `https://`). The setup wizard's
`<input type="url">` rejected it; with `type="text"` the test
request went to a relative path and silently `ENOTFOUND`'d.

**Fix:**
- `setup.html` — input type relaxed to `text` (spellcheck off).
  `readForm()` runs `normalizeBaseUrl()` which auto-prefixes
  `https://` on bare hostnames. On blur, normalize and write back
  into the field so the user sees the corrected URL.
- `main.js` — `setup:save` and `setup:testCloud` both call
  `normalizeBaseUrl()` at the trust boundary. `readConfig()`
  normalizes on load — protects against hand-edited
  `config.json` with a missing scheme.

**Commit `913c3c6`** — `fix(kiosk-app): auto-prefix https:// on
bare hostnames in setup wizard`.

Also in this turn — fixed the running install's config
(`https://printloop-production.up.railway.app`) and rebuilt the
.exe.

---

## Phase 13 — "print job didn't send" → flip Railway to kiosk-pull (2026-05-28 evening)

**Prompted by:** "print job didn't send from the when i created on
the website and input the code / it say, printjob didnt send. try
again or use a different kiosk."

The exact error message — "The printer didn't accept this job.
Try again or use another kiosk." — came from the backend's
cloud-push branch returning 502 when the IPP dispatch failed.

**Diagnosis:** **Railway was still in `cloud-push` mode.** The
kiosk app was correctly built for kiosk-pull (with bundled
agent), but Railway's `printDispatchMode` had never been flipped.
When the kiosk POSTed `/printer/complete`, Railway tried to IPP-
dispatch the printer itself — impossible from the cloud — and
returned the error.

**Fix:** logged in via the default admin (`admin@printloop.test`
/ `Admin1234!`), read the current setting (`"cloud-push"`),
PATCH'd it to `"kiosk-pull"`. Settings cache TTL on the backend
is 20 s — told the user to wait 30 s and retry.

No code change; data change only.

---

## Phase 14 — "it works when i apply http first" (2026-05-28 late evening)

**Prompted by:** "it works when i apply http first it was my
mistake."

Confirmation that with the corrected URL + Railway in kiosk-pull
mode, the full chain from Vercel-customer-app → Railway → kiosk
window → bundled agent → Sharp → paper succeeded end-to-end.

The `https://` auto-prefix from Phase 12 means future kiosk
operators won't trip on the same thing.

---

## Phase 15 — Physical-print confirmation (2026-05-29 04:46)

**Prompted by:** "i also need the kiosk to first confirm that the
document has been printed physically before saying that it printed
/ make it keep loading, and get feed back that it was printed.
sending the document isnt enough."

The user noticed: when raw-9100 socket closes cleanly, the agent
considers the job DONE. But that only means the printer ACCEPTED
the bytes. If it's out of toner / jammed / holding the job for an
operator login, no paper comes out — but the kiosk shows green.

### Decision via `AskUserQuestion`

- **On no-confirm:** "Always wait for confirm, never fall back"
  (with retry).
- **Timeout shape:** "Scale with page count (30 s base + 3 s per
  page)."
- **Max attempts:** default 2, configurable.

### Plan written + approved

Plan file: `~/.claude/plans/mossy-skipping-anchor.md`. Used
ExitPlanMode for sign-off.

### Files added

- `printloop-kiosk-app/kiosk-preload.js` (**new**) — exposes
  `window.printloopKiosk.onAgentEvent(callback)` via
  `contextBridge`. Mirrors `setup-preload.js`'s shape. Whitelist
  only.

### Files updated

- `01-backend/routes/agent.routes.ts` — `/jobs/ready` items now
  include `totalPages: number` (single-job:
  `Math.max(1, job.totalPages || 1)`; batch:
  `Math.max(1, it.totalPages || 1)`). The agent needs this to
  compute expected impressions.
- `printloop-kiosk-app/agent.js`:
  - `+ dgram` import.
  - **`snmpReadCounter(host, community='public', timeoutMs=3000)`**
    — hand-rolled SNMPv1 GetRequest packet for OID
    `1.3.6.1.2.1.43.10.2.1.4.1.1` (`prtMarkerLifeCount.1.1`,
    the Printer-MIB lifetime impression counter). Walks the
    BER response and returns the trailing integer-like value
    (Counter32 / Gauge32 / Integer / TimeTicks). Returns `null`
    on timeout / parse failure.
  - **`dispatchAndConfirm(cfg, bytes, jobName, opts,
    expectedPages, emit, code, itemName)`** — wraps the
    existing dispatch with a before/dispatch/poll/retry loop.
    Per-attempt timeout = `30000 + 3000 × expectedPages` ms.
    Polls every 3 s. Up to `cfg.maxPrintAttempts` (default 2,
    capped 5).
  - **`processJob`** rewritten — calls `dispatchAndConfirm`
    instead of `dispatchToPrinter` directly. Computes
    `expectedPages = copies × item.totalPages` per item.
  - **New events emitted** for the kiosk UI: `dispatching`,
    `awaiting-confirmation`, `progress`, `confirmed`,
    `attempt-timeout`, `verify-failed`. Existing `claim` /
    `complete` / `failed` shapes preserved.
  - **`startAgent`** config picker now reads
    `config.maxPrintAttempts` (clamped 1–5).
- `printloop-kiosk-app/main.js` — kiosk `BrowserWindow`'s
  `webPreferences` now sets `preload:
  path.join(__dirname, 'kiosk-preload.js')`. Existing
  `kioskWin.webContents.send('agent:event', ev)` already
  forwards every emit verbatim.
- `printloop-kiosk-app/package.json` — added `kiosk-preload.js`
  to the build files glob.
- `printloop-kiosk-app/setup.html` — added "Max print attempts"
  field in the Behaviour fieldset (default 2, min 1, max 5).
  `readForm()` writes `maxPrintAttempts`. Hydration reads it.
- `printloop-kiosk/index.html` — the source-of-truth kiosk UI:
  - Added a status sub-line under the existing `printing`
    screen (`#dispatchStatus`).
  - New `startAgentSub` / `stopAgentSub` helpers that subscribe
    to `window.printloopKiosk.onAgentEvent` (Electron-bundled
    mode) and unsubscribe on every non-`printing` screen
    change.
  - `releaseJob()` rewritten — POST `/printer/complete` as
    before, but on success NO LONGER calls `success()`
    immediately. Subscribes to agent events; `confirmed`
    flips to success ("Job XYZ printed. Collect N pages."),
    `verify-failed` flips to error with the agent's reason,
    `progress` updates the sub-line ("Printing — N of M…"),
    `attempt-timeout` shows "Retrying — …".
  - Same pattern in `releaseBatch()`.
  - **Fallback** preserved — when run as a plain served page
    (no Electron preload bridge), the UI falls back to the
    legacy "trust the POST" behavior so it works in dev /
    standalone-serve mode.
  - Safety upper-bound — if no terminal event arrives within
    10 minutes, the kiosk shows "Printer didn't report back —
    check the printer for paper or jam."

### Out of scope (deliberately deferred)

- Page-range printing in agent dispatch. The current agent prints
  every page in the PDF regardless of `printConfiguration.pages
  === "range"`. `expected = copies × totalPages` matches what the
  printer actually produces today. Fixing the range path is a
  separate change.
- IPP transport confirmation. The IPP code path is rarely used
  (raw-9100 + PJL is the default for the Sharp). IPP has its own
  job-state model (`Get-Job-Attributes` → `job-state-completed`)
  which would be more correct but needs separate plumbing.
- Custom SNMP community strings. Hard-coded `"public"`, the
  factory default on every printer this targets.

**Commit `9b667d1`** — `feat(kiosk): physical-print confirmation
via SNMP page counter`. 7 files, +427/-12.

Built v3 .exe, uninstalled v2, installed v3. The agent is now
polling Railway with the new dispatch-and-confirm logic loaded —
the next time the user wakes the Sharp and runs a job, the
status sub-line should cycle through the new events and the
kiosk should only flip to success after the printer's lifetime
counter actually advances.

---

## Phase 16 — This journal (2026-05-29 04:50)

**Prompted by:** "create a .md of a journal of all the thing we
did resove added, removed, readded, etc and always update this
file every time."

Created `JOURNAL.md` (this file) at the repo root.

Maintenance rule: any future change should append a new phase here
**before** the commit that ships it. Reference the commit hash
once it lands. Do not rewrite earlier phases unless correcting an
honest mistake — strike through with `~~text~~` and note the
correction inline.

---

## Open items / debt to address later

- **Page-range agent dispatch.** When the customer selects "pages
  1–5,10" the agent still sends the whole PDF and the SNMP
  expected-count is off. Fix: thread `parsePageRange` from the
  backend into the agent's PJL stream (PJL `PRANGE` or rebuilt
  PDF) AND compute expected from the range size.
- **SNMP community string in the wizard.** Hard-coded `public`
  today. Enterprise deployments often lock SNMP behind a
  community string — needs a wizard field + agent override.
- **Multi-kiosk SNMP collision.** Two kiosks pulling from the
  same printer would both watch the same lifetime counter and
  could race on whose job advanced it. Today every kiosk has its
  own printer, but if anyone deploys shared printers we'd need
  per-job SNMP page-counter (`prtAuxiliarySheetStartJob`) or IPP
  job-state.
- **Group-batch in kiosk-pull mode.** The agent doesn't yet
  claim group-batch jobs (they fan out across participant
  uploads). Returns 501 with "Switch to cloud-push for group
  sessions" in the meantime.
- **IPP transport confirmation.** See Phase 15 out-of-scope.
- **Settings cache TTL of 20 s.** Backend reads `printDispatchMode`
  through a 20-second cache. After any `/admin/settings/:key`
  PATCH, there's a window where the old value is still
  observable. Acceptable for an admin-only setting but worth
  documenting.

---

## Glossary of files this session has touched

- **Backend** (`01-backend/`) — Express + TypeORM + SQLite.
  - `routes/agent.routes.ts` — kiosk-pull endpoints (new this
    session).
  - `routes/printer.routes.ts` — cloud-push + kiosk-pull branch.
  - `entities/printJob.entity.ts` — `RELEASING` enum value.
  - `services/printPolicy.service.ts` — `printDispatchMode()`.
  - `config/settings.ts` — `printDispatchMode` catalog entry.
  - `start.sh` — Tailscale-or-not boot script.
- **Standalone agent** (`printloop-agent/`) — Node module, archived.
- **Electron kiosk app** (`printloop-kiosk-app/`) — the .exe build.
  - `agent.js` — bundled polling + dispatch + SNMP confirm.
  - `discovery.js` — mDNS + scan + IPP enrichment.
  - `main.js` — Electron main process, IPC, lifecycle.
  - `kiosk-preload.js` — kiosk-window IPC bridge.
  - `setup-preload.js` — setup-window IPC bridge.
  - `setup.html` — first-run wizard UI.
  - `build/icon.png` — generated brand icon.
  - `build/make-icon.js` — icon generator.
- **Source kiosk UI** (`printloop-kiosk/index.html`) — touchscreen
  page, synced into the Electron renderer at build time.
- **Customer + admin frontend** (`printloop-new-frontend/`) —
  Vite + React + RTK Query.
  - `components/layout/{MobileNav,BottomTabBar,ResponsiveTable,
    StickyCTA}.tsx` — new responsive primitives.
- **Orchestrators** at repo root.
  - `install-kiosk-pc.ps1` — silent rollout helper.
  - `vercel.json` (under `printloop-new-frontend/`) — Vercel
    build config.
  - `01-backend/railway.toml` — Railway build config.
