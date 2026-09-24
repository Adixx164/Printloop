# PrintLoop SaaS v2 — Architecture (with OpenPrinting stack)

> Companion to [SAAS-ROADMAP.md](SAAS-ROADMAP.md). The roadmap covers
> the multi-tenant SaaS dimensions; this doc fills in the **print
> stack** — every layer between "customer uploads a PDF" and "toner
> hits paper" — using OpenPrinting's libraries instead of writing
> printer plumbing from scratch.
>
> All third-party code lives under `vendor/openprinting/` as shallow
> git clones. Re-clone with `tools/refresh-vendor.ps1` (TODO).

---

## Why OpenPrinting

OpenPrinting maintains CUPS, cups-filters, the IPP protocol stack,
ipp-usb, the Printer Application framework, and the Foomatic driver
DB. Together they cover:

- Speaking IPP to network printers (the modern way).
- Speaking IPP-over-USB to USB printers (the modern way, again).
- Auto-discovering printers via Bonjour/mDNS.
- Converting PDF / PostScript / image / Office formats into raster
  the printer actually understands.
- Holding ~10k printer models' worth of capability metadata.
- Test suites + fuzz harnesses we can borrow for hardening.

We don't ship CUPS to the customer's phone. We ship it (or a
trimmed-down printer-application equivalent) to **the kiosk PC** and
**a cloud render worker**, then drive it via IPP.

---

## 10,000-ft picture

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Customer (phone)                                                            │
│  ─ uploads PDF/DOCX/JPG to printloop-new-frontend                          │
│  ─ pays via Paystack/Stripe                                                 │
│  ─ receives 6-digit code via SMS (Termii)                                  │
└────────────────────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Cloud (01-backend, Railway/Fly)                                             │
│  ─ tenant resolution → JWT/subdomain/X-Tenant-Slug                          │
│  ─ pricing + wallet + payments                                              │
│  ─ S3/R2 file storage                                                       │
│  ─ BullMQ queue: 'render' job                                               │
│                                                                              │
│  Render worker (NEW, sibling of API):                                       │
│   ─ pulls file from S3                                                      │
│   ─ runs libcupsfilters pipeline → PWG-Raster / PDF/A normalised            │
│   ─ extracts page count, color/mono, paper size                             │
│   ─ writes pre-rendered artifact back to S3                                 │
│   ─ updates print_job with FINAL pricing + ready-to-spool blob              │
└────────────────────────────────────────────────────────────────────────────┘
                              │ HTTPS long-poll / WS heartbeat
                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Kiosk (printloop-kiosk-app on a mini-PC or Pi)                              │
│                                                                              │
│  printloop-agent (Electron/Node)                                            │
│   ─ heartbeats to cloud every 15s                                           │
│   ─ on 'code entered' UI event → fetches job manifest                       │
│   ─ pulls pre-rendered artifact from S3                                     │
│   ─ hands to local CUPS via IPP submit (ipptool / goipp / pycups)           │
│                                                                              │
│  Local print services on the kiosk:                                         │
│   ─ cups-local         (one-process IPP server, no system daemon)           │
│   ─ cups-browsed       (auto-finds printers on the LAN via mDNS/DNS-SD)     │
│   ─ ipp-usb            (exposes USB MFPs as IPP-over-HTTP on localhost)     │
│   ─ printer-app(s)     (driverless support for HP / Gutenprint / PS / Gs)   │
│                                                                              │
│  Printer (network or USB)                                                   │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer map — what each OpenPrinting repo does for us

### Layer 1 — Ingest (cloud)

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Validate uploaded PDF/PS | `libpdfrip` | PDFio-based; sanity-check pages, extract metadata before we charge for the wrong page count. |
| Convert DOCX/PPTX/JPG to PDF | (out of scope; use LibreOffice headless + Ghostscript) | — |
| Normalize to PDF/A | Ghostscript (already a dep of `ghostscript-printer-app`) | Removes weird embedded streams that crash older printers. |

### Layer 2 — Render (cloud worker)

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Convert PDF → PWG-Raster | `cups-filters` / `libcupsfilters` | PWG-Raster is the universal IPP raster format; rendering in the cloud means kiosk just spools. |
| Page-count + color detect | `libcupsfilters` API | Drives final pricing in our 24-cell matrix. |
| Driver/model capability lookup | `foomatic-db-engine` (queries upstream `foomatic-db` on-demand) | When a tenant adds a "Brother HL-L2350DW", we look it up to know duplex/paper/PPI limits. The 183 MB `foomatic-db` itself is NOT vendored — see `vendor/openprinting/README.md`. |

