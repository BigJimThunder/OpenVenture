"use client";

import * as React from "react";
import { EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Shows a founder email exactly as it will read, with sample names filled in. */
export function EmailPreview({
  name,
  subject,
  body,
  replyTo,
}: {
  /** "received", "declined" or "funded" email — used in the dialog title. */
  name: string;
  subject: string;
  body: string;
  replyTo: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0 max-md:h-10">
          <EyeIcon />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            A sample with a made-up founder. The real email uses the applicant&apos;s first name and
            company.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border border-border">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-border bg-bg-subtle px-4 py-3 text-xs">
            <dt className="text-fg-subtle">Subject</dt>
            <dd className="font-medium">{subject}</dd>
            <dt className="text-fg-subtle">Replies go to</dt>
            <dd className="min-w-0 truncate">{replyTo}</dd>
          </dl>
          <div className="prose-surface flex flex-col gap-3 bg-panel px-4 py-4">
            {body.split(/\n{2,}/).map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
