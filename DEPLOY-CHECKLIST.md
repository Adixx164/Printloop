# Deploy Checklist — PrintLoop SaaS Production Launch

Run through this **before** enabling live traffic. Every ✅ must be green.

---

## 1. Secrets & Keys

- [ ] **Paystack**: `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` are **LIVE** keys (`pk_live_...` / `sk_live_...`). Dev `.env` uses test keys (`pk_test_...`).
- [ ] `PAYSTACK_WEBHOOK_SECRET` set (or rely on secret key fallback).
- [ ] `JWT_SECRET`: ≥32 random chars, **not** the dev fallback.
- [ ] `RENDER_CALLBACK_SECRET`: 32-byte hex (`openssl rand -hex 32`).
- [ ] `JWT_SECRET`, `RENDER_CALLBACK_SECRET`, `PAYSTACK_*`, `REDIS_URL`, `DATABASE_URL` — **all present** in prod env.
- [ ] `SEED_DEMO` **unset** (or ≠ "1").
- [ ] `DISABLE_RATE_LIMIT` **unset**.

---

## 2. Database & Redis

- [ ] `DATABASE_URL` = managed Postgres (Neon / Supabase / Railway / RDS).
- [ ] `DB_SSL=true` (required by managed providers).
- [ ] Run migrations: `npx tsx scripts/runMigrations.ts` (or worker boot applies them).
- [ ] `REDIS_URL` = managed Redis (Upstash / Redis Cloud / ElastiCache / Railway Redis).
- [ ] Worker process (`tsx worker.ts`) boots and registers scheduled jobs (see logs: "Scheduled jobs initialized").

---

## 3. Object Storage (S3 / R2)

- [ ] `S3_ENDPOINT` (e.g. `https://<account>.r2.cloudflarestorage.com`).
- [ ] `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- [ ] `S3_REGION` (or `auto` for R2).
- [ ] `S3_FORCE_PATH_STYLE=true` for R2 / MinIO.
- [ ] `S3_PUBLIC_URL` = public CDN / custom domain for the bucket (so `renderedPdfUrl` is a CDN URL, not the raw S3 endpoint).
- [ ] `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (can be same bucket, different prefix).
- [ ] Verify: upload a file via API → appears in bucket → `/api/files/<key>` redirects to presigned URL.

---

## 4. HTTPS / TLS

- [ ] DNS: `printloop.app` → Caddy / ALB / Cloudflare.
- [ ] ACME: Caddy auto-obtains certs (Let's Encrypt) on first request.
- [ ] API reachable at `https://api.printloop.app/health` → 200.
- [ ] Frontend reachable at `https://printloop.app` → loads.
- [ ] `PUBLIC_BASE_URL=https://api.printloop.app` (used by fileStore for local fallback URLs).
- [ ] `PRINTLOOP_APEX_DOMAINS=printloop.app,printloop.test` (add any custom domains).

---

## 5. Processes (systemd / PM2 / Docker / platform)

- [ ] **API**: `tsx server.ts` (port 4000) — 2+ replicas behind LB.
- [ ] **Worker**: `tsx worker.ts` — **exactly 1 replica** (registers cron jobs).
- [ ] **Frontend**: static build served by Caddy / Nginx / CDN.
- [ ] Health checks: `/health` returns 200 for both API and worker.

---

## 6. Backups

- [ ] Daily backup runs at 02:30 UTC (check worker logs).
- [ ] Backup lands in `BACKUP_S3_BUCKET/backups/`.
- [ ] Restore test: download a `.sqlite` or `.dump`, spin up local PG, verify schema + row counts.

---

## 7. Rate Limiting & Security

- [ ] `DISABLE_RATE_LIMIT` unset → login 5/min, signup 3/hr enforced via Redis.
- [ ] `REDIS_URL` reachable from all API replicas.
- [ ] Webhook HMAC verified (Paystack + render callback).
- [ ] Sentry DSN configured (`SENTRY_DSN`) — errors appear in dashboard.

---

## 8. Smoke Tests (post-deploy)

- [ ] `GET /health` → 200.
- [ ] Customer: signup → wallet top-up (test card) → upload PDF → create job → pay → code issued.
- [ ] Marketplace: shop accepts job → kiosk pulls → prints → collects.
- [ ] Dashboard: admin logs in → sees job queue → can requeue/release.
- [ ] Webhooks: Paystack callback → job status updates; render callback → job READY.
- [ ] Scheduled jobs: `mark-offline-kiosks` runs (check logs), `db-backup` uploads to S3.

---

## 9. Rollback Plan

- [ ] Previous Docker image tagged and pushable.
- [ ] DB migration rollback: none (migrations are one-way). Point-in-time recovery from managed PG backup.
- [ ] Config rollback: revert env vars + restart.

---

## Emergency Contacts

- **Paystack**: support@paystack.com (webhook failures, disputed charges)
- **Redis provider**: Upstash / Redis Cloud support
- **Postgres provider**: Neon / Supabase / Railway support
- **S3/R2 provider**: Cloudflare R2 / AWS S3 support

---

**Sign-off**: ____________________  Date: __________