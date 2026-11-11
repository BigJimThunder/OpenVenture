import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpenIcon, ChevronRightIcon, LockIcon, PinIcon } from "lucide-react";
import { and, eq, isNull, isNotNull, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { doc, member, type DocVisibility } from "@/db/schema";
import { requireCtx, roleAtLeast } from "@/lib/actions/context";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { NewDocDialog } from "@/components/docs/new-doc-dialog";
import { ArchivedDocs } from "@/components/docs/archived-docs";
import { VISIBILITY_BADGE } from "@/components/docs/doc-labels";

export const metadata: Metadata = { title: "Docs" };
export const dynamic = "force-dynamic";

const GENERAL = "General";

export default async function DocsPage() {
  const ctx = await requireCtx();
  // Visibility enforced in the query, not the UI.
  const visibilities: DocVisibility[] = ["all"];
  if (roleAtLeast(ctx.member.role, "partner")) visibilities.push("partners");
  if (roleAtLeast(ctx.member.role, "admin")) visibilities.push("admins");

  const docs = await db
    .select({
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      folder: doc.folder,
      visibility: doc.visibility,
      isPinned: doc.isPinned,
      updatedAt: doc.updatedAt,
      contentText: doc.contentText,
      updatedByName: member.displayName,
    })
    .from(doc)
    .leftJoin(member, eq(doc.updatedByMemberId, member.id))
    .where(
      and(eq(doc.orgId, ctx.org.id), isNull(doc.archivedAt), inArray(doc.visibility, visibilities))
    )
    .orderBy(desc(doc.isPinned), desc(doc.updatedAt));

  const archived = roleAtLeast(ctx.member.role, "partner")
    ? await db
        .select({ id: doc.id, title: doc.title, folder: doc.folder })
        .from(doc)
        .where(
          and(eq(doc.orgId, ctx.org.id), isNotNull(doc.archivedAt), inArray(doc.visibility, visibilities))
        )
        .orderBy(desc(doc.archivedAt))
    : [];

  const namedFolders = [...new Set(docs.map((d) => d.folder).filter((f): f is string => !!f))].sort();
  // General first, then the rest alphabetically — stable, so the list doesn't reshuffle on every edit.
  const folders = [GENERAL, ...namedFolders.filter((f) => f !== GENERAL)].filter((f) =>
    docs.some((d) => (d.folder ?? GENERAL) === f)
  );

  return (
    <div className="pb-10">
      <PageHeader
        title="Docs"
        description="The club's handbook: the thesis, the rubric, how things are done. This is what survives when the officers graduate."
        actions={docs.length > 0 ? <NewDocDialog folders={namedFolders} /> : undefined}
      />
      <div className="flex max-w-4xl flex-col gap-6 px-4 md:px-6">
        {docs.length === 0 ? (
          <EmptyState
            icon={<BookOpenIcon />}
            title="No docs yet"
            description="Anything the next set of officers would otherwise have to ask you belongs here. Three docs cover most of it:"
            steps={[
              "The thesis — what the club funds, what it doesn't, and the size of a typical grant.",
              "The screening rubric — what a 1 and a 5 mean for each criterion, so scores are comparable.",
              "The handover — bank access, the money calendar, who to email at the university.",
            ]}
            action={<NewDocDialog folders={[]} label="Write the first doc" />}
          />
        ) : (
          folders.map((folder) => (
            <section key={folder} aria-labelledby={`folder-${folder}`}>
              <h2 id={`folder-${folder}`} className="mb-2 text-xs font-medium text-fg-muted">
                {folder}
              </h2>
              <ul className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
                {docs
                  .filter((d) => (d.folder ?? GENERAL) === folder)
                  .map((d) => {
                    const audience = VISIBILITY_BADGE[d.visibility];
                    const excerpt = d.contentText.replace(/\s+/g, " ").trim().slice(0, 240);
                    return (
                      <li key={d.id}>
                        <Link
                          href={`/docs/${d.slug}`}
                          className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-bg-subtle/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              {d.isPinned && <PinIcon className="size-3.5 shrink-0 text-fg-subtle" aria-label="Pinned" />}
                              <span className="text-sm font-medium">{d.title}</span>
                              {audience && (
                                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                                  <LockIcon className="size-3" />
                                  {audience}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-fg-muted">
                              {excerpt || <span className="text-fg-subtle">Empty — nothing written yet</span>}
                            </p>
                            <p className="mt-0.5 text-xs text-fg-subtle">
                              Edited {formatDistanceToNow(d.updatedAt, { addSuffix: true })}
                              {d.updatedByName ? ` by ${d.updatedByName}` : ""}
                            </p>
                          </div>
                          <ChevronRightIcon className="size-4 shrink-0 text-fg-subtle" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
        )}
        {archived.length > 0 && <ArchivedDocs docs={archived} />}
      </div>
    </div>
  );
}
