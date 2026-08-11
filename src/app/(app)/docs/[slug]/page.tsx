import { notFound } from "next/navigation";
import { format } from "date-fns";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { doc } from "@/db/schema";
import { requireCtx, roleAtLeast } from "@/lib/actions/context";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { DocEditor } from "@/components/docs/doc-editor";

export const dynamic = "force-dynamic";

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const ctx = await requireCtx();
  const { slug } = await params;
  const visibilities: ("all" | "partners" | "admins")[] = ["all"];
  if (roleAtLeast(ctx.member.role, "partner")) visibilities.push("partners");
  if (roleAtLeast(ctx.member.role, "admin")) visibilities.push("admins");

  const [d] = await db
    .select()
    .from(doc)
    .where(
      and(
        eq(doc.orgId, ctx.org.id),
        eq(doc.slug, slug),
        isNull(doc.archivedAt),
        inArray(doc.visibility, visibilities)
      )
    )
    .limit(1);
  if (!d) notFound();

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {d.title}
            {d.visibility !== "all" && <Badge variant="neutral">{d.visibility} only</Badge>}
          </span>
        }
        description={`Updated ${format(d.updatedAt, "MMM d, yyyy")} · edits autosave`}
      />
      <div className="max-w-3xl px-6">
        <DocEditor
          docId={d.id}
          initialContent={d.contentJson ? JSON.parse(d.contentJson) : null}
          editable={ctx.member.role !== "read_only"}
        />
      </div>
    </div>
  );
}
