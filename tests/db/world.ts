import { AsyncLocalStorage } from "node:async_hooks";

/** Who the current call is acting as. Scoped per async call chain, so two
 *  actors can run concurrently in one test. */
export type Actor = {
  user?: { id: string; email: string; name?: string };
  headers?: Record<string, string>;
};

const current = new AsyncLocalStorage<Actor>();
export const actor = () => current.getStore();

export function actAs<T>(who: Actor, run: () => Promise<T>): Promise<T> {
  return current.run(who, run);
}

/** Work handed to `after()`. */
export const deferred: Promise<unknown>[] = [];
export async function settleDeferred() {
  await Promise.allSettled(deferred.splice(0));
}

/** Every email the code under test tried to send. */
export const outbox: { to: string; subject: string; html: string }[] = [];
