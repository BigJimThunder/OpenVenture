"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOrgSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ClubSettings({
  org,
  timezones,
}: {
  org: {
    name: string;
    schoolName: string | null;
    allowedEmailDomains: string[];
    fiscalYearStartMonth: number;
    timezone: string;
  };
  timezones: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [fyMonth, setFyMonth] = React.useState(String(org.fiscalYearStartMonth));
  const [timezone, setTimezone] = React.useState(org.timezone);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateOrgSettings({
      name: String(fd.get("name") ?? ""),
      schoolName: String(fd.get("schoolName") ?? "") || undefined,
      allowedEmailDomains: String(fd.get("domains") ?? "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      fiscalYearStartMonth: Number(fyMonth),
      timezone,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Club settings saved");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Club name</Label>
          <Input id="name" name="name" required defaultValue={org.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schoolName">School</Label>
          <Input id="schoolName" name="schoolName" defaultValue={org.schoolName ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="domains">Sign-in domains</Label>
        <Input
          id="domains"
          name="domains"
          defaultValue={org.allowedEmailDomains.join(", ")}
          placeholder="university.edu, alumni.university.edu"
        />
        <p className="text-2xs text-fg-subtle">
          Comma-separated. Members outside these domains can&apos;t be invited — leave empty to
          allow any domain. Existing members keep access either way.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Fiscal year starts</Label>
          <Select value={fyMonth} onValueChange={setFyMonth}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" className="max-md:h-10" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
