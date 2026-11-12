"use client";

import * as React from "react";
import { toast } from "sonner";
import type { EmailCategory, EmailPrefs } from "@/db/schema";
import { resumeMyEmail, updateMyEmailPrefs } from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const COPY: Record<EmailCategory, { label: string; description: string }> = {
  digest: { label: "Weekly digest", description: "Monday: your applications, open votes and action items." },
  reminders: { label: "Reminders", description: "A vote closing, a stalled application, check-ins, your schedule." },
};

/** Which of the club's scheduled emails this member wants. Saves on flip. */
export function EmailPrefsCard({ prefs }: { prefs: EmailPrefs }) {
  const [value, setValue] = React.useState<Record<EmailCategory, boolean>>({
    digest: prefs.digest !== false,
    reminders: prefs.reminders !== false,
  });
  const [, startTransition] = React.useTransition();
  const [paused, setPaused] = React.useState(Boolean(prefs.undeliverableSince));

  function resume() {
    setPaused(false);
    startTransition(async () => {
      const res = await resumeMyEmail({});
      if (!res.ok) {
        setPaused(true);
        toast.error(res.error);
      }
    });
  }

  function toggle(category: EmailCategory, on: boolean) {
    setValue((v) => ({ ...v, [category]: on }));
    startTransition(async () => {
      const res = await updateMyEmailPrefs({ category, on });
      if (!res.ok) {
        setValue((v) => ({ ...v, [category]: !on }));
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {paused ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs leading-relaxed">
            <p>
              Email to your address bounced, so the club&apos;s scheduled email to you is paused. If
              the address is wrong, fix it in Edit profile.
            </p>
            <Button variant="secondary" size="sm" onClick={resume}>
              My address works — resume
            </Button>
          </div>
        ) : null}
        {(Object.keys(COPY) as EmailCategory[]).map((category) => (
          <div key={category} className="flex items-start justify-between gap-3">
            <label htmlFor={`email-pref-${category}`} className="min-w-0">
              <span className="block font-medium">{COPY[category].label}</span>
              <span className="block text-xs leading-relaxed text-fg-muted">{COPY[category].description}</span>
            </label>
            <Switch
              id={`email-pref-${category}`}
              checked={value[category]}
              onCheckedChange={(on) => toggle(category, on)}
            />
          </div>
        ))}
        <p className="text-xs text-fg-muted">Sign-in emails and messages a member sends you always arrive.</p>
      </CardContent>
    </Card>
  );
}
