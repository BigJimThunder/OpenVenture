"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateClubPreferences } from "@/lib/actions/settings";
import type { OrgSettings } from "@/lib/org-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = OrgSettings["automation"]["autoAssign"];

const LABEL: Record<Mode, string> = { off: "Off", round_robin: "Round robin" };

export function AutoAssignSelect({ value }: { value: Mode }) {
  const [mode, setMode] = React.useState(value);
  const [pending, startTransition] = React.useTransition();

  function change(next: Mode) {
    const prev = mode;
    setMode(next);
    startTransition(async () => {
      const res = await updateClubPreferences({ automation: { autoAssign: next } });
      if (!res.ok) {
        setMode(prev);
        toast.error(res.error);
        return;
      }
      toast.success(next === "off" ? "Auto-assign off" : "Auto-assign set to round robin");
    });
  }

  return (
    <div className="flex items-start gap-3 py-3 last:pb-0">
      <div className="min-w-0 flex-1">
        <label htmlFor="pref-auto-assign" className="text-sm font-medium">
          Assign an owner to new applications
        </label>
        <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-fg-muted">
          {mode === "round_robin"
            ? "When an application arrives without an owner, it goes to the active analyst or partner who currently owns the fewest open applications."
            : "Applications that arrive without an owner stay unassigned until someone claims them."}
        </p>
      </div>
      <Select value={mode} onValueChange={(v) => change(v as Mode)} disabled={pending}>
        <SelectTrigger id="pref-auto-assign" className="w-36 shrink-0 max-md:h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(LABEL) as Mode[]).map((m) => (
            <SelectItem key={m} value={m}>
              {LABEL[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
