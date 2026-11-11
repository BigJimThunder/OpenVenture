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
    <div className={cn("relative rounded-md border border-border bg-bg-subtle", className)}>
      <pre
        className={cn(
          "py-2.5 pr-12 pl-3 font-mono text-xs leading-relaxed text-fg select-all",
          wrap ? "break-words whitespace-pre-wrap" : "overflow-x-auto whitespace-pre"
        )}
      >
        {value}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5 bg-bg-subtle max-md:size-9"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
