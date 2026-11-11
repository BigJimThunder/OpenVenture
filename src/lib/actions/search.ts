"use server";

import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { application, company, doc, meeting, member, memo, pipelineStage } from "@/db/schema";
import { formatRef, parseRef } from "@/lib/refs";
import { requireCtx, roleAtLeast } from "./context";

export type SearchHit = {
  kind: "application" | "memo" | "member" | "meeting" | "doc";
  id: string;
  href: string;
  title: string;
  /** Mono ref (APP-12) or short type label. */
  ref?: string;
  subtitle?: string;
};

/**
 * Global search behind ⌘K. A read, so it is not an authedAction (nothing to
 * audit) — but it is still a public POST endpoint, so it resolves the session
 * and scopes every query to the member's org itself.
 */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  const ctx = await requireCtx("read_only").catch(() => null);
  if (!ctx) return [];
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const orgId = ctx.org.id;
  // Escape LIKE wildcards so "100%" searches for the literal text.
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const ref = parseRef(q);
  const bareNumber = /^\d{1,6}$/.test(q) ? Number(q) : null;

  const [apps, memos, members, meetings, docs] = await Promise.all([
    db
      .select({
        id: application.id,
        ref: application.ref,
        name: company.name,
        oneLiner: company.oneLiner,
        stage: pipelineStage.name,
        applicant: application.applicantName,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          isNull(application.archivedAt),
          or(
            ilike(company.name, like),
            ilike(company.oneLiner, like),
            ilike(company.domain, like),
            ilike(application.applicantName, like),
            ilike(application.applicantEmail, like),
            ilike(application.department, like),
            ref?.kind === "application" ? eq(application.ref, ref.ref) : undefined,
            bareNumber != null ? eq(application.ref, bareNumber) : undefined
          )
        )
      )
      .orderBy(
        // Name matches first, then most recent.
        sql`case when ${company.name} ilike ${like} then 0 else 1 end`,
        desc(application.appliedAt)
      )
      .limit(8),
    db
      .select({ id: memo.id, ref: memo.ref, title: memo.title, status: memo.status })
      .from(memo)
      .where(
        and(
          eq(memo.orgId, orgId),
          or(ilike(memo.title, like), ref?.kind === "memo" ? eq(memo.ref, ref.ref) : undefined)
        )
      )
      .orderBy(desc(memo.updatedAt))
      .limit(5),
    db
      .select({ id: member.id, name: member.displayName, role: member.role, title: member.title })
      .from(member)
      .where(
        and(
          eq(member.orgId, orgId),
          isNull(member.offboardedAt),
          or(ilike(member.displayName, like), ilike(member.email, like))
        )
      )
      .limit(5),
    db
      .select({ id: meeting.id, ref: meeting.ref, title: meeting.title, at: meeting.scheduledAt })
      .from(meeting)
      .where(
        and(
          eq(meeting.orgId, orgId),
          or(ilike(meeting.title, like), ref?.kind === "meeting" ? eq(meeting.ref, ref.ref) : undefined)
        )
      )
      .orderBy(desc(meeting.scheduledAt))
      .limit(4),
    db
      .select({ id: doc.id, slug: doc.slug, title: doc.title, visibility: doc.visibility })
      .from(doc)
      .where(and(eq(doc.orgId, orgId), isNull(doc.archivedAt), ilike(doc.title, like)))
      .limit(4),
  ]);

  const isPartner = roleAtLeast(ctx.member.role, "partner");
  return [
    ...apps.map(
      (a): SearchHit => ({
        kind: "application",
        id: a.id,
        href: `/pipeline/${a.id}`,
        title: a.name,
        ref: formatRef("application", a.ref),
        subtitle: [a.stage, a.applicant, a.oneLiner].filter(Boolean).join(" · "),
      })
    ),
    ...memos.map(
      (m): SearchHit => ({
        kind: "memo",
        id: m.id,
        href: `/memos/${m.id}`,
        title: m.title,
        ref: formatRef("memo", m.ref),
        subtitle: m.status.replace("_", " "),
      })
    ),
    ...members.map(
      (m): SearchHit => ({
        kind: "member",
        id: m.id,
        href: `/members/${m.id}`,
        title: m.name,
        subtitle: [m.title, m.role.replace("_", " ")].filter(Boolean).join(" · "),
      })
    ),
    ...meetings.map(
      (m): SearchHit => ({
        kind: "meeting",
        id: m.id,
        href: `/meetings/${m.id}`,
        title: m.title,
        ref: formatRef("meeting", m.ref),
        subtitle: m.at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      })
    ),
    ...docs
      // Partner-only docs must not leak through search titles.
      .filter(
        (d) =>
          d.visibility === "all" ||
          (d.visibility === "partners" && isPartner) ||
          ctx.member.role === "admin"
      )
      .map(
        (d): SearchHit => ({
          kind: "doc",
          id: d.id,
          href: `/docs/${d.slug}`,
          title: d.title,
          subtitle: "Doc",
        })
      ),
  ];
}
