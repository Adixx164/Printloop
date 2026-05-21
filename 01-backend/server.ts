import "reflect-metadata";
import { createApp } from "./app.js";
import { AppDataSource } from "./config/database.js";
import { runSeed } from "./config/seed.js";
import { ensureSystemSettings } from "./config/settings.js";

const port = Number(process.env.PORT || 4000);

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected (SQLite) & schema synchronized.");

    await runSeed();
    // Always reconcile the settings catalog — adds new options to an
    // already-seeded database without overwriting customised values.
    await ensureSystemSettings();

    const app = createApp();
    app.listen(port, () => {
      console.log(`PrintLoop API listening on http://localhost:${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();
