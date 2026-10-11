# PrintLoop — Black Boxes

A **black box** is any system PrintLoop hands work to through a defined
input/output, without seeing or controlling its internals. PrintLoop is
deliberately a thin orchestrator wrapped around these: it owns auth,
tenancy, pricing, release codes, the marketplace, and payouts — and
**rents the hard parts** (driver-level printing, payments, geocoding,
queues). This doc ranks the black boxes we already lean on and the ones
worth adding next.

---

## Already implemented (current black boxes)

| Black box | What we hand it | What comes back | What we never see |
|---|---|---|---|
| **Printing stack** — OS spooler / CUPS / drivers / Ghostscript + cups-filters / firmware | a file (PDF/PWG) | a printed page | the rasterization, the driver internals |
| **Paystack** | charge / split / transfer request | reference + webhook | card details, fraud logic, bank settlement |
| **Shop LAN + on-site agent** | a render job | `PRINTED` / `FAILED` (V2-44 job-truth) | the LAN, the physical print |
| **Comms** — SMTP/nodemailer, SMS, Cloudinary | email / SMS / asset upload | delivered / a URL | inbox, carrier routing, CDN internals |
| **Location** — Nominatim/OSM geocoder, OSM map tiles | an address / a viewport | lat/lng / rendered tiles | how the map is drawn |
| **Infrastructure** — Redis + BullMQ, Sentry, host (Railway/Vercel) | a job / an error event | scheduling+retries / aggregation | queue internals, the runtime |

> The one to watch is **Shop LAN + agent** — the only black box where
> money is already taken before PrintLoop can see whether paper came
> out. That asymmetry is exactly why the agent now confirms real
> completion (V2-44) instead of assuming success.

---

## Proposed — not yet implemented (master ranking)

Ranked by impact on PrintLoop's Nigerian campus-marketplace model.

| # | Black box | Category | Candidate providers | Why it matters |
|---|---|---|---|---|
| 1 | **Office → PDF conversion** ✅ *(V2-48 — backend shipped)* | Core flow | **Gotenberg** (wired) · soffice · CloudConvert | `.docx/.pptx/.xlsx` uploads have no reliable path today (we only do PDF + images) |
| 2 | **WhatsApp Business API** | Core flow / comms | Meta WhatsApp Cloud API · Termii · Twilio | *The* channel in Nigeria; receipts, ready-codes, support in one place |
| 3 | **KYC / identity (shop owners)** | Trust & safety | Smile Identity · Dojah · Youverify | We send payouts but never verify the human behind the shop |
| 4 | **Push notifications** | Core flow | Firebase Cloud Messaging · Web Push | Free, instant "job READY" — cheaper than per-SMS for the most frequent event |
| 5 | **Malware scanning (uploads)** | Trust & safety | ClamAV (self-host) · VirusTotal | Keeps a poisoned upload off the shop PC |
| 6 | **Content moderation** | Trust & safety | Claude (vision) · Google Vision + OCR | A public print marketplace will eventually get prohibited content |
| 7 | **Routing / ETA (delivery)** | Courier side | Google Maps Directions · Mapbox · GraphHopper/OSRM | Driver dispatch exists but the map is display-only — no real routing |
| 8 | **Transactional email upgrade** | Comms | Resend · Postmark | Raw SMTP works until deliverability bites |
| 9 | **Product analytics** | Growth / ops | PostHog (self-host) · Mixpanel | We have Sentry for errors, nothing for behaviour/funnels |
| 10 | **LLM (Claude API)** | Wildcard | `claude-opus-4-8` (quality) · `claude-haiku-4-5` (cheap, high-volume) | Support bot, smart document handling, powers content moderation |

---

## Tier 1 — fills a real gap in the core flow

### 1. Office → PDF conversion ✅ backend shipped (V2-48)
- **Providers:** Gotenberg (wired, self-hosted LibreOffice-over-HTTP) ·
  `soffice` CLI · CloudConvert (future).
- **In → Out:** any office file → faithful PDF.
- **Why:** we already convert PDFs + images in `documentConvert.service`,
  but `.docx/.pptx/.xlsx` had no path. The most common "it didn't print
  right" ticket waiting to happen.
