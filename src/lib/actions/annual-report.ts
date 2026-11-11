"use server";

import { z } from "zod";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { coffeeChat, report } from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { roleAtLeast, type Ctx } from "./context";
import { aiConfigured } from "@/lib/ai";
import { draftEssay, draftUnfundedNote } from "@/lib/ai/annual-report";
import { appUrl, emailLayout, escapeHtml, notifyMany, sendEmailSafe, textToHtml } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import { getAnnualDerived, getAnnualMaterials } from "@/lib/queries/annual-report";
import { ensureReport, getReportById, periodKey, type ReportRow } from "@/lib/reports/store";
import {
  DEFAULT_TITLES,
  annualContentSchema,
  annualOpSchema,
  annualProgress,
  annualSummary,
  applyAnnualOps,
  fiscalYearLabel,
  opAllowedForAuthor,
  parseAnnualContent,
  parseAnnualSnapshot,
  syncAnnualContent,
  type AnnualContent,
  type AnnualOp,
} from "@/lib/reports/annual";

const fiscalYearInput = z.coerce.number().int().min(2000).max(2100);
const MAX_CONTENT_BYTES = 900_000;

function fiscalYearOf(row: ReportRow): number {
  return Number(row.periodKey.replace(/^FY/, ""));
}

function paths(fiscalYear: number) {
  revalidatePath("/reports/annual");
  revalidatePath(`/reports/annual/${fiscalYear}`);
  revalidatePath(`/reports/annual/${fiscalYear}/view`);
}

async function loadAnnual(ctx: Ctx, reportId: string): Promise<ReportRow> {
  const row = await getReportById(ctx.org.id, reportId);
  if (!row || row.kind !== "annual" || row.archivedAt) throw new ActionError("That report no longer exists.");
  return row;
}

function label(ctx: Ctx, row: ReportRow) {
  return `Annual report ${fiscalYearLabel(fiscalYearOf(row), ctx.org.fiscalYearStartMonth)}`;
}

/**
 * Write new content only if nobody saved in between (compare-and-swap on
 * updated_at; the HTTP driver has no interactive transactions). Returns null
 * when the row moved or is no longer a draft.
 */
async function writeContent(ctx: Ctx, row: ReportRow, content: AnnualContent) {
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    throw new ActionError("The report is too long to save. Trim an essay or remove a photo.");
  }
  const [saved] = await db
    .update(report)
    .set({ content, updatedByMemberId: ctx.member.id, updatedAt: new Date() })
    .where(
      and(
        eq(report.id, row.id),
        eq(report.status, "draft"),
        // Postgres keeps microseconds, a JS Date only milliseconds.
        sql`date_trunc('milliseconds', ${report.updatedAt}) = ${row.updatedAt.toISOString()}::timestamptz`
      )
    )
    .returning({ updatedAt: report.updatedAt });
  return saved ?? null;
}

/** Start the report for a fiscal year: a complete first draft assembled from the year's data. */
export const startAnnualReport = authedAction({
  minRole: "partner",
  input: z.object({ fiscalYear: fiscalYearInput }),
  handler: async ({ fiscalYear }, ctx) => {
    const derived = await getAnnualDerived(ctx.org, fiscalYear);
    const materials = await getAnnualMaterials(ctx.org.id, ctx.member.id, derived.companies);
    const settings = orgSettings(ctx.org).reports;
    const content = syncAnnualContent(parseAnnualContent({}), derived, {
      materials,
      mission: settings.mission,
      thesis: settings.thesis,
    });
    const title = `Annual report ${derived.label}`;
    const row = await ensureReport({
      orgId: ctx.org.id,
      kind: "annual",
      key: periodKey.annual(fiscalYear),
      title,
      memberId: ctx.member.id,
      content,
    });
    paths(fiscalYear);
    return {
      data: { reportId: row.id },
      activity: {
        verb: "report.started",
        entityType: "report",
        entityId: row.id,
        entityLabel: title,
        summary: `${ctx.member.displayName} started the ${title.toLowerCase()}`,
      },
    };
  },
});

/**
 * Autosave. Partners and admins may change anything; an analyst may only
 * change the spreads they are the author of. No activity row — this fires
 * every few seconds while someone types.
 */
