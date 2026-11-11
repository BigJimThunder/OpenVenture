import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rendered by a page when the signed-in member's role can't open it. Pages
 * return this instead of throwing, so a curious analyst clicking "Settings"
 * gets an explanation rather than an error screen.
 */
export function NoAccess({
  title = "This area is for admins",
  description = "Your role can't open this screen. If you need something changed here, ask one of the club's admins.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-bg-subtle text-fg-muted">
        <LockIcon className="size-5" />
      </span>
      <div>
        <h1 className="text-md font-semibold">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      </div>
      <Button variant="secondary" asChild>
        <Link href="/members">See who the admins are</Link>
      </Button>
    </div>
  );
}
