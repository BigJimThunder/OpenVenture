"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { updateApplicationFacts } from "@/lib/actions/applications";
import { APPLICATION_PRIORITIES, type ApplicationPriority } from "@/db/schema";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Kbd } from "@/components/patterns/kbd";
import { PriorityGlyph, PRIORITY_LABELS } from "@/components/patterns/priority-glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The number key that sets each priority while a card is selected. */
export const PRIORITY_KEYS: Record<string, ApplicationPriority> = {
  "1": "urgent",
  "2": "high",
  "3": "medium",
  "4": "low",
  "0": "none",
};
const KEY_FOR = Object.fromEntries(
  Object.entries(PRIORITY_KEYS).map(([k, p]) => [p, k])
) as Record<ApplicationPriority, string>;

export async function savePriority(applicationId: string, priority: ApplicationPriority) {
  const res = await updateApplicationFacts({ applicationId, priority });
  if (!res.ok) toast.error(res.error);
  return res.ok;
}

/**
 * Priority as a one-tap control: tap the glyph, tap a level. Read-only
 * members get the glyph and label with no menu.
 */
export function PriorityPicker({
  applicationId,
  priority,
  showLabel = true,
  showKeys = false,
  className,
}: {
  applicationId: string;
  priority: ApplicationPriority;
  showLabel?: boolean;
  /** Show the 1–4 / 0 hints — only where the board's key handler is live. */
  showKeys?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");
  const [optimistic, setOptimistic] = React.useState<ApplicationPriority | null>(null);
  const current = optimistic ?? priority;

  // Drop the optimistic value once the server agrees (adjust-during-render).
  const [seen, setSeen] = React.useState(priority);
  if (seen !== priority) {
    setSeen(priority);
    setOptimistic(null);
  }

  const face = (
    <>
      <PriorityGlyph priority={current} />
      {showLabel && <span className={cn(current === "none" && "text-fg-subtle")}>{PRIORITY_LABELS[current]}</span>}
    </>
  );

  if (!canEdit) {
    return <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>{face}</span>;
  }

  async function choose(next: ApplicationPriority) {
    if (next === current) return;
    setOptimistic(next);
    const ok = await savePriority(applicationId, next);
    if (!ok) setOptimistic(null);
    else router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Priority: ${PRIORITY_LABELS[current]}. Change`}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 max-md:h-10 max-md:px-2.5",
          className
        )}
      >
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {APPLICATION_PRIORITIES.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => choose(p)} className="gap-2 max-md:h-11">
            <PriorityGlyph priority={p} />
            <span className="flex-1">{PRIORITY_LABELS[p]}</span>
            {p === current && <CheckIcon className="size-3.5 text-accent" />}
            {showKeys && <Kbd>{KEY_FOR[p]}</Kbd>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
