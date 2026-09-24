# render-worker

The cloud-side service that turns a customer's uploaded PDF into a
PWG-Raster blob the kiosk can spool straight to the printer.

**Status: wired end-to-end.** The render worker consumes `01-backend`'s
BullMQ `render` queue, calls back (HMAC-signed) to
`POST /api/render/callback`, and the callback flips the job
RENDERING → READY with the authoritative page count. See
[../ARCHITECTURE.md](../ARCHITECTURE.md) for where it fits.

## Why a separate worker

The kiosk is small. Rendering a 60-page colour PDF to PWG-Raster on
a Raspberry Pi takes 30+ seconds and starves the kiosk UI. Doing it
in the cloud:

- Reuses one big render machine across all kiosks of all tenants.
- Lets us compute the FINAL page count + cost before the customer
  commits to a price.
- Makes the kiosk a dumb spooler that pulls a pre-rendered artifact
  and hands it to local CUPS — print starts in <2 seconds.

## Pipeline

```
S3 source PDF
   │
   ▼  ghostscript: PDF → PDF/A (strip weird streams, normalise images)
   │
   ▼  cups-filters' pdftopwg: PDF → PWG-Raster
   │
   ▼  count pages, get bytes
   │
   ▼  S3 upload at renders/{tenantId}/{printJobId}.pwg
   │
   ▼  return { renderedKey, pageCount, bytes, durationMs }
```

## Env

| Var | Required | Notes |
|---|---|---|
| `REDIS_URL` | yes | BullMQ queue — same Redis as `01-backend`. |
| `S3_BUCKET` | yes | Source uploads + rendered artifacts. |
| `AWS_REGION` | no | Defaults to `us-east-1`. |
| `WORKER_CONCURRENCY` | no | Defaults to 2. |
| `PRINTLOOP_API_URL` | yes | Base URL of the 01-backend (e.g. `https://api.printloop.app`). Used for the success/failure callback. |
| `RENDER_CALLBACK_SECRET` | yes | Same value as `01-backend/.env`'s `RENDER_CALLBACK_SECRET`. Generate with `openssl rand -hex 32`. HMAC-SHA256 signs every callback. |

AWS creds via the usual SDK chain (env / IAM role).

## Run locally

```bash
# Requires Ghostscript + cups-filters tools on PATH.
# On Debian/Ubuntu:
#   sudo apt install ghostscript cups-filters-core-drivers

npm install
REDIS_URL=redis://localhost:6379 S3_BUCKET=printloop-dev npm run dev
```

## Run in Docker

```bash
docker build -t printloop-render-worker .
docker run --rm \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e S3_BUCKET=printloop-dev \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  printloop-render-worker
```

## TODO before this is real

- [x] Add the matching `queue.add('render', …)` call in
      `01-backend/services/renderEnqueue.service.ts` — wired via
      `enqueueRenderOrReady` from payments / customerPrint / cups.
- [x] Persist render results — the callback stores `renderedKey`,
      `renderedPdfUrl`, `previewImageUrls`, `totalPages`, `finalCost`
      on the PrintJob row (`print_jobs` columns from the
      AddPrintJobRenderFields + AddPrintJobFinalCost migrations).
- [x] Per-printer-profile rendering options (DPI, colour, page size,
      duplex) — **V2-56** (`printer_profile` table + admin CRUD).
      `01-backend` resolves the job-pinned profile or the tenant's
      DEFAULT profile at enqueue and passes its resolved options in the
      job payload (`printerProfile: { dpi, color, paperSize }`): the
      worker rasterizes at `min(customer quality, profile maxDpi)`,
      forces grayscale on mono-only machines, and scale-fits pages to
      the profile's paper size. No profile → legacy job-settings
      behaviour.
- [x] Hook page-count back into the pricing engine to compute final
      cost vs the customer's pre-charged estimate — **V2-52/53 pricing
      reconciliation** (`01-backend/services/costReconciliation.service.ts`):
      the customer pays the estimate via Paystack checkout (saved-card
      authorization captured from the webhook). Overpaid → the overage
      is written off (tenant ledger reversed by its commission slice).
      Underpaid → the kiosk release gate (`POST /api/printer/complete`)
      charges the saved card for the delta; declined or no card on
      file → 402 `PAYMENT_DUE`. No refunds exist anywhere (V2-53).
- [ ] Sentry integration.
- [ ] Add fuzz tests using fixtures from `vendor/openprinting/sample-files/`.
