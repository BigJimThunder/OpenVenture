import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-bg-subtle text-fg-muted">
        <CompassIcon className="size-5" />
      </span>
      <div>
        <h1 className="text-md font-semibold">We couldn&apos;t find that</h1>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">
          The link may be old, or the record may have been archived. Search with ⌘K, or head back.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/inbox">Back to inbox</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/pipeline">Open the pipeline</Link>
        </Button>
      </div>
    </div>
  );
}