### Layer 3 — Local kiosk print services

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Process-local IPP server | `cups-local` | CUPS 3.0's "no system daemon" mode — run as the kiosk user, no root. |
| Network printer discovery | `cups-browsed` + `go-avahi` | Auto-detect printers on the print shop's LAN — no manual IP entry. |
| USB printer support | `ipp-usb` (preferred) or `ippusbxd` | Modern MFPs speak IPP-over-USB; ipp-usb makes them appear at `http://localhost:60000`. |
| Brand-specific driverless | `hplip-printer-app`, `gutenprint-printer-app`, `ps-printer-app`, `ghostscript-printer-app` | Covers ~90% of inkjet/laser printers in market — bundle the ones matching tenant's hardware. |
| Retrofit legacy PPDs | `pappl-retrofit` | If a tenant insists on a 2007 Samsung, retrofit its old PPD into a Printer Application. |

### Layer 4 — Sharing & multi-kiosk

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Share a printer between several kiosks in a shop | `cups-sharing` | One physical printer, two kiosks both submitting jobs over IPP. |

### Layer 5 — Backend bindings

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Pure-Go IPP client | `goipp` | If we add a Go render worker, this lets us speak IPP without cgo. |
| MFP / scanner support | `go-mfp` | Future scan-to-cloud feature. |
| Python CUPS automation | `pycups` | Provisioning scripts, ops tooling on the kiosk. |
| Common Print Dialog backends | `cpdb-libs` + `cpdb-backend-cups` | If we ever ship a desktop "Print to PrintLoop" dialog, this is the right hook. |

### Layer 6 — Admin reference (read, don't bundle)

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Printer-admin UI patterns | `system-config-printer` (Python/GTK) | Mature UX for "add printer / set defaults / queue mgmt" — steal the flow, not the code. |

### Layer 7 — Hardening

| Concern | OpenPrinting piece | Why |
|---|---|---|
| Fuzz harnesses | `fuzzing` | Run against any code path that parses external print data (IPP, PPD, PWG). |
| Sample print files | (mozilla/pdf.js corpus or our own fixtures) | `sample-files` upstream wasn't vendored — too large for reliable HTTPS clone here. |

---

## Kiosk bundle composition

For a fresh kiosk install (`install-kiosk-pc.ps1`), we ship:

**Always:**
- `printloop-agent` (our Node service)
- `printloop-kiosk-app` (our Electron UI)
- `cups-local` (IPP server, no daemon)
- `cups-browsed` (LAN discovery)
- `ipp-usb` (USB printer support)

**Conditional, picked at tenant kiosk-provisioning time:**
- HP printer detected → `hplip-printer-app`
- Brother/Epson/Canon → `gutenprint-printer-app`
- Generic PS LaserJet → `ps-printer-app`
- Anything else → `ghostscript-printer-app`
- Legacy hardware with a vendor PPD → `pappl-retrofit` + the PPD

The tenant setup wizard (Dimension 5 in the roadmap) gets a "scan
for printers" step that runs `cups-browsed`'s discovery and lists
hits; we install only the matching printer-application snap/binary.

---

## Cloud render worker — new service

Sits next to `01-backend` as a BullMQ consumer. Pseudocode:

```ts
queue.process('render', async (job) => {
  const { fileId, tenantId, printerProfileId } = job.data;
  const src = await s3.get(fileId);
  const profile = await db.printerProfiles.findOne({ tenantId, id: printerProfileId });

  // 1. Normalize to PDF/A via Ghostscript
  const normalized = await gs.toPdfA(src);

  // 2. Render to PWG-Raster at the profile's DPI / color mode
  //    via libcupsfilters' pdftopwg
  const pwg = await cupsfilters.pdfToPwg(normalized, {
    resolution: profile.dpi,
    color: profile.color,
    pageSize: profile.pageSize,
  });

  // 3. Extract final page count + final cost
  const meta = await cupsfilters.pwgMeta(pwg);
  const cost = pricing.compute(tenantId, meta);

  // 4. Store render + update job
  const renderedKey = await s3.put(pwg);
  await db.printJobs.update(job.data.printJobId, {
    status: 'RENDERED',
    pageCount: meta.pages,
    finalCost: cost,
    renderedArtifactKey: renderedKey,
  });
});
```

The kiosk then pulls the **rendered** PWG (not the raw PDF), so the
kiosk CPU does ~zero work and the print starts the instant the code
is entered.

