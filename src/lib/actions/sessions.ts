"use server";

import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { session } from "@/db/schema";
import { auth } from "@/lib/auth";
import { ActionError, authedAction } from "./safe-action";

/**
 * Sign this person out everywhere except the browser they are using now.
 * For a lost phone or a library computer nobody signed out of. Sessions are
 * rows in the database, so deleting them takes effect on the next request.
 */
export const signOutOtherDevices = authedAction({
  minRole: "read_only",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const current = await auth.api.getSession({ headers: await headers() });
    if (!current?.session || !ctx.userId) throw new ActionError("Sign in again to manage your devices.");
    const removed = await db
      .delete(session)
      .where(and(eq(session.userId, ctx.userId), ne(session.id, current.session.id)))
      .returning({ id: session.id });
    revalidatePath(`/members/${ctx.member.id}`);
    return {
      data: { signedOut: removed.length },
      activity: {
        verb: "member.sessions_revoked",
        entityType: "member",
        entityId: ctx.member.id,
        entityLabel: ctx.member.displayName,
        summary: `${ctx.member.displayName} signed out of ${removed.length} other ${removed.length === 1 ? "device" : "devices"}`,
      },
    };
  },
});
