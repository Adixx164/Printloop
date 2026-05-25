# PrintLoop as a network printer (CUPS)

This document describes the **optional** deployment where PrintLoop shows
up as a regular printer on a user's laptop — so they can `File → Print →
PrintLoop` from any app (Word, Chrome, Preview, GIMP, …) instead of
opening the web upload page.

The web app remains the primary path. CUPS is the power-user / fleet
option.

## What it does

```
File → Print → PrintLoop   (any desktop app)
        │
        ▼
 ┌─────────────┐    spooled PDF     ┌────────────────────────┐
 │ local CUPS  │ ─────────────────▶ │ /usr/lib/cups/backend/  │
 │  (lpd/ipp)  │                    │       printloop         │
 └─────────────┘ ◀── release code ─ └──────────┬──────────────┘
                    on stderr                  │ HTTPS multipart
                                               ▼
                              POST /api/cups/print ─▶  PrintLoop API
                              (Bearer <printToken>)         │
                                                            ▼
                                              real PrintJob (status=READY)
                                                            │
                                                  ▼ user goes to a kiosk,
                                                    enters the release code
                                                            │
                                                            ▼
                                          IPP/IPPS → real printer
```

The CUPS path produces an identical `PrintJob` row to a web upload — same
table, same status machine, same kiosk release flow, same billing. The
only differences are the *ingress* (CUPS instead of multipart from the
browser) and the *auth credential* (a per-user **print token** instead of
a JWT).

## When to use this vs. the web app

| Use the web app for…                                  | Use CUPS for…                                              |
|-------------------------------------------------------|------------------------------------------------------------|
| Previewing the file before paying                     | "Print" from any desktop app without a browser detour      |
| Setting batch options per-file                        | Quickly printing from Office / Preview / Chrome / IDEs     |
| Group / participant flows                             | Fleet-provisioned laptops in a managed lab                  |
| Mobile (Android / iOS)                                | (CUPS isn't relevant on mobile)                            |
| Anyone who has never set up a printer before          | Power users who already know the OS print dialog           |

## Security model

- **The print token is a bearer secret.** Whoever holds it can submit
  jobs billed to that user's wallet until rotation.
- The token is **per-user**, **rotatable on demand** at
  `POST /api/customer/print-token/rotate`, and **invalidated immediately**
  on rotation (the old token starts returning HTTP 401 from the very next
  request).
- The token is stored in the CUPS device URI in
  `/etc/cups/printers.conf`, which is root-readable only on a hardened
  install. Treat it like an SSH private key.
- All traffic is HTTPS. The backend script flips to HTTP only when the
  host is `localhost` / `*.local` (dev mode) — production deployments
  must use HTTPS.
- The token cannot do anything except submit a print job. It is **not** a
  password, **not** session-bearing, and grants no admin / wallet-spend
  endpoints. The maximum blast radius of a leaked token is "someone
  prints stuff billed to me until I rotate."
- Rate-limiting / abuse: the existing global multer limits
  (`maxFileSizeMb`, `maxPagesPerFile` from SystemSetting) apply to the
  CUPS path too — there is no separate code path for limits.

## Constraints

- **PDF / JPG / PNG only.** Same as everywhere else in PrintLoop.
  Modern CUPS (Linux ≥ 2014, macOS ≥ 10.6) spools PDF natively, so this
  is rarely an issue. A PostScript-only legacy driver would hit a 415
  and the user would see `unsupported file type` in their print queue.
- **Page count is server-derived** via `pdf-lib` — clients cannot lie to
  pay less.
- **Wallet behaviour identical** to a web-app single-file upload. If the
  user has insufficient balance, the job is still created at status
  `READY` (releasable) but no wallet debit happens, matching the
  customer-app behaviour.
- **One job per print action.** CUPS submits one document; we create one
  `PrintJob` with `jobType=SINGLE` and one release code.

## Install (Linux or macOS)

The CUPS backend script and installer live in
`tools/cups-printloop/`. The README there has detailed install /
uninstall / troubleshooting steps. Quick form:

```sh
cd tools/cups-printloop
sudo ./install.sh
# → prompts for PrintLoop host and your print token
```

Unattended:

```sh
sudo PRINTLOOP_HOST=printloop.ng \
     PRINTLOOP_TOKEN=<rotated-token> \
     QUEUE_NAME=PrintLoop \
     ./install.sh
