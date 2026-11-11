"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { inviteMember, inviteMembers } from "@/lib/actions/members";
import { loadInviteTracks } from "@/lib/actions/onboarding";
import { MEMBER_ROLES, type MemberRole } from "@/db/schema";
import { MAX_BULK_INVITES, parseInviteLines, type BulkInviteResult } from "@/lib/onboarding/invites";
import { DEFAULT_DUE_DAYS } from "@/lib/onboarding/progress";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_HINT } from "./member-labels";

type Track = Awaited<ReturnType<typeof loadInviteTracks>>[number];
const NO_TRACK = "none";
const DUE_CHOICES = [7, 14, 21, 30] as const;

/**
 * Admin-only; renders nothing for anyone else. One invite does everything
 * downstream: the email, the onboarding track and its due date.
 */
export function InviteMemberDialog({
  allowedDomains,
  label = "Invite member",
}: {
  allowedDomains: string[];
  label?: string;
}) {
  const router = useRouter();
  const canInvite = useCan("manageMembers");
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"one" | "list">("one");
  const [busy, setBusy] = React.useState(false);
  const [role, setRole] = React.useState<MemberRole>("analyst");
  const [tracks, setTracks] = React.useState<Track[] | null>(null);
  const [trackId, setTrackId] = React.useState<string | null>(null);
  const [due, setDue] = React.useState<string>(String(DEFAULT_DUE_DAYS));
  const [lines, setLines] = React.useState("");
  const [results, setResults] = React.useState<BulkInviteResult[] | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  if (!canInvite) return null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResults(null);
      // Fresh every time: the default track may have changed since the page loaded.
      loadInviteTracks()
        .then((list) => {
          setTracks(list);
          setTrackId((current) =>
            current && (current === NO_TRACK || list.some((t) => t.id === current))
              ? current
              : (list.find((t) => t.isDefault)?.id ?? NO_TRACK)
          );
        })
        .catch(() => setTracks([]));
    }
  }

  const track = tracks?.find((t) => t.id === trackId) ?? null;
  const shared = (fd: FormData) => ({
    role,
    cohort: String(fd.get("cohort") ?? "").trim() || undefined,
    classYear: fd.get("classYear") ? Number(fd.get("classYear")) : undefined,
    trackId: track ? track.id : null,
    dueInDays: track && due !== "none" ? Number(due) : null,
  });

  async function submitOne(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const keepOpen = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    const name = String(fd.get("displayName") ?? "");
    setBusy(true);
    const res = await inviteMember({ email: String(fd.get("email") ?? ""), displayName: name, ...shared(fd) });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.data.trackName
        ? `${name} invited and enrolled on ${res.data.trackName}.`
        : `${name} invited. They sign in with their email, no password.`
    );
    router.refresh();
    if (keepOpen) {
      // Keep role, cohort and track: a new cohort is usually invited in one sitting.
      const form = formRef.current;
      if (form) {
        (form.elements.namedItem("displayName") as HTMLInputElement).value = "";
        (form.elements.namedItem("email") as HTMLInputElement).value = "";
        (form.elements.namedItem("displayName") as HTMLInputElement).focus();
      }
    } else {
      setOpen(false);
    }
  }

  async function submitList(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await inviteMembers({ lines, ...shared(new FormData(e.currentTarget)) });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResults(res.data.results);
    if (res.data.invited > 0) {
      toast.success(`${res.data.invited} invite${res.data.invited === 1 ? "" : "s"} sent.`);
      // Leave only the lines that still need fixing.
      setLines(
        res.data.results
          .filter((r) => !r.ok)
          .map((r) => r.raw)
          .join("\n")
      );
      router.refresh();
    }
  }

  // A live read of the pasted list. Members already on the roster are only
  // known to the server, so those surface in the per-line result afterwards.
  const preview = parseInviteLines(lines, { allowedDomains });
  const ready = preview.filter((p) => p.ok).length;
  const problems = preview.length - ready;
  const report: BulkInviteResult[] =
    results ??
    preview.flatMap((p) => (p.ok ? [] : [{ line: p.line, raw: p.raw, ok: false, detail: p.error }]));

  const sharedFields = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
          <SelectTrigger className="max-md:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-fg-subtle">{ROLE_HINT[role]}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`invite-cohort-${mode}`}>Cohort</Label>
          <Input id={`invite-cohort-${mode}`} name="cohort" maxLength={60} placeholder="Fall 2026" className="max-md:h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`invite-class-${mode}`}>Class year</Label>
          <Input
            id={`invite-class-${mode}`}
            name="classYear"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            placeholder="2029"
            className="tnum max-md:h-10"
          />
        </div>
      </div>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-fg-muted">Onboarding</legend>
        {tracks === null ? (
          <p className="text-sm text-fg-subtle">Loading tracks…</p>
        ) : tracks.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No onboarding track yet, so they will only be asked to confirm their details. Build one on the
            Onboarding page and later invites are enrolled on it.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label>Track</Label>
                <Select value={trackId ?? NO_TRACK} onValueChange={setTrackId}>
                  <SelectTrigger className="max-md:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tracks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.isDefault ? " (default)" : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value={NO_TRACK}>No onboarding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Due</Label>
                <Select value={due} onValueChange={setDue} disabled={!track}>
                  <SelectTrigger className="max-md:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DUE_CHOICES.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        In {d} days
                      </SelectItem>
                    ))}
                    <SelectItem value="none">No due date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="tnum mt-2 text-xs text-fg-subtle">
              {track
                ? track.requiredCount > 0
                  ? `${track.requiredCount} required item${track.requiredCount === 1 ? "" : "s"}${track.minutes ? `, about ${track.minutes} min` : ""}. They can't use the rest of the app until these are done; reminders go out on their own.`
                  : "This track has no required items, so they get in as soon as they confirm their details."
                : "They confirm their details and go straight into the app."}
            </p>
          </>
        )}
      </fieldset>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="max-md:h-10">
          <UserPlusIcon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite members</DialogTitle>
          <DialogDescription>
            Each person gets one email with a sign-in link. From there the app walks them through setup.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "one" | "list")}>
          <TabsList className="w-full max-md:h-10">
            <TabsTrigger value="one" className="flex-1 max-md:h-9">
              One person
            </TabsTrigger>
            <TabsTrigger value="list" className="flex-1 max-md:h-9">
              Paste a list
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "one" ? (
          <form ref={formRef} onSubmit={submitOne} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" name="displayName" required maxLength={120} autoFocus placeholder="Jordan Lee" className="max-md:h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                placeholder={`jordan@${allowedDomains[0] ?? "university.edu"}`}
                className="max-md:h-10"
              />
              {allowedDomains.length > 0 && (
                <p className="text-xs text-fg-subtle">
                  Must end in {allowedDomains.map((d) => `@${d}`).join(" or ")}.
                </p>
              )}
            </div>
            {sharedFields}
            <DialogFooter>
              <Button type="submit" name="intent" value="another" variant="secondary" className="max-sm:h-10" disabled={busy}>
                Invite and add another
              </Button>
              <Button type="submit" name="intent" value="done" className="max-sm:h-10" disabled={busy}>
                {busy ? "Inviting…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={submitList} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-lines">People, one per line</Label>
              <Textarea
                id="invite-lines"
                rows={5}
                value={lines}
                onChange={(e) => {
                  setLines(e.target.value);
                  setResults(null);
                }}
                placeholder={`Jordan Lee <jordan@${allowedDomains[0] ?? "university.edu"}>\nsam@${allowedDomains[0] ?? "university.edu"}`}
                className="font-mono text-xs"
              />
              <p className="tnum text-xs text-fg-subtle">
                {results
                  ? `${results.filter((r) => r.ok).length} invited · ${results.filter((r) => !r.ok).length} skipped. The skipped lines are still in the box; edit them to try again.`
                  : preview.length === 0
                    ? "Paste from a spreadsheet or a sign-up sheet. A bare email works; we guess the name and they confirm it."
                    : `${ready} ready to invite${problems > 0 ? ` · ${problems} with a problem` : ""}${ready > MAX_BULK_INVITES ? ` · the limit is ${MAX_BULK_INVITES} at a time` : ""}`}
              </p>
            </div>
            {report.length > 0 && (
              <ul className="flex max-h-40 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border text-xs">
                {report.map((r) => (
                  <li key={`${r.line}-${r.raw}`} className="flex items-start gap-2 px-2.5 py-1.5">
                    <span className={cn("mt-0.5 shrink-0", r.ok ? "text-success" : "text-danger")}>
                      {r.ok ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <XIcon className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.ok ? r.detail : r.raw}</span>
                      {!r.ok && <span className="block text-fg-muted">{r.detail}</span>}
                    </span>
                    <span className="tnum shrink-0 text-fg-subtle">{r.ok ? "Invited" : `Line ${r.line}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {sharedFields}
            <DialogFooter>
              <Button type="button" variant="secondary" className="max-sm:h-10" onClick={() => setOpen(false)} disabled={busy}>
                {results ? "Done" : "Cancel"}
              </Button>
              <Button type="submit" className="max-sm:h-10" disabled={busy || Boolean(results) || ready === 0 || ready > MAX_BULK_INVITES}>
                {busy ? "Inviting…" : results || ready === 0 ? "Send invites" : `Send ${ready} invite${ready === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
