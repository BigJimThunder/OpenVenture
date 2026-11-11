"use client";

import * as React from "react";
import { format } from "date-fns";
import { MailIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { draftDeclineLetterAction, getDeclineEmailPreview } from "@/lib/actions/applications";
import { DECLINE_REASONS, type DeclineReason } from "@/db/schema";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Preview = {
  applicantEmail: string | null;
  subject: string;
  body: string;
  clubSendsByDefault: boolean;
  alreadySentAt: string | null;
  aiAvailable: boolean;
};

/**
 * State for a decline: reason, internal note, and what (if anything) the
 * founder is sent. Shared by the board's decline dialog and the vote decision
 * dialog so declining is the same one step wherever it starts.
 */
export function useDeclineForm(applicationId: string | null) {
  const [reason, setReason] = React.useState<DeclineReason | "">("");
  const [note, setNote] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  // null = the member hasn't touched it; fall back to what the preview implies.
  const [sendChoice, setSendChoice] = React.useState<boolean | null>(null);
  const [editedBody, setEditedBody] = React.useState<string | null>(null);
  const [drafting, setDrafting] = React.useState(false);

  React.useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    void getDeclineEmailPreview({ applicationId }).then((res) => {
      if (!cancelled && res.ok) setPreview(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const canSend = Boolean(preview?.applicantEmail) && !preview?.alreadySentAt;
  const send = canSend && (sendChoice ?? preview?.clubSendsByDefault ?? false);
  const body = editedBody ?? preview?.body ?? "";

  async function draftWithAi() {
    if (!applicationId || !reason) return;
    setDrafting(true);
    const res = await draftDeclineLetterAction({
      applicationId,
      declineReason: reason,
      note: note.trim() || undefined,
    });
    setDrafting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditedBody(res.data.body);
  }

  return {
    reason,
    setReason,
    note,
    setNote,
    preview,
    canSend,
    send,
    setSend: setSendChoice,
    body,
    setBody: setEditedBody,
    bodyEdited: editedBody !== null && editedBody !== preview?.body,
    drafting,
    draftWithAi,
    valid: reason !== "" && (!send || body.trim().length > 0),
    /** The decline arguments both server actions accept. */
    toInput() {
      return {
        declineReason: reason as DeclineReason,
        note: note.trim() || undefined,
        founderEmail: { send, body: send ? body.trim() : undefined },
      };
    },
  };
}

export type DeclineForm = ReturnType<typeof useDeclineForm>;

export function DeclineFields({ form }: { form: DeclineForm }) {
  const { preview } = form;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Reason</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Decline reason">
          {DECLINE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={form.reason === r}
              onClick={() => form.setReason(r)}
              className={cn(
                "h-10 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-8",
                form.reason === r
                  ? "border-danger-border bg-danger-bg text-danger"
                  : "border-border bg-panel text-fg-muted hover:border-border-strong hover:text-fg"
              )}
            >
              {DECLINE_REASON_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decline-note">
          Note for the record <span className="font-normal text-fg-subtle">— internal, optional</span>
        </Label>
        <Textarea
          id="decline-note"
          rows={2}
          value={form.note}
          onChange={(e) => form.setNote(e.target.value)}
          placeholder="What would have changed our mind? Next year's retro reads this."
          maxLength={2000}
          className="max-md:text-base"
        />
      </div>

      <div className="rounded-lg border border-border bg-bg-subtle/50">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <MailIcon className="size-4 shrink-0 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Email the founder</div>
            <div className="truncate text-xs text-fg-muted">
              {!preview
                ? "Checking what would be sent…"
                : preview.alreadySentAt
                  ? `A decline email already went out on ${format(new Date(preview.alreadySentAt), "MMM d")}.`
                  : !preview.applicantEmail
                    ? "No founder email on file — nothing will be sent."
                    : form.send
                      ? `To ${preview.applicantEmail} when you confirm.`
                      : `${preview.applicantEmail} won't hear from us automatically.`}
            </div>
          </div>
          <Switch
            checked={form.send}
            onCheckedChange={form.setSend}
            disabled={!form.canSend}
            aria-label="Email the founder"
          />
        </div>

        {form.send && preview && (
          <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
            <div className="text-xs text-fg-muted">
              <span className="text-fg-subtle">Subject</span> {preview.subject}
            </div>
            <Textarea
              rows={9}
              value={form.body}
              onChange={(e) => form.setBody(e.target.value)}
              aria-label="Email body"
              className="bg-panel leading-relaxed max-md:text-base"
              maxLength={6000}
            />
            <div className="flex flex-wrap items-center gap-2">
              {preview.aiAvailable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={form.draftWithAi}
                  disabled={form.drafting || !form.reason}
                  title={form.reason ? undefined : "Choose a reason first"}
                >
                  <SparklesIcon />
                  {form.drafting ? "Drafting…" : "Draft with AI"}
                </Button>
              ) : (
                <span className="text-2xs text-fg-subtle">
                  This is our standard letter. Add an ANTHROPIC_API_KEY to enable drafts.
                </span>
              )}
              {form.bodyEdited && (
                <Button type="button" size="sm" variant="ghost" onClick={() => form.setBody(null)}>
                  <RotateCcwIcon />
                  Standard letter
                </Button>
              )}
              {preview.aiAvailable && (
                <span className="text-2xs text-fg-subtle">
                  AI text is a draft — read it before you send.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
