# 9 · ON-SITE AGENT (printloop-agent/)

> Folder: `printloop-agent/`
> role — Node service that runs on the shop LAN and prints jobs the cloud can't reach.
>   Polls /api/agent/jobs/ready, claims a RELEASING job, downloads the bytes, dispatches to
>   the LAN printer via IPP / raw9100 / OS spooler, and reports complete/failed with
>   V2-44 job-truth confirmation.

```

printloop-agent/agent.ts
  role — the entire on-site agent program
  details — loadConfig() reads .env (PRINTLOOP_BASE_URL, KIOSK_API_KEY, PRINTER_IP/NAME,
    PRINTER_PORT, PRINTER_TRANSPORT ipp|raw9100|spooler, PRINTER_RAW_PORT, IPP_PATH,
    IPP_VERSION, POLL_INTERVAL_MS, PRINTER_NAME, SPOOLER_COMMAND, CONFIRM_TIMEOUT_MS,
    CONFIRM_DISABLE). cloudApi(cfg) builds an axios client with X-Kiosk-Key + 30s timeout.
    Main loop: startup probe (/jobs/ready, 401→fatal), reportCapabilities once + every 6h
    (IPP Get-Printer-Attributes → color/duplex/A3/media → POST /api/agent/printer/capabilities),
    then setInterval poll loop with overlap prevention (running guard).
    pollOnce: GET /jobs/ready, for each job call processJob.
    processJob: POST /jobs/:id/start (atomic claim, 409→skip), for each item download bytes
    via signed URL, dispatchToPrinter, then report /jobs/:id/complete or /failed. Only marks
    FAILED if every item failed; partial success → DONE. Reports confirmation (confirmed/
    unconfirmed) + method (ipp-job-state/queue-drain/none) + detail.
    dispatchToPrinter:
      - raw9100 → rawDispatch: PJL prologue (UEL, @PJL JOB NAME, COPIES, DUPLEX, BINDING,
        RENDERMODE, PAPER, ORIENTATION, RESOLUTION, ECONOMODE, ENTER LANGUAGE) + bytes +
        epilogue over TCP; no feedback channel → unconfirmed/none.
      - spooler → spoolerDispatch: writes temp .pdf/.pwg, runs cmdTemplate (default
        Windows Start-Process -Verb PrintTo, Linux lp -d), deletes temp file; then
        confirmSpoolerDrain (Windows: Get-PrintJob powershell query; Linux: lpstat -o) →
        confirmed when queue empty, unconfirmed on timeout/error-state.
      - ipp → ippDispatch: ipp.Printer → Print-Job with operation + job attributes build from
        buildIppJobAttributes (copies, sides, print-color-mode, orientation-requested,
        media iso_a4/iso_a3/na_letter/na_legal, multiple-document-handling + sheet-collate,
        print-quality 3/4/5 from dpi). If jobId undefined → unconfirmed. If CONFIRM_DISABLE →
        unconfirmed. Else confirmIppJob: poll Get-Job-Attributes until completed (confirmed),
        canceled/aborted → throw, timeout/no-support → unconfirmed.
    queryPrinterCapabilities: IPP Get-Printer-Attributes for color-supported,
    print-color-mode-supported, sides-supported, media-supported → {color, duplex, a3, media}.
    reportCapabilities: POSTs capabilities to the backend.

printloop-agent/agent.ts (config + types inline)
  role — config + type definitions
  details — Config interface, Confirmation interface ({state: confirmed|unconfirmed,
    method: ipp-job-state|queue-drain|none, detail?}), ReadyJob/ReadyJobItem interfaces
    (fileId, fileName, downloadUrl, printConfiguration, id, code, jobType, totalPages,
    updatedAt, items).

printloop-agent/package.json / package-lock.json
  role — agent dependencies + scripts

printloop-agent/tsconfig.json
  role — agent TypeScript config

printloop-agent/install.ps1 / install.sh
  role — agent install helpers (Windows + shell)

printloop-agent/build-installer-exe.ps1
  role — builds an installer exe for the agent (Windows)

printloop-agent/.env.example (implied)
  role — agent env template
  details — documents required env vars for the agent.

printloop-agent/dist/ (if present)
  role — compiled agent output
