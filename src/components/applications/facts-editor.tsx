"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  GlobeIcon,
  MailIcon,
  UserIcon,
  GraduationCapIcon,
  MapPinIcon,
  PencilIcon,
} from "lucide-react";
import { toast } from "sonner";
import { updateApplicationFacts } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UNASSIGNED = "unassigned";

export type ApplicationFacts = {
  applicantName: string | null;
  applicantEmail: string | null;
  department: string | null;
  classYear: number | null;
  campusSource: string | null;
  teamSize: number | null;
  ownerMemberId: string | null;
};

/**
 * The Facts card. View mode mirrors the old read-only rows; Edit swaps the
 * editable subset (founder, email, department, class year, campus source,
 * team size, owner) for a form. Website stays read-only here — enrichment
 * and the company record own it. `children` is the non-fact tail of the
 * card (next step, enrich) so the whole card keeps one border.
 */
export function FactsEditor({
  applicationId,
  canEdit,
  facts,
  website,
  ownerName,
  appliedAt,
  members,
  children,
}: {
  applicationId: string;
  canEdit: boolean;
  facts: ApplicationFacts;
  website: { url: string | null; domain: string | null };
  ownerName: string | null;
  appliedAt: Date;
  members: { id: string; displayName: string }[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [owner, setOwner] = React.useState(facts.ownerMemberId ?? UNASSIGNED);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const text = (name: string) => String(fd.get(name) ?? "").trim() || null;
    const int = (name: string) => {
      const v = String(fd.get(name) ?? "").trim();
      return v ? Number(v) : null;
    };
    const res = await updateApplicationFacts({
      applicationId,
      applicantName: text("applicantName"),
      applicantEmail: text("applicantEmail"),
      department: text("department"),
      classYear: int("classYear"),
      campusSource: text("campusSource"),
      teamSize: int("teamSize"),
      ownerMemberId: owner === UNASSIGNED ? null : owner,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Facts</CardTitle>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <Fact icon={GlobeIcon} label="Website">
          {website.url ? (
            <a
              href={website.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {website.domain}
            </a>
          ) : (
            "—"
          )}
        </Fact>

        {editing ? (
          <form onSubmit={submit} className="flex flex-col gap-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Founder" htmlFor="applicantName">
                <Input
                  id="applicantName"
                  name="applicantName"
                  defaultValue={facts.applicantName ?? ""}
                  placeholder="Jordan Lee"
                  maxLength={120}
                  autoFocus
                />
              </Field>
              <Field label="Email" htmlFor="applicantEmail">
                <Input
                  id="applicantEmail"
                  name="applicantEmail"
                  type="email"
                  defaultValue={facts.applicantEmail ?? ""}
                  placeholder="jordan@school.edu"
                  maxLength={200}
                />
              </Field>
              <Field label="Department" htmlFor="department">
                <Input
                  id="department"
                  name="department"
                  defaultValue={facts.department ?? ""}
                  placeholder="Computer Science"
                  maxLength={120}
                />
              </Field>
              <Field label="Class year" htmlFor="classYear">
                <Input
                  id="classYear"
                  name="classYear"
                  type="number"
                  min={1950}
                  max={2100}
                  className="tnum"
                  defaultValue={facts.classYear ?? ""}
                  placeholder="2027"
                />
              </Field>
              <Field label="Campus source" htmlFor="campusSource">
                <Input
                  id="campusSource"
                  name="campusSource"
                  defaultValue={facts.campusSource ?? ""}
                  placeholder="Hackathon"
                  maxLength={120}
                />
              </Field>
              <Field label="Team size" htmlFor="teamSize">
                <Input
                  id="teamSize"
                  name="teamSize"
                  type="number"
                  min={1}
                  max={200}
                  className="tnum"
                  defaultValue={facts.teamSize ?? ""}
                  placeholder="2"
                />
              </Field>
            </div>
            <Field label="Owner" htmlFor="owner">
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger id="owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOwner(facts.ownerMemberId ?? UNASSIGNED);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Fact icon={UserIcon} label="Founder">
              {facts.applicantName ?? "—"}
            </Fact>
            <Fact icon={MailIcon} label="Email">
              {facts.applicantEmail ? (
                <a href={`mailto:${facts.applicantEmail}`} className="text-accent hover:underline">
                  {facts.applicantEmail}
                </a>
              ) : (
                "—"
              )}
            </Fact>
            <Fact icon={GraduationCapIcon} label="Department">
              {facts.department ?? "—"}
              {facts.classYear ? ` · ’${String(facts.classYear).slice(2)}` : ""}
            </Fact>
            <Fact icon={MapPinIcon} label="Campus source">
              {facts.campusSource ?? "—"}
            </Fact>
            <Separator />
            <Fact label="Owner">{ownerName ?? "Unassigned"}</Fact>
            <Fact label="Applied">{format(appliedAt, "MMM d, yyyy")}</Fact>
            {facts.teamSize != null && <Fact label="Team">{facts.teamSize} people</Fact>}
          </>
        )}

        {children}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-fg-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm">{children}</span>
    </div>
  );
}
