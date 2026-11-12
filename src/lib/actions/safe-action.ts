import { z } from "zod";
import { db } from "@/db";
import { activity, type MemberRole } from "@/db/schema";
import { requireCtx, AuthError, ForbiddenError, type Ctx } from "./context";
import { reportError } from "@/lib/report-error";

/**
 * authedAction — every mutation in the app flows through this wrapper:
 *   Zod parse → session → role check → org scope → handler → activity log.
 * Server Actions are effectively public POST endpoints; authz lives HERE,
 * inside the action, never only in middleware or layouts.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "auth" | "forbidden" | "validation" | "error" };

/**
 * A deliberate, user-facing failure ("grant would overdraw the pool",
 * "decline reason required"). Its message is shown to the user verbatim;
 * any other thrown error is logged and replaced with a generic message.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

type ActivitySpec = {
  verb: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  summary: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
};

export function authedAction<S extends z.ZodType, T>(opts: {
  input: S;
  minRole?: MemberRole;
  /**
   * May a personal access token (an AI assistant) run this? Off unless said
   * otherwise. Never set it on anything that casts or reveals votes, moves
   * money, emails founders, changes roles, manages tokens, or deletes.
   */
  allowToken?: boolean;
  handler: (input: z.output<S>, ctx: Ctx) => Promise<{ data: T; activity?: ActivitySpec }>;
}) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const parsed = opts.input.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          code: "validation",
          error: parsed.error.issues.map((i) => i.message).join("; "),
        };
      }
      const ctx = await requireCtx(opts.minRole ?? "analyst");
      // Every authedAction is a mutation. A read-scoped access token stops
      // here, and a write token gets no further than the actions that opted in.
      if (ctx.via === "token" && (ctx.tokenScope !== "write" || !opts.allowToken)) {
        throw new ForbiddenError();
      }
      const { data, activity: act } = await opts.handler(parsed.data, ctx);
      if (act) {
        // Structurally impossible to forget the audit log — it's written here.
        // The change itself has already committed, so a failure to record it
        // must not be reported as a failure of the action: the user would
        // retry something that already happened. It is reported loudly instead.
        try {
          await db.insert(activity).values({
            orgId: ctx.org.id,
            actorMemberId: ctx.member.id,
            actorType: "member",
            verb: act.verb,
            entityType: act.entityType,
            entityId: act.entityId,
            entityLabel: act.entityLabel,
            summary: act.summary,
            diff: act.diff,
          });
        } catch (e) {
          reportError("audit", e, { verb: act.verb, entityId: act.entityId, member: ctx.member.id });
        }
      }
      return { ok: true, data };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, code: "auth", error: "Please sign in." };
      if (e instanceof ForbiddenError)
        return { ok: false, code: "forbidden", error: "You don't have permission to do that." };
      if (e instanceof ActionError) return { ok: false, code: "error", error: e.message };
      // A reference the member can quote and an admin can find in the logs.
      const ref = reportError("action", e);
      return { ok: false, code: "error", error: `Something went wrong. If it keeps happening, tell an admin: reference ${ref}.` };
    }
  };
}
