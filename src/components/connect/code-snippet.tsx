"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A block of something to paste — a command, a config file, a prompt — with a copy button. */
export function CodeSnippet({
  value,
  label,
  wrap = false,
  className,
}: {
  value: string;
  /** What was copied, for the toast: "Command", "Config". */
  label: string;
  /** Prose (a prompt) wraps; code scrolls sideways so it pastes back intact. */
  wrap?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the text and copy it by hand");
    }
  }

  return (
    // The button sits beside the scroll area, not over it, so long lines never run underneath.
    <div className={cn("flex items-start rounded-md border border-border bg-bg-subtle", className)}>
      <pre
        className={cn(
          "min-w-0 flex-1 py-2.5 pl-3 font-mono text-xs leading-relaxed text-fg select-all",
          wrap ? "break-words whitespace-pre-wrap" : "overflow-x-auto whitespace-pre"
        )}
      >
        {value}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        className="m-1.5 shrink-0 max-md:size-9"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
