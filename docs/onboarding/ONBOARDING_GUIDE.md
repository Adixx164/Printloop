# PrintLoop SaaS v2 - Developer Onboarding Guide

*Welcome to PrintLoop! This guide will get you from zero to productive in the codebase.*

---

## 🎯 What is PrintLoop?

PrintLoop is a **multi-tenant SaaS platform** that connects students/customers to print shops via a marketplace. Customers upload documents from their phones/laptops, pay via Paystack, and collect prints at nearby kiosks using a 6-character code.

**Core Value Prop**: "Upload from your phone. Pay online. Walk into any PrintLoop station and your prints are waiting. No queue. No haggling."

---

## 🏗️ Architecture at a Glance

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐
│   CUSTOMER  │    │   BACKEND   │    │ RENDER WORKER │    │  KIOSK AGENT  │  │  KIOSK  │
│  FRONTEND   │◄──►│   (API)     │◄──►│  (Railway)    │◄──►│  (On-site)    │◄──►│ PRINTER │
│  (React)    │    │  (Express)  │    │  (BullMQ)     │    │  (Node.js)    │  │  (LAN)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └──────────┘
```

**Key Components:**
| Component | Tech | Purpose |
|-----------|------|---------|
| **Frontend** | React + Vite + RTK Query | Customer/shop UI |
| **Backend** | Express + TypeORM | REST API, multi-tenant |
| **Render Worker** | Node.js + BullMQ | PDF → PWG-Raster |
| **Kiosk Agent** | Node.js + Electron | Cloud → LAN printer bridge |
| **Kiosk App** | Electron + React | Touchscreen UI |
| **Database** | SQLite (dev) / Postgres (prod) | TypeORM |
| **Queue** | Redis + BullMQ | Job processing |
| **Payments** | Paystack | Split payments + webhooks |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js 20+** (LTS)
- **pnpm 9+** (required for workspace)
- **Git** + **GitHub CLI** (`gh`)
- **Docker** (optional, for Postgres/Redis locally)

### 1. Clone & Install
```bash
git clone https://github.com/Adixx164/Printloop.git
cd printloop-saas-v2

# Install all workspaces
pnpm install --frozen-lockfile
```

### 2. Environment Setup
```bash
# Backend
cd 01-backend
cp .env.example .env
# Edit .env with your local values (see .env.example)

# Frontend
cd ../printloop-new-frontend
cp .env.example .env.development
# Edit with your local API URL

# Agent (optional for local dev)
cd ../printloop-agent
cp .env.example .env
```

### 3. Database Setup
```bash
# Option A: SQLite (zero-config, default)
cd 01-backend
npm run dev  # Auto-creates SQLite + runs migrations

# Option B: PostgreSQL (production-like)
# Set DATABASE_URL=postgresql://user:pass@localhost:5432/printloop
# Then run: npm run dev
```

### 4. Start Development Servers
```bash
# Terminal 1: Backend (port 4000)
cd 01-backend && npm run dev

# Terminal 2: Frontend (port 5173)
cd printloop-new-frontend && npm run dev

# Terminal 3: Render Worker (optional)
cd render-worker && npm run dev

# Terminal 4: Kiosk Agent (optional)
cd printloop-agent && npm run dev
```

### 5. Verify Everything Works
```bash
# Backend health
curl http://localhost:4000/health
# {"status":"ok","timestamp":"...","version":"1.0.0"}

# Frontend
open http://localhost:5173

# Run tests
cd 01-backend && npm run test:run
# 87 tests should pass
```

---

## 🗺️ Codebase Navigation

### Repository Structure
```
printloop-saas-v2/
├── 01-backend/                 # Express API + TypeORM
│   ├── src/
│   │   ├── config/             # Config, DB, Redis, settings
│   │   ├── controllers/        # Request handlers
│   │   ├── entities/           # TypeORM entities (30+)
│   │   ├── middleware/         # Auth, tenant, rate-limit
│   │   ├── routes/             # 25+ route modules
│   │   ├── services/           # Business logic (20+)
│   │   ├── workers/            # BullMQ workers
│   │   ├── utils/              # Helpers (fileStore, jwt, etc)
│   │   ├── workers/queues.ts   # BullMQ queue definitions
│   │   └── server.ts           # Entry point
│   ├── tests/                  # 87 tests (Vitest)
│   └── package.json
│
├── printloop-new-frontend/     # React + Vite + RTK Query
│   ├── src/
│   │   ├── components/         # UI components (shadcn-style)
│   │   ├── pages/              # Route pages
│   │   ├── store/              # Redux + RTK Query
│   │   ├── hooks/              # Custom hooks
│   │   ├── lib/                # API client, sentry, etc
│   │   └── main.tsx
│   └── package.json
│
├── printloop-agent/            # On-site kiosk agent (Node.js)
│   ├── agent.ts                # Main agent (718 lines)
│   ├── install.ps1 / install.sh
│   └── package.json
│
├── printloop-kiosk-app/        # Electron kiosk app
│   ├── src/main/               # Electron main process
│   ├── src/renderer/           # React renderer
│   └── package.json
│
├── render-worker/              # Cloud render worker
│   ├── src/pipeline/render.ts  # PDF → PWG pipeline
│   └── package.json
│
├── worker/                     # BullMQ render worker
│   ├── src/executor.ts
│   └── src/index.ts
│
├── tools/                      # Build/ops scripts
└── docs/                       # Internal docs
```

---

## 🔑 Key Concepts to Understand

### 1. Multi-Tenancy (Dimension 2)
Every customer-facing entity has `tenantId NOT NULL`. The `resolveTenant` middleware resolves tenant from:
1. JWT `tenantId` claim
2. Subdomain (`shop.printloop.app`)
3. Custom domain (`print.shop.com`)
4. `X-Tenant-Slug` header
5. Legacy fallback (legacy tenant)

### 2. Print Job Lifecycle (16 States)
```
PENDING → RENDERING → AWAITING_ACCEPT → RELEASING → PRINTING → DONE
              ↓              ↓
           FAILED         EXPIRED (24h)
