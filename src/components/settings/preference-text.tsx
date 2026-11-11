"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateClubPreferences } from "@/lib/actions/settings";
import type { OrgSettings, OrgSettingsPatch } from "@/lib/org-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StringKeys<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

/**
 * A free-text club preference. Unlike the switches this needs an explicit
 * Save — nobody wants a half-typed sentence published to founders — and the
 * button only appears once the text differs from what is stored.
 */
export function PreferenceText<S extends keyof OrgSettings>({
  section,
  field,
  value,
  label,
  hint,
  placeholder,
  maxLength,
  multiline,
  type = "text",
}: {
  section: S;
  field: StringKeys<OrgSettings[S]> & string;
  value: string;
  label: string;
  hint?: React.ReactNode;
  placeholder?: string;
  maxLength: number;
  multiline?: boolean;
  type?: "text" | "email";
}) {
  const [saved, setSaved] = React.useState(value);
  const [draft, setDraft] = React.useState(value);
  const [pending, startTransition] = React.useTransition();
  const id = `pref-${section}-${field}`;
  const dirty = draft.trim() !== saved;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    startTransition(async () => {
      const res = await updateClubPreferences({ [section]: { [field]: next } } as OrgSettingsPatch);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(next);
      setDraft(next);
      toast.success(`${label} saved`);
    });
  }

  const shared = {
    id,
    value: draft,
    placeholder,
    maxLength,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? <Textarea rows={3} {...shared} /> : <Input type={type} {...shared} />}
      <div className="flex min-h-7 items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">{hint}</p>
        {dirty && (
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={pending}>
              Discard
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
