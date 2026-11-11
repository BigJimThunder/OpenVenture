import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMemoDetail, getVersionSections } from "@/lib/queries/memos";
import { wordDiff } from "@/lib/diff";
import { isDocEmpty, parseDoc } from "@/lib/rich-text";
import { formatRef } from "@/lib/refs";
import { RichTextView } from "@/components/editor/rich-text-view";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Memo version" };
export const dynamic = "force-dynamic";

export default async function MemoVersionPage({
  params,
}: PageProps<"/memos/[id]/versions/[versionId]">) {
  const ctx = await requireCtx();
  const { id, versionId } = await params;
  const detail = await getMemoDetail(ctx.org.id, id);
  if (!detail) notFound();
  const version = detail.versions.find((v) => v.id === versionId);
  if (!version) notFound();

  const sections = await getVersionSections(ctx.org.id, id, versionId);
  // Diff against the previous version (or nothing for v1).
  const prev = detail.versions.find((v) => v.versionNo === version.versionNo - 1);
  const prevSections = prev ? await getVersionSections(ctx.org.id, id, prev.id) : [];
  const prevByTemplate = new Map(
    prevSections.map((s) => [s.templateSectionId ?? s.title, s.contentText])
  );

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/memos" className="hover:text-fg">
              Memos
            </Link>
            <span aria-hidden>/</span>
            <Link href={`/memos/${id}`} className="font-mono hover:text-fg">
              {formatRef("memo", detail.memo.ref)}
            </Link>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {detail.memo.title}
            <Badge variant="neutral">Version {version.versionNo} · read-only snapshot</Badge>
          </span>
        }
        description={`Circulated ${format(version.createdAt, "MMM d, yyyy 'at' p")}${
          version.createdByName ? ` by ${version.createdByName}` : ""
        }${prev ? `. Green is new since version ${prev.versionNo}; struck-through red was removed.` : ""}`}
        actions={
          <Button variant="secondary" className="max-md:h-10" asChild>
            <Link href={`/memos/${id}`}>
              <ArrowLeftIcon />
              Back to the live memo
            </Link>
          </Button>
        }
      />
      <div className="flex max-w-3xl flex-col gap-3 px-4 md:px-6">
        {sections.map((s) => {
          const prevText = prevByTemplate.get(s.templateSectionId ?? s.title);
          const tokens =
            prev && prevText !== undefined ? wordDiff(prevText, s.contentText) : null;
          return (
            <Card key={s.id} className="p-4 md:p-5">
              <h3 className="mb-2 text-md font-semibold">{s.title}</h3>
              {tokens ? (
                <p className="prose-surface whitespace-pre-wrap">
                  {tokens.map((t, i) =>
                    t.type === "same" ? (
                      <span key={i}>{t.text}</span>
                    ) : t.type === "add" ? (
                      <span key={i} className="rounded-sm bg-success-bg text-success">
                        {t.text}
                      </span>
                    ) : (
                      <span key={i} className="rounded-sm bg-danger-bg text-danger line-through">
                        {t.text}
                      </span>
                    )
                  )}
                </p>
              ) : isDocEmpty(parseDoc(s.contentJson)) ? (
                <p className="prose-surface whitespace-pre-wrap">
                  {s.contentText || <span className="text-fg-subtle">Empty</span>}
                </p>
              ) : (
                <RichTextView value={parseDoc(s.contentJson)} />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