```

The user gets their print token from the customer dashboard or by
hitting:

```sh
curl -X POST https://printloop.ng/api/customer/print-token/rotate \
     -H "Authorization: Bearer <JWT>"
```

## Operate

CUPS logs everything the `printloop` backend emits to
`/var/log/cups/error_log`. Grep for `INFO: PrintLoop` to see our traces:

```
INFO: PrintLoop CUPS backend → https://printloop.ng/api/cups/print
INFO: job=42 user=ada title="Q3 report.pdf" copies=1
INFO: PrintLoop accepted — release code H7K3M9 (cost: ₦150)
NOTICE: Enter H7K3M9 at any PrintLoop kiosk to print.
```

The release code is also written to `job-state-message`, so it appears
inline next to the queued job in:

- `lpq -P PrintLoop -l` on the terminal.
- "Print Queue" / "Show All Print Jobs" in the system menu (macOS).
- `gnome-control-center printers` (GNOME).

Backend exit codes follow CUPS conventions:

| Code | CUPS meaning           | When we use it                                  |
|------|------------------------|-------------------------------------------------|
| 0    | OK                     | API returned 200/201                            |
| 1    | failed-permanent       | 403 (account blocked) / 413 / 415 / 422         |
| 2    | auth-required          | 401 — token rotated or wrong                    |
| 4    | retry-current          | 5xx / network / timeout — CUPS retries soon     |
| 5    | retry-later            | (unused; reserved for long-down server)         |

## Future work (v2 deployment — not in this lift)

The **same script** + **same endpoint** can be deployed onto **one
campus print-server box** instead of every user's laptop. The box runs
CUPS, advertises `ipp://printserver.campus.edu/printers/PrintLoop` via
Bonjour/Avahi, and *any* laptop on the LAN — including Windows — does
`Add Printer → PrintLoop` via IPP/Everywhere without installing
anything.

This is the high-leverage deployment for a university, because it puts
the only token on a single server (auditable, rotatable centrally) and
removes per-laptop install friction. It is **out of scope for this
lift** because it is purely a deployment choice — the code is already
correct for it — but a sysadmin can do it today by running `install.sh`
on the campus box.

Why we did **not** build a Node-native IPP server:

- The Node ecosystem doesn't have a production-grade IPP server. We use
  `williamkapke/ipp` as a *client* in `services/ipp.service.ts`;
  `watson/ipp-printer` (the closest thing) failed on rich attribute
  groups during this project and is unmaintained.
- IPP/Everywhere conformance is many edge cases (required attributes,
  `Validate-Job`, `Get-Printer-Attributes`, state machines, queue
  semantics). Re-implementing what CUPS already does correctly is high
  risk / low reward.
- The canonical pattern (SavaPage, OpenPrinting reference deployments)
  is exactly what we did: CUPS as the IPP front-end, a tiny backend
  that calls our HTTP API.

## Tests

`01-backend/scripts/e2eCupsTest.cjs` exercises the entire path end-to-end
against the running dev backend:

1. register a real customer + rotate a print token,
2. confirm `/api/cups/print` returns 401 with no/bad token,
3. confirm 200 + correct cost + parsed options with a good token,
4. confirm the new code is in the customer's job list at `status=ready`,
5. release the code at a kiosk pointed at the local virtual printer,
6. assert the printed bytes are **byte-exact sha256** of the original
   PDF (proves CUPS ingress lands in the same byte-preserving pipeline
   as the web upload).

Run it (with the backend on `:4000` and the virtual printer on `:6310`):

```sh
cd 01-backend
node scripts/virtualPrinter.cjs &   # if not already running
node scripts/e2eCupsTest.cjs
```
