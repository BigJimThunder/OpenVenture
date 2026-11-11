"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, ExternalLinkIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { confirmMyDetails, finishOnboarding, toggleOnboardingTask } from "@/lib/actions/members";
import type { OnboardingTaskKind } from "@/db/schema";
import { KIND_META, linkHost, safeHttpUrl, videoEmbed } from "@/lib/onboarding/resource";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/components/shell/sidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StepNav, primaryStepButton } from "./start-frame";

import { ScheduleStep } from "@/components/scheduling/schedule-step";
const stepHref = (key: string) => `/start?step=${key}`;

// ——— Header actions ———

export function FinishLaterButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="max-md:h-10"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await finishOnboarding({ later: true });
        if (!res.ok) {
          setBusy(false);
          toast.error(res.error);
          return;
        }
        router.push("/inbox");
      }}
    >
      Finish later
    </Button>
  );
}

export function SignOutLink() {
  const signOut = useSignOut();
  return (
    <button
      type="button"
      onClick={signOut}
      className="mt-1 cursor-pointer text-fg-muted underline-offset-2 outline-none hover:text-fg hover:underline focus-visible:underline"
    >
      Sign out
    </button>
  );
}

// ——— Your details ———

export type ProfileDefaults = {
  displayName: string;
  email: string;
  classYear: number | null;
  major: string | null;
  title: string | null;
  bio: string | null;
  linkedinUrl: string | null;
};

