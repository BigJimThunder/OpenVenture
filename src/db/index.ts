import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Neon HTTP driver in production/preview (no TCP handshake, no pool to
 * exhaust on serverless). node-postgres for local dev against any Postgres.
 * Always use the POOLED (-pooler) Neon URL here; the direct URL is only for
 * drizzle-kit migrations (see drizzle.config.ts).
 */

const url = process.env.DATABASE_URL;

function createDb() {
  if (!url) {
    // Deferred failure: lets `next build` succeed without a DATABASE_URL.
    return new Proxy({} as ReturnType<typeof drizzleNeon<typeof schema>>, {
      get() {
        throw new Error("DATABASE_URL is not set");
      },
    });
  }
  const isNeon = url.includes("neon.tech");
  if (isNeon) {
    return drizzleNeon(neon(url), { schema });
  }
  return drizzlePg(url, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
}

// Module-scope singleton — never construct a client per request.
export const db = createDb();
export { schema };
