"use client";

import * as React from "react";
import { toast } from "sonner";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { rotateIngestSecret, updateSlackWebhook } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function IngestSettings({
  hasSecret,
  slackWebhookUrl,
}: {
  hasSecret: boolean;
  slackWebhookUrl: string | null;
}) {
  const [secret, setSecret] = React.useState<string | null>(null);
  const [webhook, setWebhook] = React.useState(slackWebhookUrl ?? "");
  const [busy, setBusy] = React.useState(false);

  async function rotate() {
    if (
      hasSecret &&
      !confirm("Rotating the secret breaks the existing form integration until it's updated. Continue?")
    ) {
      return;
    }
    setBusy(true);
    const res = await rotateIngestSecret({});
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSecret(res.data.secret);
    toast.success("New secret generated — copy it now; it won't be shown again.");
  }

  async function saveWebhook() {
    setBusy(true);
    const res = await updateSlackWebhook({ url: webhook });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else toast.success(webhook ? "Slack webhook saved" : "Slack webhook removed");
  }

  const endpoint =
    typeof window !== "undefined" ? `${window.location.origin}/api/ingest/application` : "/api/ingest/application";

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <Label>Endpoint</Label>
        <div className="flex gap-2">
          <Input readOnly value={endpoint} className="font-mono text-xs" />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(endpoint);
              toast.success("Copied");
            }}
          >
            <CopyIcon />
          </Button>
        </div>
        <p className="text-xs text-fg-muted">
          POST JSON with an <code className="font-mono">x-openventure-signature: sha256=&lt;hmac&gt;</code>{" "}
          header — HMAC-SHA256 of the raw body using the signing secret below.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Signing secret</Label>
        {secret ? (
          <div className="flex gap-2">
            <Input readOnly value={secret} className="font-mono text-xs" />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(secret);
                toast.success("Copied — store it in your form backend");
              }}
            >
              <CopyIcon />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            {hasSecret ? "A secret is configured (hidden)." : "No secret yet — generate one."}
          </p>
        )}
        <div>
          <Button variant="secondary" size="sm" onClick={rotate} disabled={busy}>
            <RefreshCwIcon />
            {hasSecret ? "Rotate secret" : "Generate secret"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slack">Slack webhook (new-application pings)</Label>
        <div className="flex gap-2">
          <Input
            id="slack"
            placeholder="https://hooks.slack.com/services/…"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            className="font-mono text-xs"
          />
          <Button variant="secondary" size="sm" onClick={saveWebhook} disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
