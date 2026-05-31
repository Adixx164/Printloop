# OpenPrinting Integration — Render the job, don't hint it

**Status:** Accepted — *Option A* (server-side render via the OpenPrinting filter chain)
**Date:** 2026-05-31
**Scope:** Backend render pipeline (`01-backend`) + Railway build config. No kiosk/agent rewrite, no `.exe` change in this phase.
**Supersedes (partially):** the per-attribute byte-baking introduced in Phases 18 (grayscale), 21 (flatten), 22/25 (orientation), 23 (quality).

---

## 1. TL;DR / Decision

PrintLoop currently hands the Sharp a **PDF** and asks its firmware to honour **PJL hints**
(`@PJL SET RENDERMODE / ORIENTATION / RESOLUTION / DUPLEX / COPIES …`). The MX-5112N
**ignores most PJL for PDF input**, which is why we have had to bake each attribute into the
bytes by hand, one painful phase at a time (grayscale via Ghostscript, signatures via raster,
orientation via geometry, quality via — still-unreliable — PJL).

**Decision: adopt the OpenPrinting / PWG filter chain (`ipptransform` + `cups-filters`) as a
server-side render step on the Railway (Linux) backend. Render each job to the printer's
*native language* (PCL or PostScript) with every print attribute already applied, in the
spec-defined order, then ship that over the existing raw-9100 transport.** The firmware can't
ignore what is already rendered into the page.

This is the lowest-friction, highest-leverage option: it changes **only the render step**, keeps
the kiosk, the Electron agent, the raw-9100 + SNMP-confirm transport, the wallet, pricing, and
release-code flow exactly as they are.

---

## 2. Why this exists — the recurring root cause

Every "make X actually print correctly" phase this build has fought is the *same* bug wearing a
different hat:

| Phase | Attribute | Symptom (PDF + PJL) | Our hand-rolled fix |
|------:|-----------|---------------------|---------------------|
| 18 | colour | Sharp ignores `RENDERMODE/COLORMODE` → colour prints in B&W mode | Ghostscript `-sColorConversionStrategy=Gray` bakes grey into the PDF (`toGrayscale`) |
| 21 | annotations | `/Ink` signature moves / vanishes on the RIP | Rasterise annotated pages (`flattenAnnotations`) |
| 22/25 | orientation | PJL `ORIENTATION` ignored; letterbox/rotate wrong | Bake page geometry (`fitToOrientation`, scale-to-fit) |
| 23 | quality | PJL `RESOLUTION` ignored → DPI choice never reaches the printer | *Still only a hint* — the gap that motivated this doc |

The pattern: **the Sharp obeys the *page* (PDF geometry, rendered colour) but not the *PJL
envelope* for PDF jobs.** `copies`, `sides` (duplex), and `print-quality` all still ride on PJL
and are therefore *suspect* — `quality` is known-broken; duplex/copies "work" only because we
haven't disproven them.

The OpenPrinting stack removes the envelope problem entirely: it renders the PDF down to **PCL
or PostScript** — formats the Sharp interprets *natively and reliably* — with colour, resolution,
duplex, copies, N-up and page-range already applied by a reference filter chain.

---

## 3. The landscape (what we are adopting, and what we are not)

OpenPrinting (Linux Foundation workgroup; maintainer of CUPS) + the PWG IPP standards give us:

- **`cups-filters` / `libcupsfilters`** — the canonical filter chain:
  - `pdftopdf` → page-ranges, **N-up**, orientation, fit-to-page, booklet, mirror *(layout layer)*
  - `gstoraster` / `pdftoraster` → rasterise at the chosen **resolution + colour mode** *(quality + colour layer)*
  - `rastertopclm` / `rastertopwg` / (poppler) `pdftops` → wrap into the printer's **native language**
- **`ipptransform`** (from `ippsample`) — a single CLI that drives that chain from **IPP job
  attributes**: `PDF + attributes → PCL / PWG-Raster / Apple-Raster`. This is the workhorse for
  Option A: "do all of `documentConvert` correctly, in order, in one call."
- **PAPPL / Printer Applications** — a local daemon that emulates an IPP-Everywhere printer for a
  real device. *(Relevant to a future Option B, not this phase.)*
- **IPP INFRA + `ippproxy`** (PWG 5100.18) — the standardised "cloud spooler + local proxy that
  pulls jobs" model. *This is literally PrintLoop's kiosk-pull, standardised.* *(Future Option C.)*
