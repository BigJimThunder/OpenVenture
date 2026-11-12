import { afterAll, beforeEach, vi } from "vitest";
import { actor, deferred, outbox } from "./world";

/**
 * The seams between the app's server code and the outside world, replaced:
 * the database handle, the session, request headers, the Next cache and
 * `after()`, and outbound email. Everything else — actions, the action
 * wrapper, role checks, queries, SQL — is the real code.
 */

vi.mock("@/db", async () => {
  const { testDb } = await import("./db");
  const schema = await import("../../src/db/schema");
  return { db: testDb, schema };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => {
        const who = actor();
        return who?.user ? { user: who.user, session: { id: "test-session" } } : null;
      },
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(actor()?.headers ?? {}),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: (() => unknown) | Promise<unknown>) => {
    deferred.push(typeof task === "function" ? Promise.resolve().then(task) : task);
  },
}));

vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("../../src/lib/email")>()),
  sendEmail: async (mail: { to: string; subject: string; html: string }) => {
    outbox.push(mail);
  },
}));

beforeEach(async () => {
  const { resetDatabase } = await import("./db");
  await Promise.allSettled(deferred.splice(0));
  outbox.length = 0;
  await resetDatabase();
});

afterAll(async () => {
  const { pool } = await import("./db");
  await Promise.allSettled(deferred.splice(0));
  await pool.end();
});
