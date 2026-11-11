"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateSlackWebhook } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SlackWebhook({ url }: { url: string | null }) {
  const [saved, setSaved] = React.useState(url ?? "");
  const [draft, setDraft] = React.useState(url ?? "");
  const [pending, startTransition] = React.useTransition();
  const dirty = draft.trim() !== saved;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    startTransition(async () => {
      const res = await updateSlackWebhook({ url: next });
      if (!res.ok) {
        toast.error(
          res.code === "validation" ? "That isn't a Slack incoming-webhook URL (https://hooks.slack.com/…)" : res.error
        );
        return;
      }
      setSaved(next);
      setDraft(next);
      toast.success(next ? "Slack connected" : "Slack disconnected");
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5">
      <Label htmlFor="slack-webhook">Slack incoming webhook</Label>
      <div className="flex gap-2">
        <Input
          id="slack-webhook"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          className="font-mono text-xs"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">
        {saved
          ? "Connected. New applications post to this channel. Clear the field and save to disconnect."
          : "Optional. Paste a webhook URL and each new application is announced in that channel."}
      </p>
    </form>
  );
}
