"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { submitApplication, type ApplyState } from "./actions";
import { GENDER_OPTIONS, RACE_OPTIONS, TEAM_MIX_OPTIONS, YES_NO_OPTIONS } from "./options";

const control =
  "block w-full rounded-lg border border-border bg-panel px-3 text-md text-fg shadow-xs outline-none transition-colors placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20 sm:text-base";

type FieldCtx = { values: Record<string, string>; errors: Record<string, string> };
const FormCtx = React.createContext<FieldCtx>({ values: {}, errors: {} });

function Field({
  name,
  label,
  hint,
  optional,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: (props: {
    id: string;
    name: string;
    defaultValue: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const { values, errors } = React.useContext(FormCtx);
  const error = errors[name];
  const describedBy = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-fg">
        {label}
        {optional && <span className="ml-1.5 font-normal text-fg-subtle">optional</span>}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="-mt-0.5 text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {children({
        id: name,
        name,
        defaultValue: values[name] ?? "",
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Select({
  options,
  className,
  blank = "Prefer not to say",
  ...props
}: React.ComponentProps<"select"> & {
  options: readonly { value: string; label: string }[];
  /** Label for the empty choice. */
  blank?: string;
}) {
  return (
    <select className={cn(control, "h-11", className)} {...props}>
      <option value="">{blank}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4 shadow-xs sm:p-6">
      <h2 className="text-md font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function ApplyForm({
  token,
  orgName,
  schoolName,
  askDemographics,
  sendsConfirmation,
}: {
  token: string;
  orgName: string;
  schoolName: string | null;
  askDemographics: boolean;
  sendsConfirmation: boolean;
}) {
  const [state, formAction, pending] = React.useActionState<ApplyState, FormData>(submitApplication, {
    status: "idle",
    token,
  });
  const formRef = React.useRef<HTMLFormElement>(null);
  const doneRef = React.useRef<HTMLDivElement>(null);

  // After a failed submit, take the founder to the first thing to fix.
  React.useEffect(() => {
    if (state.status === "error") {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error]');
      first?.focus({ preventScroll: true });
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (state.status === "done") {
      doneRef.current?.focus();
      window.scrollTo({ top: 0 });
    }
  }, [state]);

  if (state.status === "done") {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        className="mt-8 rounded-xl border border-border bg-panel p-5 shadow-xs outline-none sm:p-8"
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-success-bg text-success ring-1 ring-success-border">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-5">
            <path d="m5 10.5 3.2 3.2L15 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">We have your application</h2>
        <p className="mt-2 text-base leading-relaxed text-fg-muted">
          Thanks for applying with <span className="font-medium text-fg">{state.companyName}</span>.
          Your reference is <span className="tnum font-mono font-medium text-fg">{state.ref}</span>.
          {state.emailed && (
            <>
              {" "}
              We&apos;ve sent a confirmation to <span className="font-medium text-fg">{state.email}</span>.
            </>
          )}
        </p>
        <h3 className="mt-6 text-sm font-semibold">What happens next</h3>
        <ol className="mt-3 flex flex-col gap-3 text-base text-fg-muted">
          {[
            ["A member reads it", "Every application is screened by a member of the club, usually within a week."],
            ["A coffee chat", "If it looks like a fit, two members will email you to find half an hour to talk."],
            ["The club votes", "Promising companies are written up and voted on by the whole club."],
            ["You hear back either way", `We reply to ${state.email} whether the answer is yes or no.`],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-xs font-medium text-fg-muted ring-1 ring-border">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-fg">{title}.</span> {body}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-fg-muted">
          You don&apos;t need to do anything now. You can close this page.
        </p>
      </div>
    );
  }

  const ctx: FieldCtx =
    state.status === "error"
      ? { values: state.values, errors: state.fieldErrors }
      : { values: {}, errors: {} };
  const errorCount = Object.keys(ctx.errors).length;
  const formError =
    state.status === "error"
      ? (state.message ??
        (errorCount ? `${errorCount === 1 ? "One answer needs" : `${errorCount} answers need`} another look.` : null))
      : null;

  return (
    <FormCtx.Provider value={ctx}>
      {/* The key remounts the fields after a failed submit so the echoed
          answers become their defaults (React resets a form after its action). */}
      <form
        ref={formRef}
        action={formAction}
        key={state.status === "error" ? JSON.stringify(state.values) : "fresh"}
        className="mt-8 flex flex-col gap-4"
        noValidate
      >
        <input type="hidden" name="t" value={state.token} />
        {/* Honeypot. Hidden from people and assistive tech; bots fill it in. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Nickname
            <input type="text" name="nickname" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <Section title="What you're building">
          <Field name="companyName" label="Company or project name">
            {(p) => <input {...p} type="text" required maxLength={120} autoComplete="organization" className={cn(control, "h-11")} />}
          </Field>
          <Field name="website" label="Website" optional hint="A landing page, demo or repo. Anything we can click.">
            {(p) => <input {...p} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" maxLength={200} placeholder="yourcompany.com" className={cn(control, "h-11")} />}
          </Field>
          <Field
            name="pitchSummary"
            label="What are you building, and for whom?"
            hint="Plain language. What exists today, and who is using it or waiting for it?"
          >
            {(p) => <textarea {...p} required rows={6} maxLength={5000} className={cn(control, "min-h-36 py-2.5 leading-relaxed")} />}
          </Field>
        </Section>

        <Section title="The grant">
          <Field name="amountRequested" label="How much are you asking for?" hint="In dollars. A rough number is fine.">
            {(p) => (
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-md text-fg-subtle sm:text-base">
                  $
                </span>
                <input {...p} type="text" inputMode="decimal" required maxLength={12} placeholder="1,500" className={cn(control, "tnum h-11 pl-7")} />
              </div>
            )}
          </Field>
          <Field
            name="useOfFunds"
            label="What will the money pay for?"
            hint="The more specific the better: incorporation fees, API credits, a prototype run."
          >
            {(p) => <textarea {...p} required rows={4} maxLength={5000} className={cn(control, "min-h-28 py-2.5 leading-relaxed")} />}
          </Field>
        </Section>

        <Section title="You and your team">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="applicantName" label="Your name">
              {(p) => <input {...p} type="text" required maxLength={120} autoComplete="name" className={cn(control, "h-11")} />}
            </Field>
            <Field name="applicantEmail" label="Email">
              {(p) => <input {...p} type="email" required maxLength={200} autoComplete="email" autoCapitalize="none" placeholder="you@university.edu" className={cn(control, "h-11")} />}
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="teamSize" label="How many people on the team?" hint="Including you.">
              {(p) => <input {...p} defaultValue={p.defaultValue || "1"} type="number" inputMode="numeric" required min={1} max={50} className={cn(control, "tnum h-11")} />}
            </Field>
            <Field name="teamStudentMix" label="Who is on the team?" optional hint="Students, or not.">
              {(p) => <Select {...p} options={TEAM_MIX_OPTIONS} blank="Choose one" />}
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="school" label="School" optional>
              {(p) => <input {...p} type="text" maxLength={120} placeholder={schoolName ?? undefined} className={cn(control, "h-11")} />}
            </Field>
            <Field name="classYear" label="Graduation year" optional>
              {(p) => <input {...p} type="number" inputMode="numeric" min={2000} max={2100} placeholder={String(new Date().getFullYear() + 1)} className={cn(control, "tnum h-11")} />}
            </Field>
            <Field name="department" label="Department or college" optional>
              {(p) => <input {...p} type="text" maxLength={120} placeholder="Engineering" className={cn(control, "h-11")} />}
            </Field>
            <Field name="major" label="Major" optional>
              {(p) => <input {...p} type="text" maxLength={120} placeholder="Computer Science" className={cn(control, "h-11")} />}
            </Field>
          </div>
          <Field name="howHeard" label={`How did you hear about ${orgName}?`} optional>
            {(p) => <input {...p} type="text" maxLength={500} placeholder="A friend, a class, an event" className={cn(control, "h-11")} />}
          </Field>
        </Section>

        {askDemographics && (
          <Section
            title="About you — optional"
            description={
              <>
                Skip any or all of this. It helps the club see who it is and isn&apos;t reaching.
                Your answers are stored separately from your application, are{" "}
                <span className="font-medium text-fg">never shown to the people reviewing it</span>,
                and are only ever reported as totals across many applicants.
              </>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="gender" label="Gender" optional>
                {(p) => <Select {...p} options={GENDER_OPTIONS} />}
              </Field>
              <Field name="raceEthnicity" label="Race or ethnicity" optional>
                {(p) => <Select {...p} options={RACE_OPTIONS} />}
              </Field>
              <Field name="firstGeneration" label="First-generation student?" optional>
                {(p) => <Select {...p} options={YES_NO_OPTIONS} />}
              </Field>
              <Field name="international" label="International student?" optional>
                {(p) => <Select {...p} options={YES_NO_OPTIONS} />}
              </Field>
            </div>
          </Section>
        )}

        <div className="flex flex-col gap-3 pt-2">
          {formError && (
            <p
              role="alert"
              tabIndex={-1}
              data-form-error={errorCount ? undefined : ""}
              className="rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-sm text-danger outline-none"
            >
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-accent px-5 text-md font-medium text-accent-fg shadow-xs outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-chrome disabled:cursor-default disabled:opacity-60 sm:w-auto sm:self-start sm:px-8"
          >
            {pending ? "Sending…" : "Submit application"}
          </button>
          <p className="text-sm text-fg-muted">
            {sendsConfirmation
              ? "We'll email you a confirmation, and reply either way once the club has decided."
              : "We'll reply by email once the club has decided, either way."}
          </p>
        </div>
      </form>
    </FormCtx.Provider>
  );
}
