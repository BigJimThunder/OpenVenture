"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { saveCalendarSettings } from "@/lib/actions/availability";
import type { OrgSettings } from "@/lib/org-settings";
import { sortTerms, suggestNextTerm, termForDate, validateTerms, type Term, type TermSystem } from "@/lib/scheduling/terms";
import { formatMinute, type IsoDay } from "@/lib/scheduling/time";
import { Field, FieldToggle } from "@/components/patterns/field";
import { Segmented } from "@/components/scheduling/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PreferenceToggle } from "./preference-toggle";
import { SettingsCard, StatusLine } from "./settings-section";

type Scheduling = OrgSettings["scheduling"];

const HOURS = Array.from({ length: 37 }, (_, i) => 6 * 60 + i * 30); // 6:00 AM to midnight

/**
 * Settings → Calendar: the school's terms, the hours the scheduler may
 * suggest, and the start-of-term reminder. Members enter a class schedule
 * per term, so the terms are what everything else hangs from.
 */
export function TermSettings({
  scheduling,
  today,
  timeZone,
  remindersOn,
  roster,
}: {
  scheduling: Scheduling;
  /** Club-time today. */
  today: IsoDay;
  timeZone: string;
  remindersOn: boolean;
  /** Progress for the current term, when there is one. */
  roster: { termName: string; confirmed: number; total: number } | null;
}) {
  const router = useRouter();
  const [system, setSystem] = React.useState<TermSystem>(scheduling.system);
  const [terms, setTerms] = React.useState<Term[]>(() => sortTerms(scheduling.terms));
  const [dayStart, setDayStart] = React.useState(scheduling.dayStartMinute);
  const [dayEnd, setDayEnd] = React.useState(scheduling.dayEndMinute);
  const [weekends, setWeekends] = React.useState(scheduling.weekends);
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const issues = validateTerms(terms);
  const hoursError = dayEnd - dayStart < 120 ? "Leave at least two hours between the two." : undefined;
  const issueFor = (key: string, field: "name" | "start" | "end") =>
    issues.find((i) => i.key === key && i.field === field)?.message;
  const current = termForDate(terms, today);
  const next = suggestNextTerm(system, terms, today);

  function edit(key: string, patch: Partial<Term>) {
    setTouched(true);
    setTerms((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setTouched(true);
      setter(value);
    };
  }

  async function save() {
    setSaving(true);
    const res = await saveCalendarSettings({ system, terms, dayStartMinute: dayStart, dayEndMinute: dayEnd, weekends });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTouched(false);
    setTerms((prev) => sortTerms(prev));
    toast.success("Calendar saved");
    router.refresh();
  }

  return (
    <>
      <SettingsCard
        title="Academic terms"
        description="Members enter a class schedule once per term, and get a reminder when the next one starts. Dates are a starting point; set them to your school's."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">The school runs on</span>
            <Segmented
              label="Term system"
              className="sm:w-64"
              value={system}
              onChange={change(setSystem)}
              options={[
                { value: "semester", label: "Semesters" },
                { value: "quarter", label: "Quarters" },
              ]}
            />
          </div>

          {terms.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-5 text-sm text-fg-muted">
              No terms yet, so nobody can enter a schedule and the scheduler has nothing to go on. Add {next.name} to
              start.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {terms.map((t) => (
                <li
                  key={t.key}
                  className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
                >
                  <Field
                    className="max-sm:col-span-2"
                    label="Term"
                    hint={current?.key === t.key ? "In session now." : undefined}
                    error={touched ? issueFor(t.key, "name") : undefined}
                  >
                    <Input value={t.name} maxLength={60} onChange={(e) => edit(t.key, { name: e.target.value })} />
                  </Field>
                  <Field label="First day" error={issueFor(t.key, "start")}>
                    <Input type="date" className="tnum" value={t.start} onChange={(e) => edit(t.key, { start: e.target.value })} />
                  </Field>
                  <Field label="Last day" error={issueFor(t.key, "end")}>
                    <Input type="date" className="tnum" value={t.end} onChange={(e) => edit(t.key, { end: e.target.value })} />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="max-sm:col-span-2 max-sm:h-10 max-sm:w-full sm:mt-[22px] sm:size-9"
                    aria-label={`Remove ${t.name}`}
                    onClick={() => {
                      setTouched(true);
                      setTerms((prev) => prev.filter((x) => x.key !== t.key));
                    }}
                  >
                    <Trash2Icon />
                    <span className="sm:hidden">Remove {t.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              type="button"
              variant="secondary"
              className="max-md:h-10"
              disabled={terms.length >= 24}
              onClick={() => {
                setTouched(true);
                setTerms((prev) => sortTerms([...prev, next]));
              }}
            >
              <PlusIcon />
              {terms.length === 0 ? `Add ${next.name}` : `Add next term (${next.name})`}
            </Button>
            {terms.length > 0 && (
              <p className="text-xs text-fg-muted">
                Removing a term hides the schedules members entered for it.
              </p>
            )}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Hours the scheduler suggests"
        description={`Meetings and coffee chats are only suggested inside this window, in the club's timezone (${timeZone.replace(/_/g, " ")}).`}
      >
        <div className="flex flex-col gap-4">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Field label="Earliest">
              <NativeSelect value={dayStart} onChange={(e) => change(setDayStart)(Number(e.target.value))}>
                {HOURS.filter((m) => m <= 1380).map((m) => (
                  <option key={m} value={m}>
                    {formatMinute(m)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Latest" error={hoursError}>
              <NativeSelect value={dayEnd} onChange={(e) => change(setDayEnd)(Number(e.target.value))}>
                {HOURS.filter((m) => m >= 420).map((m) => (
                  <option key={m} value={m}>
                    {m === 1440 ? "Midnight" : formatMinute(m)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <FieldToggle label="Offer weekend times" hint="Off, the scheduler only looks at Monday to Friday and the schedule grid hides Saturday and Sunday.">
            <Switch checked={weekends} onCheckedChange={change(setWeekends)} />
          </FieldToggle>
        </div>
      </SettingsCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="max-md:h-10" onClick={save} disabled={saving || !touched || issues.length > 0 || Boolean(hoursError)}>
          {saving ? "Saving…" : "Save calendar"}
        </Button>
        {touched && (issues.length > 0 || hoursError) ? (
          <span role="status" className="text-xs text-danger">
            Fix the highlighted {issues.length + (hoursError ? 1 : 0) === 1 ? "field" : "fields"} to save.
          </span>
        ) : touched ? (
          <span role="status" className="text-xs text-fg-muted">
            Unsaved changes.
          </span>
        ) : null}
      </div>

      <SettingsCard>
        <div className="flex flex-col gap-3">
          <PreferenceToggle
            section="automation"
            field="scheduleReminders"
            checked={remindersOn}
            label="Start-of-term schedule reminders"
            description="From three days before a term starts until two weeks in, each member who hasn't confirmed a schedule for it gets an email with a direct link. Two at most, never on consecutive days."
          />
          {roster && (
            <StatusLine ok={roster.confirmed === roster.total}>
              <span className="tnum">
                {roster.confirmed} of {roster.total} members have confirmed a schedule for {roster.termName}.
              </span>{" "}
              <Link href="/schedule" className="text-accent underline-offset-2 hover:underline">
                See who, and remind the rest
              </Link>
            </StatusLine>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