- **Status:** `services/documentConversion.service.ts` (provider-gated by
  `DOC_CONVERTER` / `GOTENBERG_URL`), wired into the customer single +
  batch upload ingest (converts → counts → prices → job). docker-compose
  provisions Gotenberg; diag at `GET /api/admin/spike/diag`
  (`officeConvert*`). Unit + stub-converter e2e green.
- **Customer UI (V2-49):** the single (`NewPrintPage`) and batch
  (`BatchPrintPage`) upload pages now offer Word/PowerPoint/Excel when
  the shop's server reports a converter (the `/pricing` `officeConversion`
  flag; office files are blocked with a clear message otherwise). Office
  files can't be page-counted in the browser, so the UI takes an
  **approximate page count** and labels the price an **estimate**
  ("~₦…", "confirmed on your receipt") — the server converts → counts →
  charges the authoritative cost on submit. `detectPages` recognises
  `source: "office"`.
- **Remaining (optional):** the group **participant-upload** path could
  adopt the same converter next.

### 2. WhatsApp Business API
- **Providers:** Meta WhatsApp Cloud API (directly), or via Termii / Twilio.
- **In → Out:** receipts / ready-codes / support messages → delivered to WhatsApp.
- **Why:** the dominant channel in Nigeria; doubles as a support inbox.
  Likely higher-impact than email for our users.

### 4. Push notifications
- **Providers:** Firebase Cloud Messaging / Web Push.
- **In → Out:** "job READY, code K7DQ2A" → free instant push to phone/PWA.
- **Why:** cheaper and faster than SMS for the event that fires most.

---

## Tier 2 — trust & safety (public marketplace handling money + payouts)

### 3. Identity / KYC for shop owners
- **Providers:** Smile Identity, Dojah, or Youverify (all Nigerian).
- **In → Out:** BVN/NIN/selfie → verified + fraud score.
- **Why:** Paystack does *its* KYC for subaccounts, but we never verify
  the human before sending payouts. Protects against payout fraud as
  shops scale.

### 5. Malware scanning of uploads
- **Providers:** ClamAV (self-host) or VirusTotal API.
- **In → Out:** uploaded file → clean / infected.
- **Why:** every upload is currently stored and printed unscanned.

### 6. Content moderation
- **Providers:** Claude (vision) or Google Vision + OCR.
- **In → Out:** document pages → flagged / allowed.
- **Why:** cheap insurance against a reputational incident.

---

## Tier 3 — courier side & growth

### 7. Routing / ETA for delivery
- **Providers:** Google Maps Directions, Mapbox, or self-hosted GraphHopper/OSRM.
- **In → Out:** pickup + dropoff → route, distance, ETA, fee.
- **Why:** driver dispatch entities + the OSM map exist, but it's
  display-only. Routing is what makes the courier feature usable.

### 8. Transactional email upgrade
- **Providers:** Resend or Postmark.
- **In → Out:** templated email → delivered + open/bounce tracking.
- **Why:** upgrade from raw SMTP/nodemailer before deliverability bites.

### 9. Product analytics
- **Providers:** PostHog (self-hostable) or Mixpanel.
- **In → Out:** events → funnels, retention, drop-off.
- **Why:** Sentry covers errors; nothing covers behaviour today.

---

## Wildcard — an LLM black box (Claude API)

One box, several features that are otherwise hard to build:
- **Support chatbot** answering "where's my print / how do I pair my
  printer" from our own docs.
- **Smart document handling** — "this is a 200-page thesis, mostly B&W;
  suggest duplex to save ₦X."
- Powers the **content-moderation** box (#6).

Use the latest Claude models: `claude-opus-4-8` for quality, or
`claude-haiku-4-5` for cheap, high-volume moderation.

---

## Recommended first three

If only three get built, do these — they plug the biggest holes in the
**upload → notify → get-paid-safely** loop we already run:

1. **Office → PDF conversion** (#1) — stop the upload-format failures.
2. **WhatsApp Business API** (#2) — meet users where they are.
3. **KYC for shop owners** (#3) — make payouts safe at scale.

---

## Last updated
2026-06-19
