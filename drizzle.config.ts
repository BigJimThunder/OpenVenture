import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Schema tooling prefers a direct (non-pooled) URL; the app uses the pooled
    // one. Deploys don't use this file at all — scripts/migrate.mjs applies the
    // SQL in ./drizzle during the build.
    url:
      process.env.DATABASE_URL_DIRECT ??
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "",
  },
  casing: "snake_case",
});
