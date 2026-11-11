"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { updateClubPreferences } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";

/** Hides (or brings back) the getting-started entry in the sidebar. Admins only. */
export function ChecklistVisibilityButton({ dismissed }: { dismissed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="max-md:h-10"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await updateClubPreferences({ setup: { dismissed: !dismissed } });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(
            dismissed ? "Checklist is back in the sidebar" : "Checklist hidden. It stays at /welcome."
          );
          router.refresh();
        })
      }
    >
      {dismissed ? "Show in sidebar" : "Hide from sidebar"}
    </Button>
  );
}

export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="max-md:h-10"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Couldn't copy. Select the link and copy it by hand.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
