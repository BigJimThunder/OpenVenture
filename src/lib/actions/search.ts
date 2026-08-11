"use server";

import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  company,
  pipelineStage,
  memo,
  member,
  meeting,
  doc,
  type DocVisibility,
} from "@/db/schema";
import { authedAction } from "./safe-action";
import { roleAtLeast } from "./context";

export type PaletteHit = {
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
  /** Categorical token for the wayfinding dot (stages only). */
  colorToken: string | null;
};

export type PaletteResults = {
  applications: PaletteHit[];
  memos: PaletteHit[];
  members: PaletteHit[];
  meetings: PaletteHit[];
  docs: PaletteHit[];
};

const LIMIT = 5;

/** Read-only lookup behind the ⌘K palette. No activity log — searching isn't an event. */
export const paletteSearch = authedAction({
  minRole: "read_only",
  input: z.object({ q: z.string().min(1).max(80) }),
  handler: async ({ q }, ctx) => {
    // Escape LIKE metacharacters so "100%" searches literally.
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

    const visibleDocs: DocVisibility[] = roleAtLeast(ctx.member.role, "admin")
      ? ["all", "partners", "admins"]
      : roleAtLeast(ctx.member.role, "partner")
        ? ["all", "partners"]
        : ["all"];

    const [apps, memos, members, meetings, docs] = await Promise.all([
      db
        .select({
          id: application.id,
          name: company.name,
          oneLiner: company.oneLiner,
          applicantName: application.applicantName,
          stageName: pipelineStage.name,
          stageColor: pipelineStage.colorToken,
        })
        .from(application)
        .innerJoin(company, eq(application.companyId, company.id))
        .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
        .where(
          and(
            eq(application.orgId, ctx.org.id),
            isNull(application.archivedAt),
            or(
              ilike(company.name, like),
              ilike(company.oneLiner, like),
              ilike(application.applicantName, like)
            )
          )
        )
        .orderBy(desc(application.appliedAt))
        .limit(LIMIT),
      db
        .select({ id: memo.id, title: memo.title, status: memo.status })
        .from(memo)
        .where(and(eq(memo.orgId, ctx.org.id), ilike(memo.title, like)))
        .orderBy(desc(memo.updatedAt))
        .limit(LIMIT),
      db
        .select({ id: member.id, name: member.displayName, role: member.role })
        .from(member)
        .where(
          and(
            eq(member.orgId, ctx.org.id),
            isNull(member.offboardedAt),
            or(ilike(member.displayName, like), ilike(member.email, like))
          )
        )
        .orderBy(asc(member.displayName))
        .limit(LIMIT),
      db
        .select({ id: meeting.id, title: meeting.title, scheduledAt: meeting.scheduledAt })
        .from(meeting)
        .where(and(eq(meeting.orgId, ctx.org.id), ilike(meeting.title, like)))
        .orderBy(desc(meeting.scheduledAt))
        .limit(LIMIT),
      db
        .select({ id: doc.id, title: doc.title, slug: doc.slug, folder: doc.folder })
        .from(doc)
        .where(
          and(
            eq(doc.orgId, ctx.org.id),
            isNull(doc.archivedAt),
            inArray(doc.visibility, visibleDocs),
            ilike(doc.title, like)
          )
        )
        .orderBy(desc(doc.updatedAt))
        .limit(LIMIT),
    ]);

    const data: PaletteResults = {
      applications: apps.map((a) => ({
        id: a.id,
        label: a.name,
        sublabel: a.stageName + (a.oneLiner ? ` · ${a.oneLiner}` : ""),
        href: `/applications/${a.id}`,
        colorToken: a.stageColor,
      })),
      memos: memos.map((m) => ({
        id: m.id,
        label: m.title,
        sublabel: m.status,
        href: `/memos/${m.id}`,
        colorToken: null,
      })),
      members: members.map((m) => ({
        id: m.id,
        label: m.name,
        sublabel: m.role.replace("_", " "),
        href: `/members/${m.id}`,
        colorToken: null,
      })),
      meetings: meetings.map((m) => ({
        id: m.id,
        label: m.title,
        sublabel: m.scheduledAt.toISOString().slice(0, 10),
        href: `/meetings/${m.id}`,
        colorToken: null,
      })),
      docs: docs.map((d) => ({
        id: d.id,
        label: d.title,
        sublabel: d.folder,
        href: `/docs/${d.slug}`,
        colorToken: null,
      })),
    };

    return { data };
  },
});
