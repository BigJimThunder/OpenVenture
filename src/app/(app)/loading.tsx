import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside the shell while a screen's data loads — the sidebar never blinks. */
export default function Loading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4 md:px-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex flex-col gap-3 p-4 md:p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9" style={{ opacity: 1 - i * 0.1 }} />
        ))}
      </div>
    </div>
  );
}
