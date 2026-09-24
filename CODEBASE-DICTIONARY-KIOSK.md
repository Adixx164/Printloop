# 8 · KIOSK APP (Electron UI + main-process print)

> Folder: `printloop-kiosk-app/`
> role — in-store kiosk UI: code entry → job details → printing → settings.
>   Main process manages the Electron window, IPC, heartbeat, IPP print, and
>   print-job fetch + dispatch.

## main process

```

printloop-kiosk-app/src/main/index.ts
  role — Electron main-process bootstrap
  details — creates a fullscreen/kiosk BrowserWindow (1920×1080, frameless), loads the
    renderer (dev: localhost:5173; prod: index.html), sets up IPC handlers, starts/stops
    heartbeat, exposes app:get-version / app:get-platform / app:quit / app:restart via IPC,
    logs uncaught exceptions + unhandled rejections.

printloop-kiosk-app/src/main/ipc.ts
  role — IPC handler bridge between renderer and main
  details — setupIpcHandlers(): settings:get / settings:set (KioskSettings), print-job:fetch
    (fetchPrintJob by code via API key), print-job:print (printJob to printerUri + artifactKey),
    printer:list (listPrinters via IPP), printer:test (testPrinter). emitKioskEvent broadcasts
    to renderer via 'kiosk:event'.

printloop-kiosk-app/src/main/heartbeat.ts
  role — periodic heartbeat to the cloud backend
  details — startHeartbeat(): POSTs /api/kiosk/heartbeat (tenantId, kioskName, status:online,
    timestamp) with the API key every heartbeatInterval; emits success/failed events. No-op when
    not configured. stopHeartbeat() clears the interval.

printloop-kiosk-app/src/main/ipp.ts
  role — IPP printer interaction (list, test, PWG print)
  details — listPrinters() via ipp.getPrinters() → PrinterInfo[]; printPwgToIpp(printerUri,
    pwgFilePath): reads the PWG artifact, does IPP Print-Job with document-format
    application/vnd.pwg-raster, returns success + jobId/error; testPrinter(printerUri): Get-
    Printer-Attributes probe → TestPrintResult.

printloop-kiosk-app/src/main/printJob.ts
  role — print-job fetch + PWG dispatch
  details — fetchPrintJob(apiUrl, apiKey, code): GET /api/kiosk/jobs/:code → PrintJobData
    (id, code, artifactKey, pageCount, colorPages, monoPages, cost, customerName, fileName).
    printJob(printerUri, artifactKey): downloads PWG from S3, writes temp .pwg, calls
    printPwgToIpp, cleans up temp file.

printloop-kiosk-app/src/main/settings.ts
  role — kiosk settings persistence + config
  details — getSettings / setSetting / loadSettings: reads/writes kiosk config (apiUrl, apiKey,
    tenantId, kioskName, printerUri, heartbeatInterval, etc.) to a local file; isConfigured()
    checks required fields.

printloop-kiosk-app/src/main/config/index.ts (and .js/.d.ts)
  role — kiosk config types/constants
  details — KioskSettings shape + config helpers.

printloop-kiosk-app/src/main/utils/logger.ts (+ .js/.d.ts)
  role — kiosk main-process logger
  details — structured logging used by main process modules.

printloop-kiosk-app/src/main/utils/s3.ts (+ .js/.d.ts)
  role — S3 download helper for kiosk
  details — downloadFromS3(artifactKey): fetches the pre-rendered PWG artifact bytes.

printloop-kiosk-app/src/preload/index.ts (+ .js/.d.ts)
  role — Electron preload script
  details — exposes a narrow, context-isolated API to the renderer for settings/print-job/
    printer IPC calls; no nodeIntegration.

## renderer (UI)

```

printloop-kiosk-app/src/renderer/main.tsx
  role — renderer entry point
  details — mounts the React app inside the Electron window.

printloop-kiosk-app/src/renderer/index.html
  role — renderer HTML shell

printloop-kiosk-app/src/renderer/App.tsx
  role — kiosk renderer app shell + screen router
  details — wires up the kiosk screens (code entry, job details, printing, settings, error).

printloop-kiosk-app/src/renderer/types.ts (+ .js/.d.ts)
  role — renderer TypeScript types
  details — shared types for the kiosk renderer.

printloop-kiosk-app/src/renderer/hooks/useKiosk.ts
  role — kiosk runtime hook
  details — ties renderer UI to main-process IPC + kiosk state.

printloop-kiosk-app/src/renderer/screens/CodeEntryScreen.tsx
  role — code entry screen
  details — the screen where the customer enters the 6-digit release code.

printloop-kiosk-app/src/renderer/screens/JobDetailsScreen.tsx
  role — job details screen
  details — shows the released job info before printing.

printloop-kiosk-app/src/renderer/screens/PrintingScreen.tsx
  role — printing screen
  details — shows printing progress / result.

printloop-kiosk-app/src/renderer/screens/SettingsScreen.tsx
  role — settings screen
  details — kiosk config UI (API URL, key, printer, etc.).

printloop-kiosk-app/src/renderer/screens/ErrorScreen.tsx
  role — error screen
  details — user-friendly error state.

printloop-kiosk-app/src/renderer/styles.css
  role — kiosk renderer styles

printloop-kiosk-app/src/utils/logger.ts (+ .js/.d.ts)
  role — kiosk renderer logger

printloop-kiosk-app/src/utils/s3.ts (+ .js/.d.ts)
  role — kiosk renderer S3 helper (if used in renderer)

printloop-kiosk-app/src/config/index.ts (+ .js/.d.ts)
  role — kiosk renderer config

## build / packaging

```

printloop-kiosk-app/package.json / package-lock.json
  role — kiosk app dependencies + scripts

printloop-kiosk-app/tsconfig.json / tsconfig.main.json / tsconfig.renderer.json
  role — TypeScript configs for main vs renderer

printloop-kiosk-app/vite.config.ts / vite.config.js / vite.config.d.ts
  role — Vite build config for the renderer

printloop-kiosk-app/electron-builder.json
  role — electron-builder config
  details — produces the distributable (Setup.exe on Windows, etc.).

printloop-kiosk-app/index.html
  role — top-level HTML (electron window load target in some configs)

printloop-kiosk-app/README.md
  role — kiosk app readme

printloop-kiosk-app/kiosk-preload.js / setup-preload.js
  role — preload script artifacts (dev/build)

printloop-kiosk-app/setup.html
  role — setup wizard HTML (installer/first-run)

printloop-kiosk-app/build/make-icon.js
  role — icon build helper

printloop-kiosk-app/dist/
  role — built/output artifacts
  details — includes builder-effective-config.yaml, win-unpacked/* (packed app), renderer
    assets (JS/CSS), main/*.js, preload/*.js, utils/*.js, config/*.js.

printloop-kiosk-app/docker-entrypoint.sh
  role — Docker entrypoint for the kiosk app (if run in a container)
