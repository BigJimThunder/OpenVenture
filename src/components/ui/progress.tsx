"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/**
 * A determinate progress bar. Say what it measures with `aria-label` (or
 * `aria-labelledby`) — "Onboarding progress for Sam Lee", not just a bar. The
 * value reaches assistive tech as a percentage; a bar with no name at all
 * falls back to "Progress" rather than being announced as nothing.
 */
function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  const named = props["aria-label"] != null || props["aria-labelledby"] != null;
  return (
    <ProgressPrimitive.Root
      value={Math.round(pct)}
      aria-label={named ? undefined : "Progress"}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 rounded-full bg-accent transition-transform", indicatorClassName)}
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
