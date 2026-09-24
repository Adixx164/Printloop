import "reflect-metadata";
import "dotenv/config";
// V2-34 — error reporting must initialise BEFORE any other import that
// could throw, so a crash during bootstrap still gets captured.
import { initSentry } from "./services/sentry.service.js";
initSentry();
import { createApp } from "./app.js";
import { AppDataSource, runPostInitMigrations } from "./config/database.js";
import { runSeed, ensureLegacyTenant } from "./config/seed.js";
import { ensureSystemSettings } from "./config/settings.js";
import { assertDeployConfig } from "./config/validateEnv.js";
import { startRetentionSweep } from "./workers/retention.js";
import { config } from "./config/index.js";

const port = config.app.port;

async function bootstrap() {
  try {
    // Fail fast on a misconfigured production env (missing secrets,
    // demo seeding, disabled rate limit) before touching the DB.
    assertDeployConfig();

    await AppDataSource.initialize();
    console.log("Database connected (SQLite); migrations applied.");

    // Data-level normalizations that schema sync can't do (e.g. uppercase
    // legacy promotion codes so the unique-index lookup works).
    await runPostInitMigrations();

    await runSeed();
    // SaaS multi-tenancy: ensure the 'legacy' tenant owns every
    // pre-existing row, links admins as owners, and seeds a default
    // weekly payout schedule. Idempotent — skips if already present.
    await ensureLegacyTenant();
    // Always reconcile the settings catalog — adds new options to an
    // already-seeded database without overwriting customised values.
    await ensureSystemSettings();

    const app = createApp();
    app.listen(port, () => {
      console.log(`PrintLoop API listening on http://localhost:${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
    });

    // Periodic local-disk cleanup for expired jobs (no Redis required).
    startRetentionSweep();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();
