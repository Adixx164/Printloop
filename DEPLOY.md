# PrintLoop — deployment guide

PrintLoop is two artefacts that need different hosts:

| Piece                  | What it is                          | Where it goes |
|------------------------|-------------------------------------|---------------|
| `printloop-new-frontend` | React + Vite SPA (customer + admin) | **Vercel** (or any static host) |
| `01-backend`           | Express + TypeORM + SQLite          | **Railway / Render / Fly.io** — or a VPS / on-prem box |
| Per-campus kiosk       | A static HTML page in browser-kiosk mode | The kiosk machine itself |

The two reasons the backend can't sit on Vercel:

1. **Vercel runs serverless functions** (10 s timeout, no persistent FS).
   PrintLoop's Express server is long-running and stores both an SQLite
   DB and uploaded PDFs on disk.
2. **The backend opens raw TCP sockets to printers** (IPP on 631, raw on
   9100). Serverless edge environments don't allow outbound TCP to
   arbitrary IPs — and even if they did, the printer is on a LAN the
   serverless edge can't reach.

---

## Frontend on Vercel

`vercel.json` at the repo root tells Vercel to:

- `cd printloop-new-frontend && pnpm install && pnpm build`
- Serve `printloop-new-frontend/dist/`
- Rewrite all SPA routes to `index.html`

### Set one env var in the Vercel project

The frontend reads `VITE_API_URL` at build time
([`printloop-new-frontend/src/constants/config.ts`](printloop-new-frontend/src/constants/config.ts)):

| Key            | Value                                     | Notes |
|----------------|-------------------------------------------|-------|
| `VITE_API_URL` | `https://api.your-printloop-domain.com`   | Points the SPA at the deployed backend. With the `/api` suffix or without — the constant normalises either. |

If unset, it defaults to `/api` (same-origin), which only works if you
front the backend with a reverse proxy on the same domain.

After setting the env var, redeploy. Vercel will pick up the
`vercel.json` and produce a working SPA.

---

## Backend — pick one

### Option A: Railway / Render / Fly.io (easiest cloud)

Each of these supports long-running Node services + persistent volumes.

1. Point the platform at the `01-backend/` directory.
2. Build: `npm install && npm run typecheck`. Start: `npm run dev`
   (uses `tsx watch`) — or, better for prod, add a `start` script that
   runs `tsx server.ts`.
3. Attach a **persistent volume** of at least 1 GB mounted at
   `/app/01-backend/data` so the SQLite file and `uploads/` survive
   redeploys.
4. Set env vars:

| Key                       | Value                              |
|---------------------------|------------------------------------|
| `NODE_ENV`                | `production` |
| `PORT`                    | platform default (Railway/Render/Fly set this) |
| `JWT_SECRET`              | a long random string |
| `PAYSTACK_SECRET_KEY`     | from Paystack dashboard |
| `PAYSTACK_WEBHOOK_SECRET` | distinct from the secret key |
| `ALLOWED_ORIGINS`         | `https://your-vercel-domain.vercel.app` (comma-separated for multiples) |
| `DATABASE_FILE`           | `/data/printloop.sqlite` (or wherever your volume mounts) |

**The backend's LAN constraint** is the catch: a cloud backend cannot
print to a LAN printer. You'll either need to:

- Use [Tailscale](https://tailscale.com/) or [WireGuard](https://www.wireguard.com/)
  to put the cloud backend and the campus printers on the same virtual
  LAN. Free for small fleets.
- Or run a small **kiosk agent** at each campus that pulls jobs from
  the cloud backend and dispatches them locally. Not built yet — the
  current architecture assumes backend ↔ printer LAN reachability.

### Option B: on-prem at each campus (matches today's architecture)

Run the backend on a small box (Raspberry Pi 5, Mini-PC, NUC) at each
campus. The same box runs the Express server, the SQLite DB, and has
direct LAN access to the printer.

- One install per campus.
- Frontend can still be one cloud deploy — set `VITE_API_URL` per
  campus to point at that campus's backend (e.g.,
  `https://api.unilag.printloop.ng`).
- Or run the frontend locally on the same box at
  `http://printloop.local` if you don't want it cloud-exposed.

This is what your test today did — backend on your machine, printer on
your LAN, and it worked.

### Option C: hybrid

Backend in the cloud (for the admin console + customer accounts +
billing webhooks), plus the **kiosk-agent pattern** for the printer
dispatch. Cleanest long-term but requires building the agent. See
[`PRINTLOOP-CUPS.md`](PRINTLOOP-CUPS.md) — the CUPS-backend script
already implements the pull-side of this for laptops; the kiosk-agent
would be the same shape.

---

## SQLite vs Postgres

The shipped stack uses **SQLite with `synchronize: true`** — great for
dev and a single-node deploy. For multi-region cloud deploys you'd
want to switch to Postgres:

1. Change `01-backend/config/database.ts` — set `type: 'postgres'`,
   take connection details from `DATABASE_URL`.
2. Remove `synchronize: true`. Generate migrations via
   `npm run typeorm migration:generate` and run them on deploy.
3. `pg` is already in `package.json`.

This is a one-day job; not needed for Vercel + Railway with one
backend instance.

---

## What lives where after deploy

```
                    ┌─────────────────────────┐
                    │   browser (customer)    │
                    │   browser (admin)       │
                    └────┬────────────────────┘
                         │ HTTPS
                         ▼
                ┌──────────────────────┐
                │     Vercel           │  ← frontend (this guide)
                │  Vite SPA static     │
                └────┬─────────────────┘
                     │ VITE_API_URL  (HTTPS)
                     ▼
        ┌────────────────────────────────┐
        │  Backend host                  │  ← Railway / Render / Fly /
        │  Express + SQLite + uploads    │     on-prem (depends on the
        └────┬──────────────────────┬────┘     LAN constraint above)
             │ IPP (631)            │ raw 9100
             ▼                      ▼
        ┌────────────────┐    ┌──────────────────┐
        │  campus printer│    │ Sharp MX-5112N   │ ← your test printer
        │  (IPP-Everywhere)   │ (raw9100 transport)│
        └────────────────┘    └──────────────────┘
```

---

## Quick checklist for your first deploy

1. ✅ Push to GitHub (this commit).
2. ✅ In Vercel, "Import Project" → pick `Adixx164/Printloop`.
3. Set env var `VITE_API_URL` to the (eventual) backend URL.
4. Deploy backend on Railway/Render/Fly with the env vars above.
5. Set `ALLOWED_ORIGINS` on the backend to your Vercel domain.
6. Update Vercel's `VITE_API_URL` to the live backend URL.
7. Redeploy frontend.
8. For the printer: backend must be on the same network as the
   printer, OR you set up Tailscale, OR you wait for the kiosk-agent
   work. **Local-development today proves the kiosk → printer link works;
   moving the backend to the cloud breaks it until you bridge the LAN.**
