"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { rotateIngestSecret } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { CopyField } from "@/components/patterns/form-copy-field";

/**
 * "Connect your own form": the signed webhook for clubs that already have a
 * website form. The secret is shown exactly once, right after it is generated.
 */
export function WebhookIntake({ endpoint, hasSecret }: { endpoint: string; hasSecret: boolean }) {
  const [secret, setSecret] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function rotate() {
    setBusy(true);
    const res = await rotateIngestSecret({});
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setSecret(res.data.secret);
    toast.success("New secret generated. Copy it now — it won't be shown again.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Endpoint</Label>
        <CopyField value={endpoint} label="Endpoint" />
        <p className="text-xs text-fg-muted">
          POST the application as JSON with an{" "}
          <code className="font-mono text-[11px]">x-openventure-signature: sha256=&lt;hmac&gt;</code> header —
          the HMAC-SHA256 of the raw body, keyed with the signing secret.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Signing secret</Label>
        {secret ? (
          <>
            <CopyField value={secret} label="Signing secret" />
            <p className="text-xs text-warning">
              This is the only time the secret is shown. Store it in your form&apos;s backend now.
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            {hasSecret
              ? "A secret is set. It is stored hidden — rotate it if it was lost or leaked."
              : "No secret yet. Generate one to switch the endpoint on."}
          </p>
        )}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (hasSecret ? setConfirmOpen(true) : rotate())}
            disabled={busy}
          >
            <RefreshCwIcon />
            {hasSecret ? "Rotate secret" : "Generate secret"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Rotate the signing secret?"
        description="The form that posts to this endpoint will be rejected until you paste the new secret into it."
        confirmLabel="Rotate secret"
        tone="danger"
        onConfirm={rotate}
      />
    </div>
  );
}
