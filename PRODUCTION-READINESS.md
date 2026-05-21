# PrintLoop — Production Readiness

What is real and verified, what you must provision (accounts/infra/hardware),
exact environment variables, and deploy steps. Hand this to whoever does
procurement/ops.

---

## 1. Status — what's real and proven

End‑to‑end verified this build (SHA‑256 byte‑exact prints to a virtual IPP
printer):

- **Customer single‑print** — real register → real JWT → multipart file
  upload → real `PrintJob` → kiosk release → printer receives byte‑exact PDF.
- **Group printing** — guest host link → participant upload/pay → batch code
  → kiosk → byte‑exact prints.
- **Admin console** — separate app, 37 endpoints, kiosk CRUD **incl. API‑key
  reveal/regenerate**.
- **Print pipeline** — print‑script policy (block/mutate) → **IPP & IPPS** with
  full attributes (copies, duplex, colour, media, collate, page‑ranges).
- **Documents** — PrintLoop accepts **PDF, JPG, PNG only**. PDF passes
  through byte‑exact; JPG/PNG are wrapped to a PDF (built‑in, no external
  deps). Any other type is rejected at upload and at the kiosk.
- **File storage** — uploads persisted, served at `/api/files`, fetched by
  the kiosk/IPP service.
- **Kiosk** — a single static HTML page; open it full‑screen in a browser
  kiosk mode (no Electron / installer).

Verify anytime:
```
cd 01-backend
node scripts/virtualPrinter.cjs        # terminal 1
npm run dev                            # terminal 2
node scripts/e2eCustomerTest.cjs       # customer flow → byte-exact
node scripts/e2ePrintTest.cjs          # group flow   → byte-exact
```

---

## 2. Provisioning checklist (NOT code — you must supply these)

| # | Item | What to get | Where it plugs in |
|---|---|---|---|
| 1 | Server + domain + HTTPS | VPS/host, domain, Let's Encrypt (free) | Deploy `01-backend`; reverse‑proxy TLS |
| 2 | Database | Managed **PostgreSQL** (or MySQL) + backups | `01-backend/config/database.ts` (env‑switch from SQLite) |
| 3 | Redis | Managed Redis instance | Workers auto‑activate when `REDIS_URL` set |
| 4 | Payments | **Paystack live** (registered business + bank) + webhook secret | `services/paystack.service.ts`, `/api/payments` |
| 5 | Email / SMS | SendGrid/Mailgun + Termii (NG SMS) | `services/email.service.ts` / `sms.service.ts` |
| 6 | Object storage | S3‑compatible or Cloudinary | `utils/fileStore.ts` (swap disk for S3) |
| 7 | *(n/a — PDF + images only, no server-side conversion needed)* | — | — |
| 8 | Kiosk machine | A small PC + monitor at each printer; a browser in kiosk mode | `printloop-kiosk/index.html` (static, no build) |
| 9 | Printers + network | IPP/IPPS printers (or CUPS), static IPs, network path backend↔printer | Admin → Printers; Admin → Options → Printing |
| 10 | Monitoring/backups | Log/metrics + uptime alerts + DB backups | Ops layer |

Hardware per site: kiosk PC (NUC/mini‑PC/RPi), touchscreen, IPP laser
printer, UPS, lockable enclosure, reliable LAN.

---

## 3. Environment variables (`01-backend/.env`)