---

## Data-model additions (on top of the roadmap)

These are net-new because the roadmap didn't cover the print stack:

```sql
-- One row per physical printer attached to a kiosk.
printer_profile (
  id              uuid pk,
  tenant_id       uuid not null,         -- multi-tenant
  kiosk_id        uuid not null,
  display_name    text not null,         -- "Front HP LaserJet"
  foomatic_id     text,                  -- FK into foomatic-db catalog
  ipp_uri         text not null,         -- "ipp://localhost:60000/ipp/print"
  capabilities    jsonb not null,        -- {duplex, color, sizes, dpi}
  driver_kind     text not null,         -- 'hplip'|'gutenprint'|'ps'|'gs'|'retrofit'
  created_at      timestamptz default now()
);

-- Rendering pipeline state.
print_job_render (
  id              uuid pk,
  print_job_id    uuid not null fk,
  status          text not null,         -- 'PENDING'|'RENDERING'|'RENDERED'|'FAILED'
  rendered_key    text,                  -- S3 key of PWG-Raster artifact
  page_count      int,
  bytes           bigint,
  error_message   text,
  started_at      timestamptz,
  finished_at     timestamptz
);
```

These extend `printJob.entity.ts`; existing fields (status, paid, code)
stay as-is.

---

## Build / package strategy

OpenPrinting's stuff is mostly C/C++ with autotools or meson. We
don't fork — we vendor as submodules-or-shallow-clones and **build
inside Docker** so the kiosk installer ships pre-built binaries.

```
tools/
  build-render-worker.dockerfile   # Debian + cups-filters libs
  build-kiosk-bundle.ps1           # Windows kiosk installer composer
  build-kiosk-bundle.sh            # Linux/Raspbian kiosk installer composer
vendor/openprinting/
  cups/                            # shallow clone
  cups-filters/                    # shallow clone
  ...
```

The Windows kiosk path needs special handling — CUPS proper doesn't
target Windows, but `ipp-usb` and the printer-application snaps do
run via WSL2 or as native ports. Two options:

1. **Linux kiosks (recommended for v2)** — Raspberry Pi 5 or any
   x86 mini-PC running Debian. Full CUPS stack runs native, kiosk
   UI runs in Electron. This is the path OpenPrinting is built for.
2. **Windows kiosks (current install-kiosk-pc.ps1 path)** — keep
   talking IPP directly from our agent over the network; let
   network printers be discovered via mDNS, and require any USB
   printer to support Windows-native drivers. Skip ipp-usb on
   Windows. Less unified but matches the existing deployment.

The roadmap stays Windows-friendly; the **render worker is always
Linux** (it's in the cloud).

---

## Migration from v1

v1 PrintLoop sends raw PDFs to the kiosk and lets the kiosk's
default OS print path handle them. v2 inserts the **render worker**
between `PAID` and `READY_FOR_PICKUP`:

```
v1:  PENDING → PAID → READY → PRINTED
v2:  PENDING → PAID → RENDERING → READY → PRINTED
                       ↑
                  cloud worker normalises to PWG
```

Backwards compatibility: if a tenant hasn't configured printer
profiles, the kiosk falls back to v1 behaviour (raw PDF to default
printer). New tenants get the v2 path by default.

---

## What's intentionally *not* taken from OpenPrinting

- **System-wide CUPS daemon** — we use `cups-local` instead; no
  root, no port 631 conflicts with the OS print spooler.
- **`foomatic-db-engine` web UI (`foomatic-db-webapp`)** — too
  PHP-heavy; we just read the YAML/XML data directly.
- **Old/legacy drivers** (`splix`, `foo2zjs`, `legacy-drivers`) —
  loadable on demand for niche tenants, not in the default bundle.
- **Google Cloud Print backend** (`cpdb-backend-gcp`) — GCP is
  deprecated.

---

## Open questions added by this layer

(In addition to the 10 in the roadmap.)

11. **Kiosk OS for v2 — Linux or Windows?** Linux unlocks the full
    OpenPrinting stack; Windows keeps existing install workflow.
12. **Where does the render worker run — Railway/Fly/AWS?** Needs
    a Linux container with cups-filters libs; pricing varies.
13. **Do we expose tenant printer profiles via API?** Larger
    tenants will want to script them.
14. **Ship printer-application binaries or rebuild from source per
    release?** Source-rebuild = reproducible, slow CI; binaries =
    fast but version skew.

Park these in `JOURNAL.md` next to the roadmap's 1–10.