- **SavaPage** — an AGPLv3 print-management portal on top of CUPS whose feature set
  (web upload, PDF inbox, hold/release, pay-per-print) is ~PrintLoop's. *(Reference architecture
  / future Option D, not a dependency we are taking now.)*

**We are adopting only the render chain (`ipptransform` + `cups-filters`) in this phase.** The
IPP transport (INFRA), local CUPS, and SavaPage are recorded as later options in §9.

---

## 4. The canonical "right order"

CUPS/IPP process a job in this fixed order. Out-of-order is exactly where home-grown pipelines
go wrong. Mapping to PrintLoop's current code:

| # | Stage | IPP attribute | PrintLoop today |
|--:|-------|---------------|-----------------|
| 1 | Normalise → PDF | `document-format` | `ensurePdf`, `imageToPdf` ✅ |
| 2 | Flatten annotations | — | `flattenAnnotations` (raster) ✅ |
| 3 | Page selection | `page-ranges` | `extractPages` ✅ |
| 4 | Layout: N-up, orientation, fit | `number-up`, `orientation-requested` | `fitToOrientation` (orientation only; **no N-up**) |
| 5 | Colour | `print-color-mode` | `toGrayscale` (Ghostscript) ✅ |
| 6 | Rasterise at resolution | `print-quality` / `printer-resolution` | **hint only — broken** ❌ |
| 7 | Printer language | (driver) | **skipped — we send PDF** ❌ ← *the root fix* |
| 8 | Copies / collate / duplex | `copies`, `sides` | PJL — *suspect* |
| 9 | Spool → backend → printer | — | raw-9100 ✅ |
| 10 | Job state | IPP job-state | SNMP page-counter (`dispatchAndConfirm`) ✅ (kept) |

Option A folds stages **4–8** into one `ipptransform` invocation and *adds the missing stage 7*,
which is what makes 5/6/8 finally reliable on the Sharp.

---

## 5. The design (Option A)

### 5.1 New pipeline

