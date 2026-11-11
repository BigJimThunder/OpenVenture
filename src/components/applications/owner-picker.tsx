"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { updateApplicationFacts } from "@/lib/actions/applications";
import { cn, initials } from "@/lib/utils";
import { useCan, useViewer } from "@/components/shell/viewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function saveOwner(applicationId: string, ownerMemberId: string | null) {
  const res = await updateApplicationFacts({ applicationId, ownerMemberId });
  if (!res.ok) toast.error(res.error);
  return res.ok;
}

export function OwnerAvatar({ name, className }: { name: string | null; className?: string }) {
  return name ? (
    <span
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[8px] font-semibold text-accent",
        className
      )}
      title={name}
    >
      {initials(name)}
    </span>
  ) : (
    <span
      className={cn("size-[18px] shrink-0 rounded-full border border-dashed border-border-strong", className)}
      title="Unassigned"
    />
  );
}

/** Owner as a one-tap control: "Assign to me" first, then the roster. */
export function OwnerPicker({
  applicationId,
  ownerId,
  ownerName,
  members,
  className,
}: {
  applicationId: string;
  ownerId: string | null;
  ownerName: string | null;
  members: { id: string; displayName: string }[];
  className?: string;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const canEdit = useCan("contribute");
  const [busy, setBusy] = React.useState(false);

  const face = (
    <>
      <OwnerAvatar name={ownerName} />
      <span className={cn("truncate", !ownerName && "text-fg-subtle")}>{ownerName ?? "Unassigned"}</span>
    </>
  );
  if (!canEdit) {
    return <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}>{face}</span>;
  }

  async function choose(next: string | null) {
    if (next === ownerId) return;
    setBusy(true);
    const ok = await saveOwner(applicationId, next);
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        aria-label={`Owner: ${ownerName ?? "unassigned"}. Change`}
        className={cn(
          "inline-flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 max-md:h-10 max-md:px-2.5",
          className
        )}
      >
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-52 overflow-y-auto">
        {ownerId !== viewer.memberId && (
          <>
            <DropdownMenuItem onSelect={() => choose(viewer.memberId)} className="gap-2 max-md:h-11">
              <OwnerAvatar name={viewer.name} />
              Assign to me
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => choose(m.id)} className="gap-2 max-md:h-11">
            <OwnerAvatar name={m.displayName} />
            <span className="flex-1 truncate">{m.displayName}</span>
            {m.id === ownerId && <CheckIcon className="size-3.5 text-accent" />}
          </DropdownMenuItem>
        ))}
        {ownerId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => choose(null)} className="gap-2 text-fg-muted max-md:h-11">
              <OwnerAvatar name={null} />
              Unassign
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