```

### 3. Six Print Transports
| Transport | Protocol | Port | Use Case |
|-----------|----------|------|----------|
| `ipp` | IPP/HTTP | 631 | Modern network printers |
| `raw9100` | JetDirect | 9100 | HP/Brother/Lexmark |
| `spooler` | OS Print Queue | OS | USB/Bluetooth/local |
| `printnode` | HTTPS | 443 | Behind NAT/firewall |
| `lpd` | LPR/LPD | 515 | Legacy enterprise |
| `email` | SMTP | 587 | HP ePrint, Canon, Epson |

### 4. Payment Flow (Paystack)
```
Customer → Paystack Checkout → charge.success webhook
                                    ↓
                        completePrintJobPayment()
                         ├── Mint release code (6-char)
                         ├── Record Payment + Transaction
                         ├── Update tenant balance
                         ├── Send SMS/Email with code
                         ├── Enqueue render job
                         └── Arm accept window (V2-58)
```

### 5. Render Pipeline (V2-6)
```
Customer pays → BullMQ enqueue → Render Worker (Railway)
                                    ↓
                        Ghostscript: PDF → PDF/A
                                    ↓
                        cups-filters: PDF → PWG-Raster (pdftopwg)
                                    ↓
                        Ghostscript: Preview JPGs
                                    ↓
                        Upload PWG + Previews to S3
                                    ↓
                        HMAC POST /api/render/callback
                                    ↓
                        applyRenderCostReconciliation()
                                    ├── delta < 0 → Write-off
                                    ├── delta > 0 → Shortfall
                                    └── delta = 0 → No action
```

---

## 🛠️ Common Development Tasks

### Run Tests
```bash
# Backend tests
cd 01-backend && npm run test:run

# Frontend tests
cd printloop-new-frontend && npm test

# TypeScript check (all)
cd 01-backend && npm run typecheck
cd printloop-new-frontend && npm run typecheck
cd printloop-agent && npm run typecheck
```

### Database Operations
```bash
# Generate migration
cd 01-backend
npm run migration:generate --name=AddNewField

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Adding a New API Endpoint
1. **Create route file**: `src/routes/newFeature.routes.ts`
2. **Add to app.ts**: `app.use("/api/feature", authenticate, resolveTenant, newFeatureRoutes)`
3. **Add RTK Query endpoint** in frontend: `src/store/services/featureApi.ts`
4. **Add tests**: `tests/feature.test.ts`

### Database Migrations
```bash
# Generate migration
npm run migration:generate --name=AddNewFieldToUser

# Edit generated file in src/migrations/
# Run migration
npm run migration:run
```

---

## 🔍 Debugging Tips

### Backend Debugging
```bash
# View logs
cd 01-backend && npm run dev  # Logs to console

# Database inspection
sqlite3 data/printloop.sqlite ".tables"
sqlite3 data/printloop.sqlite "SELECT * FROM print_jobs LIMIT 5;"

# Redis inspection
redis-cli KEYS "*"
redis-cli GET "bull:render:jobs:active"
```

### Frontend Debugging
```bash
# React DevTools
# Redux DevTools (RTK Query cache inspection)

# Network tab: Check /api/customer/print-jobs, /api/pricing
# React Query DevTools: Cache inspection
```

### Agent Debugging
```bash
# Run agent locally
cd printloop-agent
npm run dev

# Check logs
# Windows: %ProgramData%\PrintLoop\agent.log
# Linux: journalctl -u printloop-agent -f
```

---

## 📋 Code Review Checklist

Before submitting PR:
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Tests pass (`npm run test:run`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console.log in production code
- [ ] Proper error handling (try/catch + logging)
- [ ] Tenant isolation verified (all queries scoped)
- [ ] Idempotency handled (webhooks, retries)
- [ ] Secrets not committed (.env in .gitignore)

---

## 🚀 Deployment Checklist

### Before Deploy
- [ ] All tests pass (CI green)
- [ ] TypeScript compiles
- [ ] Build succeeds
- [ ] Migrations reviewed
- [ ] Environment variables set in target
- [ ] Secrets rotated if needed

### Post Deploy
- [ ] Health check: `GET /health`
- [ ] Smoke test: Create test print job
- [ ] Verify webhook delivery (Paystack test)
- [ ] Check render worker processing
- [ ] Verify agent connectivity

---

## 🆘 Getting Help

| Resource | Link |
|----------|------|
| **Architecture Docs** | `PRINTLOOP_ARCHITECTURE.md` |
| **Flow Charts** | `PRINTLOOP_ARCHITECTURE_FLOW.html` |
| **API Spec** | `/api/openapi.json` (running server) |
| **Issues** | GitHub Issues |
| **Slack** | `#printloop-dev` |

---

## 🎯 First Week Goals

| Day | Goal |
|-----|------|
| Day 1 | Local dev running, tests passing |
| Day 2 | Understand multi-tenancy + print job lifecycle |
| Day 3 | Trace customer upload → payment → render → print |
| Day 4 | Add a small feature (new endpoint or UI component) |
| Day 5 | Deploy to staging, verify end-to-end |

---

**Welcome to the team! 🎉** 

*Questions? Ask in `#printloop-dev` or check `PRINTLOOP_ARCHITECTURE.md` for deep dives.*