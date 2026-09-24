# PrintLoop Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend      │     │   Backend API    │     │  Render Worker   │
│  (Static Site)  │────▶│   (Web Service)  │────▶│  (Web Service)   │
│  Render Static  │     │  Render Web      │     │  Render Web      │
└─────────────────┘     └──────────────────┘     └──────────────────┘
         │                       │                        │
         │                       ▼                        │
         │              ┌──────────────────┐              │
         │              │  PostgreSQL      │◀─────────────┘
         │              │  (Render PG)     │
         │              └──────────────────┘
         │                       │
         │              ┌──────────────────┐
         └──────────────▶│  Redis           │
                         │  (Render Redis)  │
                         └──────────────────┘
```

## Quick Deploy (Manual - 30 min)

### 1. Render Dashboard Setup

1. Go to [dashboard.render.com](https://dashboard.render.com) → Sign up with GitHub
2. **New → Blueprint** → Connect `printloop-saas-v2` repo → Select `render.yaml`
3. Render will create all services from the Blueprint

### 2. Set Required Secrets (in Render Dashboard → each service → Environment)

| Service | Secret | Value |
|---------|--------|-------|
| `printloop-api` | `PAYSTACK_SECRET_KEY` | `sk_test_...` |
| `printloop-api` | `PAYSTACK_PUBLIC_KEY` | `pk_test_...` |
| `printloop-api` | `PAYSTACK_WEBHOOK_SECRET` | `whsec_...` |
| `printloop-api` | `FRONTEND_URL` | `https://printloop-frontend.onrender.com` |
| `printloop-api` | `ALLOWED_ORIGINS` | `https://printloop-frontend.onrender.com` |
| `printloop-frontend` | `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_...` |
| `printloop-render-worker` | `AWS_S3_BUCKET` | your-bucket |
| `printloop-render-worker` | `AWS_ACCESS_KEY_ID` | your-key |
| `printloop-render-worker` | `AWS_SECRET_ACCESS_KEY` | your-secret |

### 3. Update Paystack Dashboard

**Settings → Webhooks:**
```
https://printloop-api.onrender.com/api/webhooks/paystack
```

**Settings → Payments → Callback URL:**
```
https://printloop-frontend.onrender.com/payment/success
```

### 4. Deploy
- Push to `main` branch → GitHub Actions runs tests → triggers Render deploys via deploy hooks
- Or manually: Render Dashboard → each service → Manual Deploy

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

Triggers on push to `main`/`develop`:
1. **Test** - Backend (typecheck + test), Frontend (typecheck + build), Render Worker, Kiosk App
2. **Docker** - Build images for all services
3. **Lint** - All projects
4. **Deploy** - On `main` branch, triggers Render deploy hooks

### Render Deploy Hooks (Set in GitHub Secrets)

| Secret Name | Value |
|-------------|-------|
| `RENDER_API_DEPLOY_HOOK` | From Render Dashboard → API service → Settings → Deploy Hook |
| `RENDER_FRONTEND_DEPLOY_HOOK` | From Render Dashboard → Frontend service → Settings → Deploy Hook |
| `RENDER_RENDER_WORKER_DEPLOY_HOOK` | From Render Dashboard → Render Worker service → Settings → Deploy Hook |

---

## Local Development

```bash
# Backend
cd 01-backend
npm run dev          # tsx watch server.ts

# Frontend
cd printloop-new-frontend
npm run dev          # vite (proxies /api to localhost:4000)

# Render Worker
cd render-worker
npm run dev          # ts-node src/worker.ts

# Database (SQLite local)
# Runs automatically on backend start
```

---

## Environment Variables Reference

### Backend (`01-backend`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | 32+ char random string |
| `PAYSTACK_SECRET_KEY` | ✅ | Paystack test/live secret |
| `PAYSTACK_PUBLIC_KEY` | ✅ | Paystack public key |
| `PAYSTACK_WEBHOOK_SECRET` | ✅ | Webhook HMAC secret |
| `RENDER_CALLBACK_SECRET` | ✅ | HMAC for render worker callbacks |
| `FRONTEND_URL` | ✅ | Frontend domain for CORS |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS origins |
| `COMMISSION_PCT_DEFAULT` | | Default 0.10 (10%) |
| `SEED_DEMO` | | Set to "1" for demo data |

### Frontend (`printloop-new-frontend`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | `https://printloop-api.onrender.com/api` |
| `VITE_PAYSTACK_PUBLIC_KEY` | ✅ | Paystack public key |

### Render Worker

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | ✅ | Redis for BullMQ |
| `RENDER_CALLBACK_SECRET` | ✅ | Must match API's secret |
| `AWS_S3_BUCKET` | | For file storage |
| `AWS_ACCESS_KEY_ID` | | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | | AWS credentials |

---

## Database Migrations

```bash
# Local
cd 01-backend
npm run typecheck
# Migrations run automatically on server start (TypeORM synchronize)

# Production (Render)
# Migrations run on first deploy via TypeORM
# For manual: render exec printloop-api -- npm run migration:run
```

---

## Monitoring & Debugging

### Render Dashboard
- **Logs**: Real-time streaming
- **Metrics**: CPU, Memory, Requests, Latency
- **Events**: Deploys, Restarts, Crashes

### Health Checks
- API: `https://printloop-api.onrender.com/health`
- Frontend: `https://printloop-frontend.onrender.com`
- Render Worker: Check logs for "Worker started"

### Common Issues

| Issue | Fix |
|-------|-----|
| API 502/504 | Check logs → usually DB connection or Redis |
| CORS errors | Verify `ALLOWED_ORIGINS` includes frontend URL |
| Paystack webhook fails | Check `PAYSTACK_WEBHOOK_SECRET` matches dashboard |
| Build fails | Check Node version (20) and pnpm version (9) |
| DB connection | Verify `DATABASE_URL` format: `postgresql://user:pass@host:5432/db?sslmode=require` |

---

## Rollback

```bash
# Via Render Dashboard
# Service → Deploys → Click "..." on previous deploy → "Rollback to this deploy"

# Or via CLI
render rollback printloop-api --to-deploy=<deploy-id>
```

---

## Custom Domain (Optional)

1. Render Dashboard → Service → Settings → Custom Domains
2. Add `api.yourdomain.com` → Verify DNS
3. Update Paystack webhook URL
4. Update frontend `VITE_API_URL`

---

## Cost Estimate (Monthly)

| Service | Plan | Cost |
|---------|------|------|
| API (Web) | Free → Starter | $0 → $7 |
| Frontend (Static) | Free | $0 |
| Render Worker | Free → Starter | $0 → $7 |
| PostgreSQL | Free → Starter | $0 → $7 |
| Redis | Free → Starter | $0 → $7 |
| **Total (Free)** | | **$0** |
| **Total (Starter)** | | **~$28/mo** |

> **Free tier limits**: Services spin down after 15min inactivity (cold start ~30s). Starter keeps services warm.