On the **agent-pull download endpoint** (`routes/agent.routes.ts → GET /jobs/:id/file`), after
`ensurePdf` and the customer's page-range/flatten/orientation pre-passes, replace the
`toGrayscale` step (and the agent's quality PJL) with a single **render-to-native** step:

```
ensurePdf
  → flattenAnnotations         (signatures; KEEP — see §5.5)
  → extractPages               (page-range; KEEP, or delegate to ipptransform page-ranges)
  → fitToOrientation           (scale-to-fit geometry; KEEP — see §5.4)
  → renderNative(pdf, attrs)   (NEW: ipptransform → PCL/PostScript, colour+quality+duplex+copies)
  → stream over raw-9100 with "@PJL ENTER LANGUAGE=POSTSCRIPT|PCL"
```

`renderNative` is a new function in `services/documentConvert.service.ts` that shells out to
`ipptransform` (mirroring exactly how `toGrayscale` shells out to `gs`), with the same **graceful
fallback**: if `ipptransform` is missing or errors, return the original PDF bytes so the job still
prints via the current path. Uploads/prints never break.

### 5.2 Attribute mapping (PrintLoop `printConfiguration` → IPP)

| PrintLoop | IPP attribute | Value |
|-----------|---------------|-------|
| `copies` | `copies` | integer |
| `sided` | `sides` | `single → one-sided`, `double → two-sided-long-edge` |
| `color` | `print-color-mode` | `bw → monochrome`, `color → color` |
| `qualityDpi` | `print-quality` | `100 → 3 (draft)`, `300 → 4 (normal)`, `600 → 5 (high)` |
| `paper` | `media` | `A4 → iso_a4_210x297mm`, `A3 → iso_a3_297x420mm`, … |
| `orientation` | **handled by `fitToOrientation`, not IPP** | see §5.4 |
| `pageRange` | `page-ranges` | or keep `extractPages` upstream |

Illustrative invocation (final tool/format pinned in the Phase-1 spike, §6):

```bash
ipptransform \
  -i application/pdf \
  -m application/vnd.hp-PCL \
  -o "print-color-mode=monochrome print-quality=5 \
      sides=two-sided-long-edge copies=2 media=iso_a4_210x297mm" \
  job.pdf  >  job.pcl
```

### 5.3 Output language for the MX-5112N

The MX-5112N speaks **PostScript 3** and **PCL 6** natively (standard office MFP) and renders both
*reliably* — unlike its PDF+PJL path. Two candidates, decide on paper in the spike:

- **PCL (`application/vnd.hp-PCL`)** — fully rasterised by `ipptransform`; the most *deterministic*
  ("what we rendered is what prints"), but raster (text crispness capped at the chosen DPI).
- **PostScript** (via the `cups-filters` `pdftops` chain) — keeps vectors/fonts crisp and leans on
  the Sharp's solid PS interpreter; attribute application (colour/n-up) happens in the `pdftopdf`
  pre-filter.

**Do NOT** emit **PWG-Raster/Apple-Raster** over raw-9100 — those are for IPP-Everywhere transport,
not a 9100 socket.

### 5.4 The orientation exception (important)

IPP `orientation-requested=landscape` means **rotate the content 90°**. PrintLoop's product
decision (confirmed with the customer, Phases 22/25) is the *opposite*: **scale the upright page to
fit a landscape sheet, never rotate.** Therefore:

- **Keep `fitToOrientation`** as a pre-pass — it bakes our scale-to-fit geometry into the PDF.
- **Pass `orientation-requested=portrait` (or omit it)** to `ipptransform`, so the renderer does
  **not** re-rotate. The page is already the correct shape.

This is the one stage we deliberately *don't* hand to the standard pipeline.

### 5.5 What gets retired vs. kept

**Retired (folded into `renderNative`):**
- `toGrayscale` (Ghostscript grayscale) → `print-color-mode=monochrome`.
- The agent's quality PJL (`@PJL SET RESOLUTION/ECONOMODE`) → `print-quality`.
- Reliance on PJL `DUPLEX`/`COPIES` for the actual effect → `sides`/`copies` baked into PCL/PS.

**Kept:**
- `ensurePdf`, `imageToPdf`, `extractPages`, `fitToOrientation` (orientation semantics differ, §5.4).
- `flattenAnnotations` **for now** — the render chain *may* flatten annotations for free
  (poppler/gs renders appearance streams), which could retire it too; **validate the signature case
  (MUTUAL 4.pdf) before removing.**
- raw-9100 transport + SNMP page-counter confirmation (`dispatchAndConfirm`) — unchanged.
- Wallet, pricing, release codes, web upload — untouched.

---

## 6. Implementation plan (phased, code-mapped)

**Spike (½ day) — prove the format on paper.** Add the binaries locally / on a branch; render a
known test PDF (MUTUAL 4 / the investment proposal) to **PCL** and to **PostScript**; print both on
the Sharp; compare against today's hand-baked output for colour, resolution, duplex, and the
signature. Pick the language.

**Step 1 — Railway build.** Extend `01-backend/nixpacks.toml` (same mechanism as ghostscript):
```toml
[phases.setup]
aptPkgs = ["...", "ghostscript", "ippsample", "cups-filters", "poppler-utils"]
```
(`ippsample` provides `ipptransform`; `cups-filters` + `poppler-utils` provide the underlying
`pdftopdf`/`pdftops`/`gstoraster` converters.)

**Step 2 — `renderNative()` in `services/documentConvert.service.ts`.** Mirror `toGrayscale`:
resolve the binary (cache), write a temp PDF, `execFile('ipptransform', …)`, read the output, clean
up the temps, and **return the original PDF bytes on any failure**. Accept a typed
`PrintAttributes` object derived from `printConfiguration`.

**Step 3 — Wire into dispatch.** In `routes/agent.routes.ts`, after step 4 (orientation), call
`renderNative` instead of `toGrayscale`; set a response header (e.g. `X-PrintLoop-Lang: pcl|ps|pdf`)
so the agent knows which `@PJL ENTER LANGUAGE=` to emit. Do the same on the cloud-push path
(`routes/printer.routes.ts`) and in `services/ipp.service.ts`.

**Step 4 — Agent PJL.** `printloop-kiosk-app/agent.js` `rawDispatch`: when the downloaded job is
PCL/PS, emit `@PJL ENTER LANGUAGE=PCL` / `=POSTSCRIPT` and **drop** the now-redundant
colour/resolution/orientation PJL (keep `JOB NAME`; `COPIES/DUPLEX` become belt-and-braces). *This
is the only agent change → it needs an `.exe` rebuild, so stage it after Steps 1–3 are proven with
the agent still sending PDF as fallback.*

**Step 5 — Retire** `toGrayscale` and the quality PJL once paper-verified; re-evaluate
`flattenAnnotations` (§5.5). Update `BACKEND-GUIDE.md` + `JOURNAL.md`.

---

## 7. Rollout & test plan

- **Feature flag** `RENDER_NATIVE=pcl|ps|off` (env, like `GHOSTSCRIPT_BIN`). `off` = today's
  behaviour. Lets us ship Steps 1–3 dark and flip per-deploy.
- **Graceful fallback** at every layer: missing binary / render error → original PDF bytes →
  current PDF+PJL path. A bad render can never block a print.
- **Paper matrix** on the Sharp: {A4, A3} × {colour, B&W} × {100, 300, 600 dpi} × {simplex, duplex}
  × {1, 2 copies} × {portrait doc, landscape doc, signed form, multi-page range}. Confirm each
  attribute *actually* changes the output (esp. **quality** and **duplex**, the suspect ones).
- **SNMP math:** N-up changes sheet count — if/when N-up is added, update `effectivePages` so
  `dispatchAndConfirm` still reconciles impressions.

---

## 8. Risks & open questions

- **`ipptransform` output formats.** Confirm in the spike whether `ipptransform` emits PostScript
  directly or whether PS must come via `cups-filters` `pdftops`. PCL output is certain.
- **Railway apt availability.** Confirm `ippsample` / `cups-filters` are installable via Nixpacks
  apt on the Railway base image; if not, fall back to `poppler-utils` + `ghostscript` (both certain)
  driving the chain manually, or vendor a static `ipptransform`.
- **Binary size / cold start.** `cups-filters` pulls dependencies; watch image size and boot time
  (lazy-resolve the binary like `resolveGsBinary`).
- **PostScript colour fidelity.** If we choose PS, ensure the colour→grey conversion happens in the
  filter (not left to the Sharp). PCL sidesteps this by rasterising.
- **Annotation flatten.** Verify the render flattens the signature before retiring
  `flattenAnnotations`; keep it if there's any doubt.
- **Windows kiosk.** Not a factor here — rendering runs on the **Linux** backend. (It *is* the
  blocker for Options B/C below.)

---

## 9. Alternatives considered

- **Option B — local CUPS / PAPPL Printer Application at the kiosk.** Real IPP job state (retire
  SNMP), full local filter chain. **Blocked by the Windows Electron kiosk** (no native CUPS); needs
  a Linux mini-PC / Pi or CUPS-in-WSL/Docker. Revisit when going multi-printer/site.
- **Option C — IPP INFRA (`ippproxy` + Infrastructure Printer).** Standardise the cloud-pull
  transport (replaces the bespoke `/api/agent/jobs/ready` + signed download). High value, but most
  useful *after* A/B; re-plumbs a working custom protocol.
- **Option D — adopt SavaPage as the print backend.** Most mature, least new code, but a second
  stack (Java + CUPS), **AGPLv3** (network-copyleft — a real licensing decision for a hosted SaaS),
  and it duplicates much of PrintLoop we'd discard.

---

## 10. Future roadmap

1. **Phase 1 (this doc):** server-side render to native language. Fix quality/duplex/copies; unify
   the baking; enable N-up/booklet.
2. **Phase 2:** expose N-up / fit-to-page / booklet now that we're in the filter chain.
3. **Phase 3:** when the kiosk moves to a Linux-capable device — adopt **IPP INFRA (`ippproxy`)** +
   a local **Printer Application** for real IPP job state and driverless support of *any* printer,
   not just the one Sharp we reverse-engineered.

---

## 11. References

- OpenPrinting — <https://openprinting.github.io/>
- OpenPrinting CUPS — <https://openprinting.github.io/cups/>
- Printer Applications (PAPPL) — <https://openprinting.github.io/documentation/01-printer-application/>
- CUPS New Architecture (Debian) — <https://wiki.debian.org/CUPSNewArchitecture>
- `pappl-retrofit` — <https://github.com/OpenPrinting/pappl-retrofit>
- SavaPage — <https://github.com/savapage> · how it works — <https://www.savapage.org/docs/manual/ch-intro-how-does-it-work.html>
- IPP Shared Infrastructure Extensions (INFRA) 5100.18 v1.1, 2025 — <https://www.pwg.org/pipermail/pwg-announce/2025/004072.html>
- `ippproxy` (ippsample) — <https://istopwg.github.io/ippsample/ippproxy.html>
- PWG IPP Workgroup — <https://pwg.org/ipp/index.html>

---

*Companion reading in this repo: `JOURNAL.md` (Phases 18, 21, 22, 23, 25 — the hand-baked pipeline
this supersedes) and `01-backend/BACKEND-GUIDE.md` (`services/documentConvert.service.ts`).*
