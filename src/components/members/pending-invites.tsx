"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";
import { resendInvite, revokeInvite } from "@/lib/actions/members";
import type { MemberRole } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";

type Invite = { id: string; displayName: string; email: string; role: MemberRole; invitedAt: Date };

/** Invites nobody has used yet. Admin-only: resend the email, or withdraw the invite. */
export function PendingInvites({ invites, emailConfigured }: { invites: Invite[]; emailConfigured: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<Invite | null>(null);

  async function resend(invite: Invite) {
    setBusyId(invite.id);
    const res = await resendInvite({ memberId: invite.id });
    setBusyId(null);
    if (!res.ok) toast.error(res.error);
    else toast.success(`Invite re-sent to ${invite.email}`);
  }

  async function revoke(invite: Invite) {
    const res = await revokeInvite({ memberId: invite.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`${invite.displayName}'s invite withdrawn`);
    router.refresh();
  }

  return (
    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading" className="mb-2 text-xs font-medium text-fg-muted">
        Waiting to sign in <span className="tnum text-fg-subtle">· {invites.length}</span>
      </h2>
      {!emailConfigured && (
        <p className="mb-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          Email isn&apos;t connected, so invite emails aren&apos;t being delivered. Tell these people to sign
          in at the login page with the address below, or{" "}
          <a href="/settings#email" className="underline underline-offset-2">
            connect email
          </a>
          .
        </p>
      )}
      <ul className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
        {invites.map((i) => (
          <li
            key={i.id}
            className="flex flex-col gap-2 border-b border-border px-4 py-2.5 last:border-0 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {i.displayName} <span className="font-normal text-fg-muted">· {ROLE_LABEL[i.role]}</span>
              </div>
              <div className="truncate text-xs text-fg-muted">
                {i.email} · invited {formatDistanceToNow(i.invitedAt, { addSuffix: true })}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="max-md:h-10 max-sm:flex-1"
                disabled={busyId === i.id}
                onClick={() => resend(i)}
              >
                <MailIcon />
                {busyId === i.id ? "Sending…" : "Resend"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="max-md:h-10 max-sm:flex-1"
                onClick={() => setRevoking(i)}
              >
                Withdraw
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRevoking(null)}
          title={`Withdraw ${revoking.displayName}'s invite?`}
          description={`${revoking.email} will no longer be able to sign in. You can invite them again later.`}
          confirmLabel="Withdraw invite"
          tone="danger"
          onConfirm={() => revoke(revoking)}
        />
      )}
    </section>
  );
}
