# PrintLoop SaaS — Deployment Runbook (V2-21)

Canonical deploy guide for the **multi-tenant SaaS** (v2). The older
[`DEPLOY.md`](DEPLOY.md) covers the v1 single-tenant/SQLite story and
the still-relevant printer-LAN constraint — read it for the kiosk ↔
printer networking notes; read THIS for standing up the SaaS.

This takes the build (feature-complete per `JOURNAL.md` V2-0 → V2-20)
from disk to a live multi-tenant platform.

There are **three deployable backend units**:

| Unit | Command | Scales |
|---|---|---|
| **api** (`01-backend`) | `npm start` | horizontally (N instances) |
| **worker** (`01-backend`) | `npm run worker` | **exactly 1** — owns the repeatable cron jobs |
| **render-worker** (`render-worker`) | default CMD | horizontally |

Plus the **frontend** (`printloop-new-frontend` → static host) and the
**kiosk app** (separate per-site install).

---

## 0. Prerequisites

- Container platform: Railway / Fly.io / Render / k8s.
- Managed **Postgres** (Neon, Supabase, Railway, RDS).
- Managed **Redis** (Upstash, Railway).
- **S3-compatible** bucket (S3 / R2 / B2) for render artifacts.
- **Paystack** live account (subaccounts + transfers enabled).
- DNS control for your apex (`printloop.app`).

---

## 1. Provision data services

1. Postgres → copy the connection string.
2. Redis → copy the `rediss://` URL.
3. S3 bucket + IAM user scoped to it (`s3:GetObject`, `s3:PutObject`).

No manual schema step. The API runs migrations on boot. On a Postgres
`DATABASE_URL` only the **PostgresBaseline** migration runs (the
SQLite incremental chain is driver-gated out); it builds the whole
schema, then `runSeed` + `ensureLegacyTenant` populate the legacy
tenant row and the system-settings catalog. Demo accounts only land
when `SEED_DEMO=1` (default OFF in `.env.production.example` —
see §3a for the production bootstrap path).

---

## 2. Secrets

Fill `01-backend/.env.production.example` into the platform secret
store. Generate the shared secrets:

```
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # RENDER_CALLBACK_SECRET  (SAME value on api + render-worker)
```

`api` and `worker` share one env group. `render-worker` needs
`REDIS_URL`, `PRINTLOOP_API_URL`, `RENDER_CALLBACK_SECRET`,
`S3_BUCKET`, `AWS_*`.

---

## 3. Deploy the units

```bash
# API
docker build -t printloop-api ./01-backend
docker run -d --env-file api.env -p 4000:4000 printloop-api npm start

# Worker — same image, 1 replica ONLY
docker run -d --env-file api.env printloop-api npm run worker

# Render worker
docker build -t printloop-render ./render-worker
docker run -d --env-file render.env printloop-render
```

On Railway/Render: one service per unit from this repo; point
`worker` at the same env group as `api`.

**Worker cardinality is load-bearing:** the worker calls
`initScheduledJobs()`. Two replicas = duplicate repeatable jobs =
double-fired payouts. Keep it at 1; scale `api` freely.

---

## 3a. Bootstrap the first super admin

With `SEED_DEMO=0` (the production default) the database boots clean
— **no admin accounts exist**, so the platform console at `/platform`
has nobody to let in. Run the bootstrap CLI **once** to mint the
operator account:

```bash
# Docker (most platforms expose a one-off "run" command)
docker run --rm --env-file api.env printloop-api \
  npx tsx scripts/createSuperAdmin.ts ops@yourcompany.com 'StrongPassword!'

# Bare metal
cd 01-backend
npx tsx scripts/createSuperAdmin.ts ops@yourcompany.com 'StrongPassword!'
```

The CLI is **idempotent**: re-running with the same email is a no-op
("already a SUPER_ADMIN"). To rotate the password later:

```bash
npx tsx scripts/createSuperAdmin.ts ops@yourcompany.com 'NewPassword!' --reset-password
```

Optional flags: `--first-name=`, `--last-name=`. Env vars
`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_FIRST_NAME`,
`SUPER_ADMIN_LAST_NAME` are an alternative for CI/CD secrets stores.

After it runs, log in at `https://app.printloop.app/login` and
**immediately enable 2FA** from Settings → Security (V2-22). Then add
any teammates as platform admins from `/platform`.

> **Never set `SEED_DEMO=1` in production.** It plants
> `admin@printloop.test / Admin1234!` and three other accounts whose
> passwords are in this repo's source.

---

## 4. Frontend

```bash
cd printloop-new-frontend
VITE_API_URL=https://api.printloop.app npm run build
# deploy dist/ to Vercel / Netlify / S3+CloudFront
```

Wildcard DNS `*.printloop.app` → the frontend host, so tenant
subdomains resolve. The API derives the tenant from the Host header.

---

## 5. Custom domains (Dimension 8)

Tenant adds a domain in Settings → Custom domain and publishes a
`TXT` at `_printloop-verify.<domain>` + a `CNAME` →
`domains.printloop.app`. Terminate TLS for those hostnames at the
edge — **Cloudflare for SaaS** (least ops) or self-hosted Caddy
`on-demand-tls`. Set `PRINTLOOP_DOMAINS_CNAME` to match the edge.

---

## 6. Paystack webhooks

Dashboard webhook URL →
`https://api.printloop.app/api/payments/webhook`. HMAC-verified
against `PAYSTACK_SECRET_KEY` (or `PAYSTACK_WEBHOOK_SECRET`).
Consumes `charge.success/failed`, `transfer.success/failed/reversed`.

---

## 7. Smoke-test the live deploy

```bash
curl https://api.printloop.app/health

# no NULL tenantId anywhere (the V2-19/20 regression class):
psql "$DATABASE_URL" -c \
  "select count(*) from users where \"tenantId\" is null;"   # expect 0

# platform + impersonation E2E (set B=live API URL in the script first)
node 01-backend/scripts/e2ePlatformTest.cjs
```

**Confirm `SEED_DEMO` is not set.** With it unset/0, no demo accounts
exist (V2-27). If you find `admin@printloop.test` in your `users`
table, SEED_DEMO was on at first boot — delete those rows:

```sql
DELETE FROM users WHERE email IN (
  'admin@printloop.test', 'ops@printloop.test', 'student@printloop.test'
);
```

---

## 8. Local full-stack (no cloud)

```bash
docker compose up --build      # from repo root
```

Brings up Postgres + Redis + api + worker + render-worker wired
together — the fastest way to exercise the **Postgres path** before
touching a provider. Dev secrets are inline in `docker-compose.yml`;
never reuse them.

---

## 9. Post-launch hardening (JOURNAL "v3 polish")

- Sentry DSN (errors) + ship pino logs to Axiom/BetterStack.
- Postgres RLS on high-risk tables (defence-in-depth).
- Enforce 2FA for platform admins; rotate demo creds.
- Replace `scripts/e2e*.cjs` with a Vitest suite in CI.
- CSV/PDF month-end tenant statements.
