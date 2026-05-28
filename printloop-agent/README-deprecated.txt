printloop-agent — STATUS: ARCHIVED / OPTIONAL
==============================================

The polling + dispatch logic that used to live here is now bundled
INSIDE the kiosk Electron app at:

    ../printloop-kiosk-app/agent.js

Run the kiosk Setup.exe and the agent runs automatically — no
separate install, no Node, no .env, no Scheduled Task.

This folder is kept only for:
  - Headless deployments where you want JUST the agent without
    the touchscreen UI (e.g. a print-server box behind a kiosk
    panel running somewhere else).
  - Local development / e2e testing convenience.

Source of truth for the dispatch code: ../printloop-kiosk-app/agent.js
This standalone copy (agent.ts) is kept in sync manually; if you
change one, mirror the change to the other.