export const saveAnnualReport = authedAction({
  input: z.object({ reportId: z.string().uuid(), ops: z.array(annualOpSchema).min(1).max(200) }),
  handler: async ({ reportId, ops }, ctx) => {
    const everything = roleAtLeast(ctx.member.role, "partner");
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await loadAnnual(ctx, reportId);
      if (row.status !== "draft") {
        throw new ActionError("This report has been finalized. A partner can reopen it for edits.");
      }
      const current = parseAnnualContent(row.content);
      if (!everything && !ops.every((op) => opAllowedForAuthor(op as AnnualOp, current, ctx.member.id))) {
        throw new ActionError("You can edit the company spreads you are the author of. A partner edits the rest.");
      }
      let next: AnnualContent;
      try {
        next = annualContentSchema.parse(applyAnnualOps(current, ops as AnnualOp[]));
      } catch (e) {
        if (e instanceof z.ZodError) throw new ActionError(e.issues[0]?.message ?? "That change isn't valid.");
        throw new ActionError("That part of the report changed underneath you. Reload to see the latest.");
      }
      const saved = await writeContent(ctx, row, next);
      if (saved) return { data: { savedAt: saved.updatedAt.toISOString() } };
    }
    throw new ActionError("Someone else is saving at the same moment. Try again.");
  },
});

/** "Refresh numbers": pull in new members, companies and candidates without touching prose. */
export const refreshAnnualReport = authedAction({
  minRole: "partner",
  input: z.object({ reportId: z.string().uuid() }),
  handler: async ({ reportId }, ctx) => {
    const row = await loadAnnual(ctx, reportId);
    if (row.status !== "draft") throw new ActionError("Reopen the report before refreshing it.");
    const fiscalYear = fiscalYearOf(row);
    const derived = await getAnnualDerived(ctx.org, fiscalYear);
    const before = parseAnnualContent(row.content);
    const fresh = derived.companies.filter((c) => !before.companies.some((x) => x.id === c.companyId));
    const materials = await getAnnualMaterials(ctx.org.id, ctx.member.id, fresh);
    const next = syncAnnualContent(before, derived, { materials });
    if (!(await writeContent(ctx, row, next))) {
      throw new ActionError("Someone saved while we were refreshing. Try again.");
    }
    paths(fiscalYear);
    return {
      data: {
        content: next,
        addedCompanies: next.companies.length - before.companies.length,
        addedMembers: next.team.members.length - before.team.members.length,
      },
    };
  },
});

function aiAvailable(ctx: Ctx) {
  return aiConfigured() && orgSettings(ctx.org).ai.enabled;
}

/** "Draft with AI" for one company essay. Returns text; the client shows it as an unreviewed draft. */
export const draftAnnualEssay = authedAction({
  input: z.object({ reportId: z.string().uuid(), companyId: z.string().uuid() }),
  handler: async ({ reportId, companyId }, ctx) => {
    if (!aiAvailable(ctx)) throw new ActionError("AI drafts are turned off for this club.");
    const row = await loadAnnual(ctx, reportId);
    const content = parseAnnualContent(row.content);
    const entry = content.companies.find((c) => c.id === companyId);
    if (!entry) throw new ActionError("That company is not in this report.");
    if (!roleAtLeast(ctx.member.role, "partner") && entry.authorMemberId !== ctx.member.id) {
      throw new ActionError("Only the essay's author or a partner can draft it.");
    }
    const derived = await getAnnualDerived(ctx.org, fiscalYearOf(row));
    const company = derived.companies.find((c) => c.companyId === companyId);
    if (!company) throw new ActionError("That company is not in this report.");
    const materials = await getAnnualMaterials(ctx.org.id, ctx.member.id, [company]);
    const author = derived.members.find((m) => m.id === entry.authorMemberId);
    const text = await draftEssay({
      orgName: ctx.org.name,
      author: author ? { name: author.name, title: author.title ?? DEFAULT_TITLES[author.role] } : null,
      material: materials[companyId],
    });
    if (!text) throw new ActionError("The draft didn't come back. Try again in a minute.");
    return { data: { text } };
  },
});

export const draftAnnualUnfundedNote = authedAction({
  minRole: "partner",
  input: z.object({ reportId: z.string().uuid(), applicationId: z.string().uuid() }),
  handler: async ({ reportId, applicationId }, ctx) => {
    if (!aiAvailable(ctx)) throw new ActionError("AI drafts are turned off for this club.");
    const row = await loadAnnual(ctx, reportId);
    const derived = await getAnnualDerived(ctx.org, fiscalYearOf(row));
    const candidate = derived.unfunded.find((u) => u.applicationId === applicationId);
    if (!candidate) throw new ActionError("That application is not a candidate for this report.");
    const chats = await db
      .select({ debrief: coffeeChat.debrief })
      .from(coffeeChat)
      .where(
        and(
          eq(coffeeChat.orgId, ctx.org.id),
          eq(coffeeChat.applicationId, applicationId),
          isNotNull(coffeeChat.debrief)
        )
      );
    const text = await draftUnfundedNote({
      name: candidate.name,
      oneLiner: candidate.oneLiner,
      founders: candidate.founders,
      debriefs: chats.map((c) => c.debrief!).filter((d) => d.trim()),
    });
    if (!text) throw new ActionError("The draft didn't come back. Try again in a minute.");
    return { data: { text } };
  },
});

