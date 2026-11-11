import { and, asc, eq, isNull } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  actionItem,
  application,
  company,
  meeting,
  member,
  memo,
  pipelineStage,
  screeningCriterion,
} from "@/db/schema";
import { appUrl } from "@/lib/notify";
import { parseRef, type RefKind } from "@/lib/refs";

/**
 * Turning what an assistant says ("APP-12", "Coffee Chat", "me") into rows,
 * always inside one org. Every failure is a ToolError whose message tells the
 * model how to recover.
 */

/** A failure the calling model should read and act on. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Lookup = { id: string } | { ref: number };

function parseLookup(input: string, kind: RefKind, label: string): Lookup {
  if (UUID.test(input)) return { id: input };
  const parsed = parseRef(input);
  if (parsed?.kind === kind) return { ref: parsed.ref };
  if (/^\d{1,6}$/.test(input)) return { ref: Number(input) };
  throw new ToolError(`"${input}" is not ${label}. Use the search tool to find it.`);
}

export async function resolveApplication(orgId: string, input: string) {
  const lookup = parseLookup(input, "application", "an application ref (like APP-12) or id");
  const [row] = await db
    .select({
      id: application.id,
      ref: application.ref,
      companyId: application.companyId,
      companyName: company.name,
    })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .where(
      and(
        eq(application.orgId, orgId),
        "id" in lookup ? eq(application.id, lookup.id) : eq(application.ref, lookup.ref)
      )
    )
    .limit(1);
  if (!row) throw new ToolError(`No application ${input} in this club. Use the search tool to find it.`);
  return row;
}

export async function resolveMemo(orgId: string, input: string) {
  const lookup = parseLookup(input, "memo", "a memo ref (like MEM-4) or id");
  const [row] = await db
    .select({ id: memo.id, ref: memo.ref })
    .from(memo)
    .where(and(eq(memo.orgId, orgId), "id" in lookup ? eq(memo.id, lookup.id) : eq(memo.ref, lookup.ref)))
    .limit(1);
  if (!row) throw new ToolError(`No memo ${input} in this club. Use list_memos to find it.`);
  return row;
}

export async function resolveMeeting(orgId: string, input: string) {
  const lookup = parseLookup(input, "meeting", "a meeting ref (like MTG-7) or id");
  const [row] = await db
    .select({ id: meeting.id, ref: meeting.ref })
    .from(meeting)
    .where(
      and(eq(meeting.orgId, orgId), "id" in lookup ? eq(meeting.id, lookup.id) : eq(meeting.ref, lookup.ref))
    )
    .limit(1);
  if (!row) throw new ToolError(`No meeting ${input} in this club. Use list_meetings to find it.`);
  return row;
}

export async function resolveActionItem(orgId: string, input: string) {
  const lookup = parseLookup(input, "actionItem", "an action item ref (like TSK-9) or id");
  const [row] = await db
    .select({ id: actionItem.id, ref: actionItem.ref, title: actionItem.title })
    .from(actionItem)
    .where(
      and(
        eq(actionItem.orgId, orgId),
        "id" in lookup ? eq(actionItem.id, lookup.id) : eq(actionItem.ref, lookup.ref)
      )
    )
    .limit(1);
  if (!row) throw new ToolError(`No action item ${input} in this club. Use list_action_items to find it.`);
  return row;
}

export async function liveStages(orgId: string) {
  return db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      slug: pipelineStage.slug,
      kind: pipelineStage.kind,
      slaDays: pipelineStage.slaDays,
    })
    .from(pipelineStage)
    .where(and(eq(pipelineStage.orgId, orgId), isNull(pipelineStage.archivedAt)))
    .orderBy(asc(pipelineStage.position));
}

export async function resolveStage(orgId: string, input: string) {
  const stages = await liveStages(orgId);
  const wanted = input.trim().toLowerCase();
  const stage = stages.find(
    (s) => s.id === input || s.slug.toLowerCase() === wanted || s.name.toLowerCase() === wanted
  );
  if (!stage) {
    throw new ToolError(`No stage called "${input}". The stages are: ${stages.map((s) => s.name).join(", ")}.`);
  }
  return stage;
}

/** An active member of this org — the only people a token may assign work or send email to. */
export async function resolveActiveMember(orgId: string, memberId: string) {
  const [row] = await db
    .select({ id: member.id, displayName: member.displayName, email: member.email, role: member.role })
    .from(member)
    .where(
      and(
        eq(member.orgId, orgId),
        eq(member.id, memberId),
        eq(member.status, "active"),
        isNull(member.offboardedAt)
      )
    )
    .limit(1);
  if (!row) throw new ToolError("That is not an active member of this club. Use get_club for member ids.");
  return row;
}

export async function liveCriteria(orgId: string) {
  return db
    .select({ id: screeningCriterion.id, label: screeningCriterion.label, description: screeningCriterion.description })
    .from(screeningCriterion)
    .where(and(eq(screeningCriterion.orgId, orgId), isNull(screeningCriterion.archivedAt)))
    .orderBy(asc(screeningCriterion.position));
}

// ——— Output formatting shared by every tool ———

/** Money leaves as a two-decimal string, never a float. */
export function money(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  try {
    return new Decimal(value).toFixed(2);
  } catch {
    return null;
  }
}

export function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const urls = {
  application: (id: string) => appUrl(`/pipeline/${id}`),
  memo: (id: string) => appUrl(`/memos/${id}`),
  vote: (memoId: string | null) => appUrl(memoId ? `/memos/${memoId}/vote` : "/memos"),
  meeting: (id: string) => appUrl(`/meetings/${id}`),
  member: (id: string) => appUrl(`/members/${id}`),
};
