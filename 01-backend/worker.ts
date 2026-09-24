/**
 * Background-worker entrypoint (Critical bucket #5 — V2-13).
 *
 * The API process (`server.ts`) serves HTTP. This process consumes
 * the BullMQ queues. Splitting them apart is what makes horizontal
 * scaling safe — with N API instances + 1 worker, you don't get
 * N duplicate `repeat` job registrations, and the worker doesn't
 * compete with HTTP requests for CPU on the same node.
 *
 * Run with:
 *   node dist/worker.js
 * or in dev:
 *   tsx watch worker.ts
 *
 * Required env:
 *   - REDIS_URL or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
 *   - the same DB env vars `server.ts` uses
 *
 * The worker process intentionally does NOT call `createApp()` —
 * no HTTP listener, no routes. It is purely a BullMQ consumer +
 * the scheduled-job repeat registrar.
 */
import "reflect-metadata";
import "dotenv/config";
// V2-34 — see server.ts for the why-first-line rationale.
import { initSentryIfConfigured } from "./utils/observability.js";
initSentryIfConfigured();
import { AppDataSource, runPostInitMigrations } from "./config/database.js";
import { ensureLegacyTenant } from "./config/seed.js";
import { ensureSystemSettings } from "./config/settings.js";
import { initScheduledJobs } from "./workers/queues.js";
import { REDIS_ENABLED } from "./config/redis.js";
import { assertDeployConfig } from "./config/validateEnv.js";

// Importing these for side-effect: each `*.worker.ts` constructs a
// BullMQ `Worker` at module load. Without these imports, the queues
// would have nothing consuming them.
import "./workers/scheduled.worker.js";
import "./workers/fileCleanup.worker.js";
import "./workers/watermark.worker.js";
import "./workers/webhook.worker.js";

async function bootstrap() {
  if (!REDIS_ENABLED) {
    console.error(
      "[worker] REDIS_URL or REDIS_HOST is not configured. The worker " +
        "process requires Redis (BullMQ has no in-memory fallback). " +
        "Set REDIS_URL and restart.",
    );
    process.exit(1);
  }

  try {
    assertDeployConfig();

    await AppDataSource.initialize();
    console.log("[worker] Database connected; migrations applied.");

    // The worker shares the same DB-bootstrap idempotent helpers as
    // the API. If the worker boots first against a fresh DB, the
    // legacy tenant + settings catalog still get seeded.
    await runPostInitMigrations();
    await ensureLegacyTenant();
    await ensureSystemSettings();

    // Register repeatable jobs (cron-style). With the API/worker
    // split, ONLY the worker process registers these — N API
    // instances no longer step on each other's repeats.
    await initScheduledJobs();

    console.log("[worker] Online. Consumers: scheduled, fileCleanup, watermark, webhook.");
  } catch (error) {
    console.error("[worker] Failed to start:", error);
    process.exit(1);
  }
}

const shutdown = (signal: string) => {
  console.log(`[worker] ${signal} received, shutting down`);
  // BullMQ Workers will close their queue connections on process
  // exit. For graceful drain we'd close each Worker explicitly
  // (each `.worker.ts` exports the `new Worker(...)`); deferred
  // until we observe a hang in real deployments.
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

bootstrap();
