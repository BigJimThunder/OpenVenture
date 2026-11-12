"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { eraseApplicantData } from "@/lib/actions/privacy";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";

/** Admin-only: honor a founder's request to have their personal data removed. */
export function EraseData({ applicationId, companyName }: { applicationId: string; companyName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function erase() {
    const res = await eraseApplicantData({ applicationId });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success("Personal data erased.");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 cursor-pointer self-start rounded px-1 py-1 text-xs text-fg-muted underline-offset-2 outline-none hover:text-danger hover:underline focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Erase the applicant&apos;s personal data…
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Erase personal data for ${companyName}?`}
        description={
          <>
            For when a founder asks you to. This permanently removes their name and email, what they
            wrote, their academic details and optional answers, the company&apos;s contacts, and the
            notes and debriefs members wrote about them. If this is the company&apos;s only
            application, its name and profile are removed too.
            <br />
            <br />
            The amounts, dates, decision and any grant stay, with no name attached. Memos and vote
            rationales are not changed: edit those yourself if they mention the founder. This cannot
            be undone.
          </>
        }
        confirmLabel="Erase personal data"
        tone="danger"
        onConfirm={erase}
      />
    </>
  );
}
