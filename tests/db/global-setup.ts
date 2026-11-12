import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a disposable Postgres database — these tests empty it."
    );
  }
  if (/neon\.tech|supabase|amazonaws|render\.com/.test(url) && process.env.OV_TEST_ALLOW_REMOTE !== "1") {
    throw new Error("TEST_DATABASE_URL looks like a hosted database. Refusing to empty it.");
  }
  execFileSync("node", [path.resolve(__dirname, "../../scripts/migrate.mjs")], {
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_DIRECT: "", DATABASE_URL_UNPOOLED: "", SKIP_DB_MIGRATE: "" },
    stdio: "pipe",
  });
}
