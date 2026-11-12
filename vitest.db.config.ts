import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Database-backed tests: the real server actions against a real Postgres.
 *
 *   TEST_DATABASE_URL=postgresql://… pnpm test:db
 *   OV_TEST_DRIVER=neon pnpm test:db     # same tests through the Neon HTTP code path
 *
 * The database is migrated, then emptied before every test — never point this
 * at a database you care about.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/db/global-setup.ts"],
    setupFiles: ["tests/db/setup.ts"],
    // One database, shared: files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
