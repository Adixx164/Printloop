import { defineConfig } from 'vitest/config';

/**
 * Vitest config (V2-25). The unit layer covers PURE logic — money
 * math, crypto — that needs neither a DB nor a running server, so it
 * runs in milliseconds in CI. DB/HTTP-bound checks stay in the
 * `scripts/e2e*.cjs` integration layer (they need a live backend).
 *
 * Tests live next to the code as `*.test.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // The TypeORM entity files use decorators that need
    // reflect-metadata; the pure modules under test don't import
    // them, so no global setup is required here.
    globals: false,
    // DB-bound test files each point DATABASE_FILE at their own
    // sqlite (vi.hoisted before imports). Serialising files keeps
    // their boot-time migration writes from ever hitting SQLITE_BUSY
    // against a shared file.
    fileParallelism: false,
  },
});