export function ProfileStep({
  defaults,
  backKey,
  nextKey,
}: {
  defaults: ProfileDefaults;
  backKey: string;
  nextKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (name: string) => String(fd.get(name) ?? "").trim();
    setBusy(true);
    setError(null);
    const res = await confirmMyDetails({
      displayName: text("displayName"),
      classYear: Number(text("classYear")),
      major: text("major"),
      title: text("title") || null,
      bio: text("bio") || null,
      linkedinUrl: text("linkedinUrl") || null,
    });
    if (!res.ok) {
      setBusy(false);
      setError(
        res.code === "validation"
          ? "Check the fields above. The LinkedIn link, if you add one, needs to start with https://."
          : res.error
      );
      return;
    }
    router.push(stepHref(nextKey));
  }

  const year = new Date().getFullYear();
  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="start-name" hint="As the club and founders will see it.">
          <Input
            id="start-name"
            name="displayName"
            required
            maxLength={120}
            autoComplete="name"
            defaultValue={defaults.displayName}
            className="max-md:h-11"
          />
        </Field>
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3">
          <Field label="Class year" htmlFor="start-year">
            <Input
              id="start-year"
              name="classYear"
              type="number"
              inputMode="numeric"
              required
              min={year - 10}
              max={year + 10}
              placeholder={String(year + 3)}
              defaultValue={defaults.classYear ?? ""}
              className="tnum max-md:h-11"
            />
          </Field>
          <Field label="Major or program" htmlFor="start-major">
            <Input
              id="start-major"
              name="major"
              required
              minLength={2}
              maxLength={120}
              placeholder="Economics"
              defaultValue={defaults.major ?? ""}
              className="max-md:h-11"
            />
          </Field>
        </div>
        <Field label="Email" htmlFor="start-email" hint="This is how you sign in. An admin can change it.">
          <Input id="start-email" value={defaults.email} readOnly disabled className="max-md:h-11" />
        </Field>

        <details className="group rounded-lg border border-border" open={Boolean(defaults.title || defaults.bio || defaults.linkedinUrl)}>
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-fg-muted outline-none select-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40">
            Optional: role in the club, a line about you, LinkedIn
          </summary>
          <div className="flex flex-col gap-4 border-t border-border p-3">
            <Field label="Role in the club" htmlFor="start-title">
              <Input
                id="start-title"
                name="title"
                maxLength={80}
                placeholder="Sourcing lead"
                defaultValue={defaults.title ?? ""}
                className="max-md:h-11"
              />
            </Field>
            <Field label="About you" htmlFor="start-bio">
              <Textarea
                id="start-bio"
                name="bio"
                rows={3}
                maxLength={1000}
                placeholder="What you study, what you've built, what you want to learn here."
                defaultValue={defaults.bio ?? ""}
              />
            </Field>
            <Field label="LinkedIn" htmlFor="start-linkedin">
              <Input
                id="start-linkedin"
                name="linkedinUrl"
                type="url"
                maxLength={300}
                placeholder="https://www.linkedin.com/in/…"
                defaultValue={defaults.linkedinUrl ?? ""}
                className="max-md:h-11"
              />
            </Field>
          </div>
        </details>
        {error && (
          <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <StepNav backHref={stepHref(backKey)}>
        <Button type="submit" className={primaryStepButton} disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
          {!busy && <ArrowRightIcon />}
        </Button>
      </StepNav>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

// ——— One required item ———

export type StepItem = {
  id: string;
  assignmentId: string;
  title: string;
  description: string | null;
  kind: OnboardingTaskKind;
  resourceUrl: string | null;
  done: boolean;
};

/**
 * One required item, typed by kind. The confirm button stays disabled until
 * the member has at least opened the thing (or ticked the agreement) — this is
 * self-attested, and says so; it is a speed bump, not a proctor.
 */
export function ItemStep({
  item,
  backKey,
  nextKey,
  reader,
  onPreviewContinue,
}: {
  item: StepItem;
  backKey: string;
  nextKey: string;
  /** The internal doc, rendered on the server, for an article held in Docs. */
  reader?: React.ReactNode;
  /** Admin preview: everything works except saving; called instead. */
  onPreviewContinue?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [opened, setOpened] = React.useState(false);
  const [agreed, setAgreed] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [reachedEnd, setReachedEnd] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReachedEnd(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const meta = KIND_META[item.kind];
  const link = safeHttpUrl(item.resourceUrl)?.toString() ?? null;
  const host = linkHost(item.resourceUrl);
  const embed = item.kind === "watch" ? videoEmbed(item.resourceUrl) : null;
  const consumable = item.kind === "read" || item.kind === "watch";

  let blocked: string | null = null;
  if (!item.done) {
    if (item.kind === "submit" && !agreed) blocked = "Tick the box to agree.";
    else if (consumable && reader && !reachedEnd) blocked = "Scroll to the end to continue.";
    else if (consumable && !reader && link && !opened) {
      blocked = item.kind === "watch" ? "Play the video first." : "Open the link first.";
    }
  }

  async function confirm() {
    if (onPreviewContinue) return onPreviewContinue();
    if (item.done) return router.push(stepHref(nextKey));
    setBusy(true);
    const res = await toggleOnboardingTask({ assignmentId: item.assignmentId, taskId: item.id, done: true });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    router.push(stepHref(nextKey));
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4">
        {item.description && item.kind !== "submit" && (
          <p className="text-base leading-relaxed whitespace-pre-line text-fg-muted">{item.description}</p>
        )}

        {embed && (
          <div className="overflow-hidden rounded-xl border border-border bg-bg-subtle">
            <div className="relative aspect-video">
              {playing ? (
                <iframe
                  src={`${embed.embedUrl}${embed.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
                  title={item.title}
                  className="absolute inset-0 size-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(true);
                    setOpened(true);
                  }}
                  className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md transition-transform group-hover:scale-105">
                    <PlayIcon className="ml-0.5 size-6 fill-current" />
                  </span>
                  <span className="text-sm font-medium">Play video</span>
                  <span className="text-xs text-fg-subtle">
                    Plays here, from {embed.provider}. Nothing loads from {embed.provider} until you press play.
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {consumable && reader && (
          <div className="rounded-xl border border-border px-4 py-5 md:px-7 md:py-6">
            {reader}
            <div ref={endRef} aria-hidden className="h-px" />
          </div>
        )}

        {link && !reader && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
              embed
                ? "border-transparent px-1 py-0 text-sm text-fg-muted hover:text-fg min-h-10"
                : "border-border-strong bg-panel shadow-xs hover:border-accent"
            )}
          >
            {embed ? (
              <>
                <ExternalLinkIcon className="size-4 shrink-0" />
                Or open it on {embed.provider}
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">
                    {item.kind === "watch" ? "Open the video" : consumable ? "Open the article" : "Open the link"}
                  </span>
                  <span className="block truncate text-xs text-fg-subtle">{host} · opens in a new tab</span>
                </span>
                {opened && consumable ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                    <CheckIcon className="size-3.5" strokeWidth={3} />
                    Opened
                  </span>
                ) : (
                  <ExternalLinkIcon className="size-4 shrink-0 text-fg-subtle" />
                )}
              </>
            )}
          </a>
        )}

        {item.kind === "submit" && (
          <>
            <div className="rounded-xl border border-border bg-bg-subtle/60 px-4 py-4 text-base leading-relaxed whitespace-pre-line md:px-5">
              {item.description}
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border-strong px-3 py-3 text-base has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-subtle/50">
              <Checkbox
                checked={agreed || item.done}
                disabled={item.done}
                onCheckedChange={(c) => setAgreed(c === true)}
                className="mt-0.5 size-5"
              />
              <span>I have read this and I agree to it.</span>
            </label>
          </>
        )}

        {item.done ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckIcon className="size-4" strokeWidth={3} />
            Done. You can re-read it any time.
          </p>
        ) : (
          consumable && (
            <p className="text-xs text-fg-subtle">
              We take your word for it. Nobody is timing you, and an admin can see what you have confirmed.
            </p>
          )
        )}
      </div>

      <StepNav backHref={onPreviewContinue ? null : stepHref(backKey)} hint={blocked}>
        <Button className={primaryStepButton} disabled={busy || Boolean(blocked)} onClick={confirm}>
          {item.done ? "Continue" : busy ? "Saving…" : item.kind === "submit" ? "Agree and continue" : meta.confirm}
          {!busy && <ArrowRightIcon />}
        </Button>
      </StepNav>
    </div>
  );
}

// ——— Optional extras ———

export function ExtrasStep({
  items,
  backKey,
  nextKey,
}: {
  items: (StepItem & { minutes: number | null })[];
  backKey: string;
  nextKey: string;
}) {
  const router = useRouter();
  const [local, setLocal] = React.useState<Record<string, boolean>>({});

  async function toggle(item: StepItem, done: boolean) {
    setLocal((prev) => ({ ...prev, [item.id]: done }));
    const res = await toggleOnboardingTask({ assignmentId: item.assignmentId, taskId: item.id, done });
    if (!res.ok) {
      setLocal((prev) => ({ ...prev, [item.id]: !done }));
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const done = local[item.id] ?? item.done;
          const link = safeHttpUrl(item.resourceUrl)?.toString() ?? null;
          return (
            <li key={item.id} className="rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-start gap-3">
                <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-start gap-3 pt-2">
                  <Checkbox checked={done} onCheckedChange={(c) => toggle(item, c === true)} className="mt-0.5 size-5" />
                  <span className="min-w-0">
                    <span className={cn("block text-base font-medium", done && "text-fg-muted line-through")}>
                      {item.title}
                    </span>
                    <span className="tnum block text-xs text-fg-subtle">
                      {KIND_META[item.kind].label}
                      {item.minutes ? ` · ${item.minutes} min` : ""}
                    </span>
                    {item.description && (
                      <span className="mt-1 block text-sm whitespace-pre-line text-fg-muted">{item.description}</span>
                    )}
                  </span>
                </label>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open “${item.title}” in a new tab`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-md text-fg-subtle outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <ExternalLinkIcon className="size-4" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-fg-muted">
        None of these hold you up. They stay on your Onboarding page, where you can tick them off later.
      </p>
      <StepNav backHref={stepHref(backKey)}>
        <Button asChild className={primaryStepButton}>
          <Link href={stepHref(nextKey)}>
            Continue
            <ArrowRightIcon />
          </Link>
        </Button>
      </StepNav>
    </div>
  );
}

/**
 * The class-schedule step. Never blocks: a member can skip it and the
 * start-of-term reminders will bring them back.
 */
export function ScheduleFlowStep({ backKey, nextKey }: { backKey: string; nextKey: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <ScheduleStep onDone={() => router.push(stepHref(nextKey))} />
      <div className="flex items-center justify-between text-sm">
        <Link href={stepHref(backKey)} className="text-fg-muted hover:text-fg">
          Back
        </Link>
        <Link href={stepHref(nextKey)} className="text-fg-muted hover:text-fg">
          Skip for now
        </Link>
      </div>
    </div>
  );
}
