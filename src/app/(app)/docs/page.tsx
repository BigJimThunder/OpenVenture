import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpenIcon, PinIcon } from "lucide-react";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { doc } from "@/db/schema";
import { requireCtx, roleAtLeast } from "@/lib/actions/context";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { NewDocDialog } from "@/components/docs/new-doc-dialog";

export const metadata: Metadata = { title: "Docs" };
export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const ctx = await requireCtx();
  // Visibility enforced in the query, not the UI.
  const visibilities: ("all" | "partners" | "admins")[] = ["all"];
  if (roleAtLeast(ctx.member.role, "partner")) visibilities.push("partners");
  if (roleAtLeast(ctx.member.role, "admin")) visibilities.push("admins");

  const docs = await db
    .select()
    .from(doc)
    .where(
      and(eq(doc.orgId, ctx.org.id), isNull(doc.archivedAt), inArray(doc.visibility, visibilities))
    )
    .orderBy(desc(doc.isPinned), desc(doc.updatedAt));

  const folders = [...new Set(docs.map((d) => d.folder ?? "General"))];

  return (
    <div className="pb-10">
      <PageHeader
        title="Docs"
        description="The club's internal wiki — thesis, rubrics, how-tos. This is what survives officer turnover."
        actions={<NewDocDialog />}
      />
      <div className="flex flex-col gap-6 px-6">
        {docs.length === 0 ? (
          <EmptyState
            icon={<BookOpenIcon />}
            title="No docs yet"
            description="Start with the club thesis and your screening rubric."
          />
        ) : (
          folders.map((folder) => (
            <section key={folder}>
              <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                {folder}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-panel">
                {docs
                  .filter((d) => (d.folder ?? "General") === folder)
                  .map((d) => (
                    <Link
                      key={d.id}
                      href={`/docs/${d.slug}`}
                      className="flex items-center justify-between border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-bg-subtle/60"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {d.isPinned && <PinIcon className="size-3 text-fg-subtle" />}
                        {d.title}
                      </span>
                      <span className="text-2xs text-fg-subtle">
                        updated {formatDistanceToNow(d.updatedAt, { addSuffix: true })}
                      </span>
                    </Link>
                  ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