```ini
NODE_ENV=production
PORT=4000
PUBLIC_BASE_URL=https://api.yourdomain.com      # used to build /api/files URLs
ALLOWED_ORIGINS=https://app.yourdomain.com
APP_VERSION=1.0.0

# Auth
JWT_SECRET=<long-random-string>                  # REQUIRED in prod (dev fallback exists)
JWT_EXPIRES_IN=7d

# Database — default is SQLite (data/printloop.sqlite). For Postgres:
DB_DRIVER=postgres
DATABASE_URL=postgres://user:pass@host:5432/printloop
# (config/database.ts reads these; keep synchronize OFF in prod → use migrations)

# Redis (optional but needed for cleanup/watermark/auto-close workers)
REDIS_URL=redis://host:6379

# Payments — without these, Paystack runs in dev-mock
PAYSTACK_SECRET_KEY=sk_live_xxx
PAYSTACK_PUBLIC_KEY=pk_live_xxx
PAYSTACK_WEBHOOK_SECRET=xxx

# Email / SMS (optional — services no-op without)
SMTP_HOST=...    SMTP_PORT=587   SMTP_USER=...   SMTP_PASS=...   SMTP_FROM="PrintLoop <no-reply@…>"
TERMII_API_KEY=...   TERMII_SENDER_ID=PrintLoop

# Printing / IPPS (admin can also set these in Options → Printing)
IPP_SECURE=false
IPP_PORT=631
IPP_CA_CERT=/etc/printloop/printer-ca.pem
IPP_TLS_REJECT_UNAUTHORIZED=false
```

Frontend (`printloop-new-frontend/.env`):
```ini
VITE_API_URL=https://api.yourdomain.com
```

---

## 4. Deploy steps

**Backend**
1. Provision server + Postgres + (optional) Redis.
2. `cd 01-backend && npm ci`
3. Set `.env` (above). Switch `config/database.ts` to Postgres; generate &
   run migrations (replace `synchronize` in prod).
4. Run under a process manager (pm2/systemd): `npm start` (port 4000).
5. Put Nginx/Caddy in front for **HTTPS** + reverse proxy to `:4000`.

**Frontend (customer + admin SPA)**
1. `cd printloop-new-frontend && npm ci`
2. `VITE_API_URL=https://api.yourdomain.com npm run build`
3. Serve `dist/` as static (Nginx/CDN/Netlify) at `app.yourdomain.com`.

**Kiosk (per site)** — it's a single static page, no build/installer:
1. Copy `printloop-kiosk/` to the kiosk PC; serve it (`npm run serve` →
   `npx serve -l 8080 .`, or any static host / put `index.html` behind Nginx).
2. Open it full-screen in a browser kiosk mode, e.g.
   `chromium --kiosk http://localhost:8080` (autostart via a desktop
   session/systemd unit).
3. First run → enter **API base URL** + the **kiosk API key**
   (from Admin → Printers → Add/Regen Key).
4. Choose a network topology (see §5).

---

## 5. Printer/network topology (pick one — the #1 real‑world decision)

The **backend** opens the IPP connection, not the kiosk app. So:
1. **Backend on same LAN/VPN as printers** — simplest if on‑prem.
2. **CUPS on the kiosk box** (printer attached locally): set the kiosk's IP to
   the kiosk machine + Admin → Options `ippPath=/printers/<queue>`. Most
   secure for campus sites; printers never exposed to the internet.
3. **On‑prem relay/agent** if backend is cloud and printers are isolated.

Validate any printer before go‑live:
```
node 01-backend/scripts/probePrinter.cjs <printer-ip> [--path=/printers/<q>] [--ipps]
```

---

## 6. Remaining engineering (small, after infra lands)

- `config/database.ts`: finalize Postgres switch + TypeORM migrations
  (disable `synchronize` in prod).
- Paystack: enable real webhook **signature verification** + move customer
  wallet/transactions onto the real `Wallet`/`Transaction` entities (the
  customer endpoints already debit a real wallet best‑effort).
- Email verification + password reset for real customer accounts (currently
  accounts are auto‑verified since no email provider is wired).
- `utils/fileStore.ts`: S3 adapter + retention/cleanup worker (needs Redis).
- Security hardening: rate‑limit on auth, file scanning, CORS lockdown,
  secret management.
- Field‑test on real hardware (fonts, duplex, colour, large jobs).

---

## 7. Compliance / business (non‑technical, required)

- Registered business + bank for **Paystack live**.
- Data‑privacy for student documents (Nigeria **NDPR**): retention policy,
  consent, deletion (the auto‑delete‑after‑print setting exists).
- Terms of service / acceptable‑use; support contact (Branding settings).

---
*Everything in §1 is built and verified. §2 is provisioning. §3–§5 are config
& deploy. §6 is the small remaining code, mostly gated on §2 landing first.*
