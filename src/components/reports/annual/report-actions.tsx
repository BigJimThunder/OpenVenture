"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, PencilIcon, PrinterIcon, SendIcon, UnlockIcon } from "lucide-react";
import { toast } from "sonner";
import { finalizeAnnualReport, reopenAnnualReport, sendAnnualReport } from "@/lib/actions/annual-report";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { useCan, whoCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReportStatus } from "@/db/schema";

/** Finalize, with the open items spelled out so nobody freezes a half-written report by accident. */
export function FinalizeButton({
  reportId,
  fiscalYear,
  missing,
  beforeFinalize,
  size = "sm",
}: {
  reportId: string;
  fiscalYear: number;
  missing: string[];
  /** Flush unsaved edits first; resolve false to abort. */
  beforeFinalize?: () => Promise<boolean>;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const allowed = useCan("partnerWork");

  if (!allowed) {
    return (
      <Button size={size} disabled title={whoCan("partnerWork")}>
        <LockIcon />
        Finalize
      </Button>
    );
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <LockIcon />
        Finalize
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Finalize this report?"
        confirmLabel={missing.length > 0 ? "Finalize anyway" : "Finalize"}
        description={
          <>
            The numbers are frozen as they stand today and the text is locked, so what you send cannot change
            afterwards. A partner can reopen it.
            {missing.length > 0 && (
              <>
                <span className="mt-3 block font-medium text-fg">
                  {missing.length} {missing.length === 1 ? "thing is" : "things are"} still open:
                </span>
                <span className="mt-1 block max-h-40 overflow-y-auto">
                  {missing.map((m) => (
                    <span key={m} className="block">
                      · {m}
                    </span>
                  ))}
                </span>
              </>
            )}
          </>
        }
        onConfirm={async () => {
          if (beforeFinalize && !(await beforeFinalize())) return false;
          const res = await finalizeAnnualReport({ reportId });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success("Report finalized");
          router.push(`/reports/annual/${fiscalYear}/view`);
        }}
      />
    </>
  );
}

/** The reader's toolbar: print, and for partners the rest of the workflow. */
export function ReaderActions({
  reportId,
  fiscalYear,
  status,
  recipients,
  summary,
  canEditDraft,
}: {
  reportId: string;
  fiscalYear: number;
  status: ReportStatus;
  /** Supporter emails from Settings. */
  recipients: string[];
  /** The two sentences the email will carry. */
  summary: string;
  canEditDraft: boolean;
}) {
  const router = useRouter();
  const partner = useCan("partnerWork");
  const admin = useCan("manageClub");
  const [sendOpen, setSendOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    setBusy(true);
    const res = await sendAnnualReport({ reportId, note });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSendOpen(false);
    toast.success(
      res.data.failed > 0
        ? `Sent to ${res.data.sent}; ${res.data.failed} did not go through`
        : `Sent to ${res.data.sent} ${res.data.sent === 1 ? "supporter" : "supporters"}`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && canEditDraft && (
        <Button size="sm" variant="secondary" asChild>
          <Link href={`/reports/annual/${fiscalYear}`}>
            <PencilIcon />
            Back to editing
          </Link>
        </Button>
      )}
      {status !== "draft" && partner && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setReopenOpen(true)}>
            <UnlockIcon />
            Reopen
          </Button>
          <Button size="sm" variant={status === "sent" ? "secondary" : "default"} onClick={() => setSendOpen(true)}>
            <SendIcon />
            {status === "sent" ? "Send again" : "Send to supporters"}
          </Button>
        </>
      )}
      <Button size="sm" variant="secondary" onClick={() => window.print()}>
        <PrinterIcon />
        Print or save PDF
      </Button>

      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Reopen for edits?"
        description="The report goes back to a draft and its numbers follow the live data again. Anyone you already sent it to keeps the link; they will see the draft until you finalize again."
        confirmLabel="Reopen"
        onConfirm={async () => {
          const res = await reopenAnnualReport({ reportId });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          router.push(`/reports/annual/${fiscalYear}`);
        }}
      />

      <Dialog open={sendOpen} onOpenChange={(o) => !busy && setSendOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to supporters</DialogTitle>
            <DialogDescription>
              An email with a short summary and a link to this report. Recipients sign in to read it online, so
              attach the PDF yourself for anyone without an account.
            </DialogDescription>
          </DialogHeader>
          {recipients.length === 0 ? (
            <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm">
              No supporter emails are set.{" "}
              {admin ? (
                <Link href="/settings" className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                  Add them in Settings, under Reports.
                </Link>
              ) : (
                "An admin adds them in Settings, under Reports."
              )}
            </p>
          ) : (
            <div className="grid gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-fg-muted">
                  To ({recipients.length})
                </div>
                <div className="mt-0.5 break-words">{recipients.join(", ")}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-fg-muted">The email will say</div>
                <p className="mt-0.5 rounded-md border border-border bg-bg-subtle px-3 py-2 text-fg-muted">{summary}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ar-send-note">A note from you, above the summary (optional)</Label>
                <Textarea
                  id="ar-send-note"
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Thank you for another year of support."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" className="max-sm:h-10" onClick={() => setSendOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="max-sm:h-10" onClick={send} disabled={busy || recipients.length === 0}>
              {busy ? "Sending…" : recipients.length > 0 ? `Send to ${recipients.length}` : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
