# PrintLoop observability

How to ship the SaaS's logs, traces, and metrics into a dashboard so you can answer questions like "are payments slow today?", "which tenant is generating errors?", and "is the kiosk fleet healthy?" — without reading raw stdout.

This document covers four stacks. Pick one. They're listed cheapest-first.

- [Sentry](#sentry) — errors + frontend performance (already wired, V2-34 / V2-36)
- [Grafana + Loki](#grafana--loki) — logs + dashboards, self-hosted, free
- [Datadog](#datadog) — managed; the pipeline ingests pino JSON natively
- [Better Stack / Highlight / Axiom](#alternatives) — managed log providers

## What we emit out-of-the-box

| Stream | Where it comes from | Format |
|---|---|---|
| **Backend logs** | `01-backend/utils/logger.ts` (pino) | JSON to stdout, one event per line; every request has `requestId` + `tenantId` |
| **Worker logs** | `01-backend/worker.ts` and `render-worker/src/index.ts` | Same pino JSON shape; the `svc` field differs (`printloop-api` / `printloop-worker` / `printloop-render-worker`) |
| **Backend errors** | `utils/observability.ts` `reportError()` | Sent to Sentry when `SENTRY_DSN` is set; no-op otherwise |
| **Frontend errors** | `<SentryErrorBoundary>` + auto-captured uncaught | Sent to Sentry when `VITE_SENTRY_DSN` is set |
| **Frontend perf** | Sentry browser-tracing + react-router-v6 integration | Route transitions become spans |
| **Frontend user context** | `SentryAuthListener` (Redux auth slice → Sentry user) | `{ id, email, role }` only; never JWT |
| **Frontend tenant context** | `BrandProvider` → `setSentryTenant(slug)` | Tag on every event |

The log line shape:

```json
{
  "level": "info",
  "time": "2026-06-09T11:11:19.924Z",
  "svc": "printloop-api",
  "requestId": "d2a8c8c4-…",
  "tenantId": "a4f5b02b-…",
  "method": "GET",
  "path": "/api/saas/me",
  "status": 200,
  "durationMs": 12,
  "msg": "request"
}
```

Error lines add `err.name`, `err.message`, `err.stack`. Payment events include `paymentId` + `commissionAmount`; webhook events include `webhookId` + the upstream signature status.

---

## Sentry

Already wired. Set these env vars:

| Env | Where | Purpose |
|---|---|---|
| `SENTRY_DSN` | backend | Sends errors + uncaught + manual `reportError(…)` |
| `SENTRY_TRACES_SAMPLE_RATE` | backend, default `0.1` | Trace sampling (10%) |
| `VITE_SENTRY_DSN` | frontend build env | Sends frontend errors + route transitions |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | frontend, default `0.1` | Browser-tracing sample rate |
| `VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | frontend, default `0` | Set to `0.1` to record clickstream for errors |
| `VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | frontend, default `0` | Set to `0.01` for ambient session sampling |

You can use the same Sentry project for backend + frontend or split. Splitting makes alert routing cleaner.

### What you get filtering by

- `tenant.slug` tag — filter all errors hitting Yaba Print Hub
- `user.role` tag — narrow to platform admins only
- `release` — once you set `APP_VERSION` / `VITE_APP_VERSION`, regressions get pinned to the offending build

---

## Grafana + Loki

Self-hosted. Free at small scale. Loki ingests the pino JSON; Grafana visualises.

### Pipeline

```
backend stdout ─► promtail ─► loki ─► grafana ─► your browser
worker  stdout ─►       (same)
```

### Files

- `monitoring/promtail-config.yaml` — point this at your loki host; promtail tails the container/journal/syslog and ships
- `monitoring/grafana-dashboard.json` — importable dashboard (Grafana > Dashboards > Import > paste JSON)

### Dashboard panels (what's in the JSON)

1. **Requests per minute** — `rate({svc="printloop-api"} [1m])`
2. **Error rate %** — `sum(rate({svc="printloop-api",level="error"} [5m])) / sum(rate({svc="printloop-api"} [5m]))`
3. **p50/p95/p99 latency** — quantile_over_time on `durationMs`
4. **Top error paths** — `topk(10, sum by (path) (rate({svc="printloop-api",level="error"} [15m])))`
5. **Requests by tenant** — sum over `tenantId`
6. **Render-worker queue depth** — counts of `RENDERING` state
7. **Payment success rate** — Paystack webhook status over time
8. **Active kiosks** — log events tagged `kiosk.heartbeat` in last 5 minutes
9. **Cloud → kiosk dispatch round-trip** — time between `job.ready` and `job.printed`

### Start the local Loki stack

```bash
docker run -d --name=loki -p 3100:3100 grafana/loki:latest
docker run -d --name=promtail \
  -v /var/log:/var/log \
  -v $(pwd)/monitoring/promtail-config.yaml:/etc/promtail/config.yaml \
  grafana/promtail:latest -config.file=/etc/promtail/config.yaml
docker run -d --name=grafana -p 3000:3000 grafana/grafana:latest
```

Then `http://localhost:3000` → Configuration > Data sources > Add Loki at `http://loki:3100` → Dashboards > Import > paste `monitoring/grafana-dashboard.json`.

---

## Datadog

Managed. Pricing is per-host + per-GB-of-logs.

The Datadog Agent runs on the same machine as the API, tails the stdout, parses JSON, sends to Datadog. No code changes needed — the pino output is already the shape Datadog expects.

### Files

- `monitoring/datadog-pipeline.yaml` — Datadog log processor pipeline (attribute remappers + facets)

### Setup

1. Install the Datadog Agent (`DD_API_KEY=… DD_SITE=datadoghq.eu bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"`)
2. Enable log collection in `/etc/datadog-agent/datadog.yaml`:
   ```yaml
   logs_enabled: true
   ```
3. Drop a config under `/etc/datadog-agent/conf.d/printloop.d/conf.yaml`:
   ```yaml
   logs:
     - type: file
       path: /var/log/printloop-api/*.log
       service: printloop-api
       source: pino
   ```
4. In the Datadog UI: **Logs > Configuration > Pipelines** — click "New Pipeline" and import `monitoring/datadog-pipeline.yaml`. This parses JSON, lifts `tenantId` / `requestId` / `level` / `durationMs` to first-class facets, and routes errors to the alert pipeline.
5. Build a dashboard from the facets — Datadog has a `pino` integration that gives you a prebuilt starter board.

### What changes from the Grafana flow

| | Grafana + Loki | Datadog |
|---|---|---|
| Where logs live | Your Loki | Datadog's storage |
| Cost | Free; you operate Loki | Per-GB + per-host |
| Alert engine | Prometheus / Grafana managed alerts | Datadog Monitors (better UI) |
| APM tie-in | None unless you add Tempo | Native — links log → trace if you also run `dd-trace` |

Pick Datadog if you want one dashboard for everything and you're not budget-constrained. Pick Grafana if you'd rather self-host.

---

## Alternatives

- **[Better Stack](https://betterstack.com/)** — pino-friendly out-of-the-box, has a free tier. Same flow as Datadog (agent tails stdout). Their on-call rotation product is also good.
- **[Highlight](https://www.highlight.io/)** — frontend session replay + backend log management; their React SDK is similar to Sentry's but with replay built in.
- **[Axiom](https://axiom.co/)** — Loki-shaped query language with managed storage. Cheaper than Datadog at moderate volumes.

The pino JSON shape works with all three; only the agent / collector config differs.

---

## Adding a `/metrics` Prometheus endpoint (optional)

If you want OS-level + app-level gauges (Redis queue depth, active DB pool connections, BullMQ active jobs), wire `prom-client`:

```ts
// 01-backend/utils/metrics.ts (new file — not yet shipped)
import client from 'prom-client';
client.collectDefaultMetrics({ prefix: 'printloop_' });

export const renderQueueDepth = new client.Gauge({
  name: 'printloop_render_queue_depth',
  help: 'Pending jobs in the render queue',
});

export async function exposeMetricsRoute(app: import('express').Application) {
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });
}
```

Then point Prometheus at it. We haven't shipped this because the pino+Loki path covers our needs for V2-35; flip the switch when you need request rate / queue depth gauges Loki can't compute cheaply.

---

## Last updated
2026-06-09 — V2-36 close-out
