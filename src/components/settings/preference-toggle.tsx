"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateClubPreferences } from "@/lib/actions/settings";
import type { OrgSettings, OrgSettingsPatch } from "@/lib/org-settings";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

type BooleanKeys<T> = { [K in keyof T]: T[K] extends boolean ? K : never }[keyof T];

/**
 * One club preference as a switch. Saves the moment it is flipped: the switch
 * moves immediately, and snaps back with an explanation if the save fails.
 */
export function PreferenceToggle<S extends keyof OrgSettings>({
  section,
  field,
  checked,
  label,
  description,
  disabled,
  disabledReason,
  trailing,
}: {
  section: S;
  field: BooleanKeys<OrgSettings[S]> & string;
  checked: boolean;
  label: string;
  /** Exactly what switching this on does, and when. */
  description: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  trailing?: React.ReactNode;
}) {
  const [value, setValue] = React.useState(checked);
  const [pending, startTransition] = React.useTransition();
  const id = `pref-${section}-${field}`;

  function toggle(next: boolean) {
    setValue(next);
    startTransition(async () => {
      const res = await updateClubPreferences({ [section]: { [field]: next } } as OrgSettingsPatch);
      if (!res.ok) {
        setValue(!next);
        toast.error(res.error);
        return;
      }
      toast.success(`${label} ${next ? "on" : "off"}`);
    });
  }

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("text-sm font-medium", !disabled && "cursor-pointer")}>
          {label}
        </label>
        <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-fg-muted">{description}</p>
        {disabled && disabledReason && (
          <p className="mt-1 text-xs text-fg-subtle">{disabledReason}</p>
        )}
      </div>
      {trailing}
      {/* Padding gives the small switch a thumb-sized target on touch. */}
      <span className="-m-2 flex shrink-0 p-2 max-md:-m-3 max-md:p-3">
        <Switch
          id={id}
          checked={value}
          onCheckedChange={toggle}
          disabled={disabled || pending}
          aria-busy={pending}
        />
      </span>
    </div>
  );
}
