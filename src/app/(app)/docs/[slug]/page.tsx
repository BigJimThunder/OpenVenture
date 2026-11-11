import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { PinIcon } from "lucide-react";
import { db } from "@/db";
import { doc, member, type DocVisibility } from "@/db/schema";
import { requireCtx, roleAtLeast } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { DocEditor } from "@/components/docs/doc-editor";
import { DocActions } from "@/components/docs/doc-actions";
import { VISIBILITY_BADGE } from "@/components/docs/doc-labels";

export const metadata: Metadata = { title: "Doc" };
export const dynamic = "force-dynamic";

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const ctx = await requireCtx();
  const { slug } = await params;
  // Visibility is enforced in the query, not the UI.
  const visibilities: DocVisibility[] = ["all"];
  if (roleAtLeast(ctx.member.role, "partner")) visibilities.push("partners");
  if (roleAtLeast(ctx.member.role, "admin")) visibilities.push("admins");
  const visible = and(
    eq(doc.orgId, ctx.org.id),
    isNull(doc.archivedAt),
    inArray(doc.visibility, visibilities)
  );

  const [[row], folderRows] = await Promise.all([
    db
      .select({ doc, updatedByName: member.displayName })
      .from(doc)
      .leftJoin(member, eq(doc.updatedByMemberId, member.id))
      .where(and(visible, eq(doc.slug, slug)))
      .limit(1),
    db.selectDistinct({ folder: doc.folder }).from(doc).where(visible),
  ]);
  if (!row) notFound();
  const d = row.doc;
  const canWrite = can(ctx.member.role, "contribute");
  const audience = VISIBILITY_BADGE[d.visibility];

  return (
    <div className="pb-10">
      <PageHeader
        className="print:hidden"
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/docs" className="hover:text-fg">
              Docs
            </Link>
            <span aria-hidden>/</span>
            <span>{d.folder ?? "General"}</span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {d.isPinned && <PinIcon className="size-4 text-fg-subtle" aria-label="Pinned" />}
            {d.title}
            {audience && <Badge variant="neutral">{audience}</Badge>}
          </span>
        }
        description={`Last edited ${format(d.updatedAt, "MMM d, yyyy")}${row.updatedByName ? ` by ${row.updatedByName}` : ""}${canWrite ? "" : " · You have read-only access"}`}
        actions={
          <DocActions
            doc={{ id: d.id, title: d.title, folder: d.folder, visibility: d.visibility }}
            pinned={d.isPinned}
            createdByMemberId={d.createdByMemberId}
            folders={folderRows.map((f) => f.folder).filter((f): f is string => !!f)}
          />
        }
      />
      <h1 className="hidden px-4 pb-4 text-xl font-semibold print:block">{d.title}</h1>
      <div className="max-w-3xl px-4 md:px-6">
        <DocEditor
          docId={d.id}
          initialContent={d.contentJson ? JSON.parse(d.contentJson) : null}
          editable={canWrite}
          bleed
        />
      </div>
    </div>
  );
}
