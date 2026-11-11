"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { ApiTokenScope } from "@/db/schema";
import { createAccessToken, revokeAccessToken } from "@/lib/actions/tokens";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { CopyField } from "@/components/patterns/form-copy-field";
import { CodeSnippet } from "./code-snippet";
import { claudeCodeCommand } from "./setup";

/** Dates arrive formatted from the server, so nothing here depends on the clock. */
export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: ApiTokenScope;
  created: string;
  lastUsed: string | null;
  /** "in 89 days", "Never expires", "Expired 2 days ago". */
  expiry: string;
  expired: boolean;
  /** Admin list only. */
  owner?: { name: string; offboarded: boolean };
};

const SCOPE_LABEL: Record<ApiTokenScope, string> = { read: "Read only", write: "Read and write" };

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
] as const;
type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]["value"];

export function TokenList({
  tokens,
  revokeCopy,
}: {
  tokens: TokenRow[];
  /** What revoking means for this list — your own token, or someone else's. */
  revokeCopy: (token: TokenRow) => string;
}) {
  const router = useRouter();
  const [revoking, setRevoking] = React.useState<TokenRow | null>(null);

  async function revoke() {
    if (!revoking) return;
    const res = await revokeAccessToken({ tokenId: revoking.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`${revoking.name} revoked`);
    router.refresh();
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {tokens.map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-sm font-medium">{t.name}</span>
                <Badge variant={t.scope === "write" ? "default" : "neutral"}>{SCOPE_LABEL[t.scope]}</Badge>
                {t.expired && <Badge variant="warning">Expired</Badge>}
                {t.owner?.offboarded && <Badge variant="warning">Owner offboarded</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
                {t.owner && <span className="text-fg">{t.owner.name}</span>}
                <code className="font-mono text-[11px]">{t.prefix}…</code>
                <span>Created {t.created}</span>
                <span>{t.lastUsed ? `Last used ${t.lastUsed}` : "Never used"}</span>
                <span className={cn(t.expired && "text-warning")}>{t.expiry}</span>
              </div>
            </div>
            <Button
              variant="danger-ghost"
              size="sm"
              className="self-start max-md:h-10 max-md:px-3 sm:self-center"
              onClick={() => setRevoking(t)}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={revoking ? `Revoke ${revoking.name}?` : "Revoke token?"}
        description={revoking ? revokeCopy(revoking) : ""}
        confirmLabel="Revoke token"
        tone="danger"
        onConfirm={revoke}
      />
    </>
  );
}

export function MyTokens({
  tokens,
  endpoint,
  canWrite,
  atLimit,
  limit,
}: {
  tokens: TokenRow[];
  endpoint: string;
  /** Read-only members can only make read tokens. */
  canWrite: boolean;
  atLimit: boolean;
  limit: number;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      {tokens.length > 0 ? (
        <TokenList
          tokens={tokens}
          revokeCopy={() =>
            "The assistant using it stops working at once. You can make a new token and paste it into the same setup."
          }
        />
      ) : (
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border-strong/70 bg-bg-subtle/40 p-4">
          <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <div className="text-sm text-fg-muted">
            <p className="font-medium text-fg">No tokens yet</p>
            <p className="mt-0.5">
              A token is the key your assistant uses to sign in as you. Make one, paste the setup
              line into your assistant, and ask it what needs you this week.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button className="max-md:h-10" onClick={() => setOpen(true)} disabled={atLimit}>
          <PlusIcon />
          New token
        </Button>
        {atLimit && (
          <span className="text-xs text-fg-muted">
            You have {limit} active tokens, which is the limit. Revoke one to make another.
          </span>
        )}
      </div>
      <CreateTokenDialog open={open} onOpenChange={setOpen} endpoint={endpoint} canWrite={canWrite} />
    </div>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  endpoint,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [scope, setScope] = React.useState<ApiTokenScope>("read");
  const [expiry, setExpiry] = React.useState<ExpiryValue>("90");
  const [busy, setBusy] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) {
      // The token leaves memory with the dialog; it can't be shown again.
      setToken(null);
      setName("");
      setScope("read");
      setExpiry("90");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createAccessToken({
      name,
      scope,
      expiresInDays: expiry === "never" ? null : (Number(expiry) as 30 | 90 | 365),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setToken(res.data.token);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your token now</DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-relaxed">
                We keep only a fingerprint of it, so this is the one time it is shown. If you lose
                it, revoke it and make another.
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Token</Label>
                <CopyField value={token} label="Token" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label>Claude Code, ready to paste</Label>
                <CodeSnippet value={claudeCodeCommand(endpoint, token)} label="Command" />
                <p className="text-xs text-fg-muted">
                  Using another assistant? Copy the token and follow the setup steps on this page.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button className="max-sm:h-10" onClick={() => close(false)}>
                I&apos;ve copied it
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>New token</DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-relaxed">
                One token per assistant, so you can revoke one without breaking the others.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Claude on my laptop"
                  maxLength={60}
                  autoComplete="off"
                  required
                />
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">What it may do</legend>
                <ScopeOption
                  value="read"
                  checked={scope === "read"}
                  onSelect={setScope}
                  title="Read only"
                  description="Look things up and brief you. It can't change anything or send email."
                />
                <ScopeOption
                  value="write"
                  checked={scope === "write"}
                  onSelect={setScope}
                  disabled={!canWrite}
                  title="Read and write"
                  description={
                    canWrite
                      ? "Also add notes, move applications, log coffee chats and email you — whatever your role allows, recorded under your name."
                      : "Read-only members can't make changes, so neither can their assistant."
                  }
                />
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="token-expiry">Expires after</Label>
                <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryValue)}>
                  <SelectTrigger id="token-expiry" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {expiry === "never" && (
                  <p className="text-xs text-warning">
                    A token that never expires keeps working until someone revokes it. Pick this
                    only for something you will remember to clean up.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                className="max-sm:h-10"
                onClick={() => close(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" className="max-sm:h-10" disabled={busy || name.trim() === ""}>
                {busy ? "Creating…" : "Create token"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  value,
  checked,
  onSelect,
  title,
  description,
  disabled = false,
}: {
  value: ApiTokenScope;
  checked: boolean;
  onSelect: (value: ApiTokenScope) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 transition-colors",
        checked ? "border-accent bg-accent-subtle/50" : "border-border-strong",
        disabled ? "cursor-not-allowed bg-bg-subtle" : "cursor-pointer hover:border-fg-subtle",
        "has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-accent/20"
      )}
    >
      <input
        type="radio"
        name="token-scope"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-0.5 size-4 shrink-0 accent-(--accent)"
      />
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", disabled && "text-fg-muted")}>{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{description}</span>
      </span>
    </label>
  );
}

/** Admin view: every working token in the club. */
export function ClubTokens({ tokens }: { tokens: TokenRow[] }) {
  return (
    <TokenList
      tokens={tokens}
      revokeCopy={(t) =>
        `${t.owner?.name ?? "The owner"}'s assistant stops working at once. They can make a new token themselves if they still need one.`
      }
    />
  );
}
