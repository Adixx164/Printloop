# PrintLoop CUPS backend

Turns a Linux/macOS box into a "Print → PrintLoop" target. CUPS spools the
document; the `printloop` backend script POSTs it to PrintLoop's API; the
user enters the release code at any PrintLoop kiosk to actually print.

```
File → Print → PrintLoop   (any app)
        │
        ▼
 ┌─────────────┐    spooled PDF     ┌─────────────────────┐
 │ local CUPS  │ ─────────────────▶ │ /usr/lib/cups/backend│
 │  (lpd/ipp)  │                    │       /printloop      │
 └─────────────┘ ◀────── stderr ─── └──────────┬───────────┘
                  release code               │ HTTPS multipart
                                             ▼
                                  POST /api/cups/print  ──▶  PrintLoop
                                  (Bearer <printToken>)         ↓
                                                          release code
```

## Prerequisites

- `cups` running (Linux: `systemctl start cups`; macOS: ships in the OS).
- `curl` on PATH.
- A PrintLoop account with a print token — rotate one at
  `https://<your-printloop-host>/account/print-token` (or via the API:
  `POST /api/customer/print-token/rotate`).

## Install

Interactive:

```sh
sudo ./install.sh
# → prompts for PrintLoop host and print token
```

Unattended (e.g. for fleet provisioning):

```sh
sudo PRINTLOOP_HOST=printloop.ng \
     PRINTLOOP_TOKEN=<80-char-hex> \
     QUEUE_NAME=PrintLoop \
     ./install.sh
```

What it does:

1. Copies `printloop` to `/usr/lib/cups/backend/` (Linux) or
   `/usr/libexec/cups/backend/` (macOS), mode 0755 root.
2. Restarts CUPS (`systemctl` or `launchctl`).
3. `lpadmin -p PrintLoop -E -v "printloop://HOST/?token=…"` to create or
   update the queue, with the generic PostScript PPD.

## Verify

```sh
lpstat -p PrintLoop          # → "printer PrintLoop is idle. enabled since…"
lpq -P PrintLoop             # → "no entries"
echo "hi" | lp -d PrintLoop  # → submits a job (will fail at PDF
                             #   validation, which is the correct smoke
                             #   signal that the round-trip is working)
```

To do a real test, print a PDF:

```sh
lp -d PrintLoop ~/Documents/example.pdf
lpq -P PrintLoop -l          # → look for the "PrintLoop release code:"
                             #   line in the "Job notes" section
```

Then enter that code at any PrintLoop kiosk.

## Uninstall

```sh
sudo lpadmin -x PrintLoop                       # remove the queue
sudo rm /usr/lib/cups/backend/printloop         # Linux
sudo rm /usr/libexec/cups/backend/printloop     # macOS
```

## Troubleshooting

Backend logs go to `/var/log/cups/error_log` — search for
`INFO: PrintLoop` to see this script's traces.

| Symptom                                        | Likely cause                       | Fix                                                  |
|------------------------------------------------|------------------------------------|------------------------------------------------------|
| Job goes to "Stopped — Authentication required" | 401 — token rotated or wrong host | Rotate a new token; re-run `install.sh`              |
| Job stops, log shows `ERROR: ... (HTTP 413)`   | File over the configured limit     | Compress / split the PDF; admin can raise `maxFileSizeMb` |
| Job stops, log shows `ERROR: ... (HTTP 415)`   | Non-PDF/JPG/PNG spooled            | Print to PDF first in the source app                 |
| Job retries forever with `(HTTP 5xx)`          | PrintLoop API unreachable          | Check the host, TLS, network                         |
| `lpstat -t` shows "rejecting jobs"             | Queue was disabled by CUPS         | `cupsenable PrintLoop && cupsaccept PrintLoop`       |
| Spooler doesn't see "printloop"                | CUPS not reloaded after install    | `sudo systemctl restart cups` (Linux) / `launchctl kickstart -k system/org.cups.cupsd` (macOS) |

## Security model

- The print token is a bearer secret. Whoever has it can submit jobs
  billed to your wallet until you rotate it.
- The token lives in the CUPS device URI, which is stored locally in
  `/etc/cups/printers.conf` (root-readable only on a properly configured
  system).
- All traffic to PrintLoop is HTTPS (the script flips to HTTP only for
  `localhost` / `*.local` hosts to make dev testing painless).
- To revoke: hit `POST /api/customer/print-token/rotate` (the dashboard
  has a button) — the old token starts returning 401 immediately.

## Architecture note

This is the **canonical "act as a network printer"** pattern used by
SavaPage and the OpenPrinting reference deployments. We deliberately do
not run a Node IPP server — CUPS already implements IPP correctly, our
~150-line backend script is the entire glue.
