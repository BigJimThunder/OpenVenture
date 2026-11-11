import { Skeleton } from "@/components/ui/skeleton";

/** The hub's two columns, blank — so the page doesn't jump when the lists load. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2 px-4 pt-5 pb-4 md:px-6 md:pt-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-72 w-full rounded-lg" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
