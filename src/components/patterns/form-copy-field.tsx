"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A read-only value (URL, secret) with a copy button and, optionally, an open link. */
export function CopyField({
  value,
  label,
  openHref,
  className,
}: {
  value: string;
  /** What was copied, for the toast: "Form link", "Calendar feed". */
  label: string;
  openHref?: string;
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
    <div className={cn("flex items-center gap-2", className)}>
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 font-mono text-xs select-all">
        {value}
      </code>
      <Button variant="secondary" size="icon" className="max-md:size-10" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      {openHref && (
        <Button variant="secondary" size="icon" className="max-md:size-10" asChild>
          <a href={openHref} target="_blank" rel="noreferrer" aria-label={`Open ${label.toLowerCase()}`}>
            <ExternalLinkIcon />
          </a>
        </Button>
      )}
    </div>
  );
}
