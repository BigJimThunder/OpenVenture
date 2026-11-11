import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for document-style pages (PageHeader + content): the
 * same header block, a summary band and a table-shaped body, so the page
 * doesn't jump when the data lands. Screen-style pages use the shell default.
 */
export function PageSkeleton({ rows = 6, summary = true }: { rows?: number; summary?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2 px-4 pt-5 pb-4 md:px-6 md:pt-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-3 px-4 md:px-6">
        {summary && <Skeleton className="h-24 rounded-lg" />}
        <div className="overflow-hidden rounded-lg border border-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-4 border-b border-border px-3.5 last:border-0">
              <Skeleton className="h-3.5 w-1/4" style={{ opacity: 1 - i * 0.12 }} />
              <Skeleton className="h-3.5 w-1/6" style={{ opacity: 1 - i * 0.12 }} />
              <Skeleton className="ml-auto h-3.5 w-16" style={{ opacity: 1 - i * 0.12 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