/** Freeze the year's numbers into the snapshot and lock the content. */
export const finalizeAnnualReport = authedAction({
  minRole: "partner",
  input: z.object({ reportId: z.string().uuid() }),
  handler: async ({ reportId }, ctx) => {
    const row = await loadAnnual(ctx, reportId);
    if (row.status !== "draft") throw new ActionError("This report is already final.");
    const fiscalYear = fiscalYearOf(row);
    const derived = await getAnnualDerived(ctx.org, fiscalYear);
    const { missing } = annualProgress(parseAnnualContent(row.content), derived);
    const [saved] = await db
      .update(report)
      .set({
        status: "final",
        snapshot: { derived },
        finalizedAt: new Date(),
        finalizedByMemberId: ctx.member.id,
        updatedAt: new Date(),
      })
      .where(and(eq(report.id, row.id), eq(report.status, "draft")))
      .returning({ id: report.id });
    if (!saved) throw new ActionError("This report is already final.");
    paths(fiscalYear);
    return {
      data: { ok: true },
      activity: {
        verb: "report.finalized",
        entityType: "report",
        entityId: row.id,
        entityLabel: label(ctx, row),
        summary: `${ctx.member.displayName} finalized the ${label(ctx, row).toLowerCase()}${
          missing.length > 0 ? ` with ${missing.length} open items` : ""
        }`,
      },
    };
  },
});

/** Back to a draft. The numbers go live again; the record of who it was sent to stays. */
export const reopenAnnualReport = authedAction({
  minRole: "partner",
  input: z.object({ reportId: z.string().uuid() }),
  handler: async ({ reportId }, ctx) => {
    const row = await loadAnnual(ctx, reportId);
    if (row.status === "draft") throw new ActionError("This report is already a draft.");
    await db
      .update(report)
      .set({ status: "draft", snapshot: null, finalizedAt: null, finalizedByMemberId: null, updatedAt: new Date() })
      .where(eq(report.id, row.id));
    paths(fiscalYearOf(row));
    return {
      data: { ok: true },
      activity: {
        verb: "report.reopened",
        entityType: "report",
        entityId: row.id,
        entityLabel: label(ctx, row),
        summary: `${ctx.member.displayName} reopened the ${label(ctx, row).toLowerCase()} for edits`,
      },
    };
  },
});

function recipients(raw: string): string[] {
  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return [...new Set(emails)];
}

/** Email the club's supporters a link and a short summary. Only a final report can go out. */
export const sendAnnualReport = authedAction({
  minRole: "partner",
  input: z.object({ reportId: z.string().uuid(), note: z.string().max(2000).default("") }),
  handler: async ({ reportId, note }, ctx) => {
    const row = await loadAnnual(ctx, reportId);
    if (row.status === "draft") throw new ActionError("Finalize the report before sending it.");
    const to = recipients(orgSettings(ctx.org).reports.lpEmails);
    if (to.length === 0) {
      throw new ActionError("No supporter emails are set. An admin adds them in Settings, under Reports.");
    }
    const fiscalYear = fiscalYearOf(row);
    const derived = parseAnnualSnapshot(row.snapshot);
    if (!derived) throw new ActionError("This report has no frozen numbers. Reopen and finalize it again.");
    const summary = annualSummary(parseAnnualContent(row.content), derived);
    const title = label(ctx, row);
    const html = emailLayout({
      orgName: ctx.org.name,
      heading: `${ctx.org.name}: ${title.toLowerCase()}`,
      bodyHtml: `${note.trim() ? textToHtml(note) : ""}${textToHtml(summary)}<p style="margin:0;font-size:13px;line-height:1.6;color:#52525b">${escapeHtml(
        `Sent by ${ctx.member.displayName} on behalf of ${ctx.org.name}.`
      )}</p>`,
      cta: { label: "Read the report", url: appUrl(`/reports/annual/${fiscalYear}/view`) },
      footer: `You are receiving this because ${ctx.org.name} lists you as a supporter.`,
    });

    const delivered: string[] = [];
    await notifyMany(
      to.map((email) => async () => {
        const ok = await sendEmailSafe({
          to: email,
          subject: `${ctx.org.name} — ${title}`,
          html,
          replyTo: ctx.member.email,
        });
        if (ok) delivered.push(email);
      })
    );
    if (delivered.length === 0) throw new ActionError("None of the emails went out. Check the email settings.");

    await db
      .update(report)
      .set({ status: "sent", sentAt: new Date(), sentTo: delivered, updatedAt: new Date() })
      .where(eq(report.id, row.id));
    paths(fiscalYear);
    return {
      data: { sent: delivered.length, failed: to.length - delivered.length },
      activity: {
        verb: "report.sent",
        entityType: "report",
        entityId: row.id,
        entityLabel: title,
        summary: `${ctx.member.displayName} sent the ${title.toLowerCase()} to ${delivered.length} ${
          delivered.length === 1 ? "supporter" : "supporters"
        }`,
      },
    };
  },
});
