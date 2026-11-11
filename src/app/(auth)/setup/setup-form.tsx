"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { bootstrapOrg } from "@/lib/actions/setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, formatMoney, seasonLabel } from "@/lib/utils";

const STEPS = ["Your club", "This year's budget", "Applications"] as const;

const SEEDED = [
  "A pipeline: Applied, Screening, Coffee Chat, Pitched Group, Decision",
  "A five-question screening scorecard",
  "A grant memo template",
  "An onboarding checklist for new analysts",
];

const field = "h-10 text-base";

export function SetupForm({
  defaultFiscalYear,
  fiscalYearLabel,
  defaultName,
}: {
  defaultFiscalYear: number;
  fiscalYearLabel: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [clubName, setClubName] = React.useState("");
  const [schoolName, setSchoolName] = React.useState("");
  const [yourName, setYourName] = React.useState(defaultName);
  const [poolBudget, setPoolBudget] = React.useState("10000");
  const [fiscalYear, setFiscalYear] = React.useState(defaultFiscalYear);
  const [openApplications, setOpenApplications] = React.useState(true);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const budget = Number(poolBudget.replace(/[$,\s]/g, ""));
  const budgetValid = poolBudget.trim() !== "" && Number.isFinite(budget) && budget >= 0;
  const stepValid = [clubName.trim().length >= 2, budgetValid, true][step];
  const last = step === STEPS.length - 1;

  function go(next: number) {
    setStep(next);
    // Screen readers and keyboard users land on the new step's heading.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stepValid) return;
    if (!last) return go(step + 1);
    setBusy(true);
    const res = await bootstrapOrg({
      clubName,
      schoolName: schoolName || undefined,
      yourName: yourName || undefined,
      poolBudget: budget,
      fiscalYear,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      openApplications,
    });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    router.push("/welcome");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-panel p-5 shadow-xs sm:p-6">
      <ol className="mb-5 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className="flex flex-1 flex-col gap-1.5"
          >
            <span
              className={cn(
                "h-1 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-border"
              )}
            />
            <span className="sr-only">
              Step {i + 1}: {label}
              {i < step ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>
      <div className="tnum text-xs text-fg-subtle">
        Step {step + 1} of {STEPS.length}
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 text-md font-semibold tracking-tight outline-none">
        {STEPS[step]}
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        {step === 0 && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clubName">Club name</Label>
              <Input
                id="clubName"
                required
                autoFocus
                maxLength={80}
                placeholder="Cardinal Ventures"
                className={field}
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schoolName">School</Label>
              <Input
                id="schoolName"
                maxLength={120}
                placeholder="Example University"
                className={field}
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="yourName">Your name</Label>
              <Input
                id="yourName"
                maxLength={80}
                autoComplete="name"
                placeholder="How members will see you"
                className={field}
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm leading-relaxed text-fg-muted">
              Every grant draws from one pool per year. An approval that would overdraw it is
              blocked, so the club can&apos;t promise money it doesn&apos;t have.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="poolBudget">Grant budget for the year</Label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-fg-subtle">
                  $
                </span>
                <Input
                  id="poolBudget"
                  inputMode="decimal"
                  autoFocus
                  className={cn(field, "tnum pl-7")}
                  value={poolBudget}
                  onChange={(e) => setPoolBudget(e.target.value)}
                  aria-invalid={!budgetValid || undefined}
                  aria-describedby="poolBudget-hint"
                />
              </div>
              <p id="poolBudget-hint" className="text-xs text-fg-muted">
                {budgetValid
                  ? "A best guess is fine. You can change it, or add next year's pool, later."
                  : "Enter a dollar amount, or 0 if you don't know yet."}
              </p>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">Which year is this pool for?</legend>
              <div className="grid grid-cols-2 gap-2">
                {[defaultFiscalYear, defaultFiscalYear + 1].map((y) => (
                  <label
                    key={y}
                    className={cn(
                      "flex h-10 cursor-pointer items-center justify-center rounded-md border text-base transition-colors has-focus-visible:ring-2 has-focus-visible:ring-accent/40",
                      fiscalYear === y
                        ? "border-accent bg-accent-subtle font-medium text-fg"
                        : "border-border bg-panel text-fg-muted hover:border-border-strong"
                    )}
                  >
                    <input
                      type="radio"
                      name="fiscalYear"
                      className="sr-only"
                      checked={fiscalYear === y}
                      onChange={() => setFiscalYear(y)}
                    />
                    <span className="tnum">{y === defaultFiscalYear ? fiscalYearLabel : seasonLabel(y)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <label
              htmlFor="openApplications"
              className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3.5"
            >
              <span>
                <span className="block text-base font-medium">Open the application form</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-fg-muted">
                  Founders apply on a page we host for you, and each application lands in your
                  pipeline with an owner. You can close it or edit the wording any time.
                </span>
              </span>
              <Switch
                id="openApplications"
                checked={openApplications}
                onCheckedChange={setOpenApplications}
                className="mt-1"
              />
            </label>
            <div>
              <div className="text-xs font-medium text-fg-muted">
                We&apos;ll also set up, ready to edit
              </div>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {[
                  ...SEEDED,
                  `A ${formatMoney(budgetValid ? budget : 0)} grant pool for ${seasonLabel(fiscalYear)}`,
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                    <span className="text-fg-muted">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        {step > 0 ? (
          <Button type="button" variant="ghost" size="lg" onClick={() => go(step - 1)} disabled={busy}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" disabled={busy || !stepValid}>
          {last ? (busy ? "Setting up…" : `Create ${clubName.trim() || "club"}`) : (
            <>
              Continue <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
