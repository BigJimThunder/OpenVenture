import { Skeleton } from "@/components/ui/skeleton";

/** The letter's sheet, blank — so the page doesn't jump when the quarter loads. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2 px-4 pt-5 pb-4 md:px-6 md:pt-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="px-3 md:px-6">
        <div className="mx-auto flex max-w-[46rem] flex-col gap-4 rounded-lg border border-border bg-panel px-5 py-8 sm:px-10 sm:py-12 md:px-14">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-6 h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
