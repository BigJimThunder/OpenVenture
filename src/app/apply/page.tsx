import type { Metadata } from "next";
import Link from "next/link";
import { loadSoleOrg } from "@/lib/intake";
import { orgSettings } from "@/lib/org-settings";
import { initials } from "@/lib/utils";
import { ApplyForm } from "./apply-form";
import { issueFormToken } from "./guard";

/**
 * The club's public front door for founders: a hosted application form, no
 * account needed. Switched on in Settings → Intake; when it is off (or the
 * club is not set up yet) founders get a plain "not right now" page instead
 * of a dead link.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const org = await loadSoleOrg();
  return {
    title: org ? `Apply · ${org.name}` : "Apply",
    description: org
      ? `Apply for a grant from ${org.name}. No equity, nothing to pay back.`
      : undefined,
  };
}

function Shell({ orgName, schoolName, children }: { orgName: string; schoolName?: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-chrome">
      <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
        <header className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-fg shadow-xs"
          >
            {initials(orgName) || "OV"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{orgName}</div>
            {schoolName && <div className="truncate text-xs text-fg-muted">{schoolName}</div>}
          </div>
        </header>
        <main className="flex-1 pt-8 sm:pt-10">{children}</main>
        <footer className="pt-10 text-center text-xs text-fg-subtle">
          Run on{" "}
          <Link href="/" className="underline-offset-2 hover:text-fg-muted hover:underline">
            OpenVenture
          </Link>
          , open-source software for student grant clubs.{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-fg-muted">
            Privacy
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default async function ApplyPage() {
  const org = await loadSoleOrg();
  if (!org) {
    return (
      <Shell orgName="OpenVenture">
        <Closed title="This club isn't set up yet" message="Check back soon." />
      </Shell>
    );
  }

  const { apply, founderEmails } = orgSettings(org);
  if (!apply.enabled) {
    return (
      <Shell orgName={org.name} schoolName={org.schoolName}>
        <Closed
          title="We're not taking applications right now"
          message={
            apply.closedMessage ||
            "Applications open again next term. If you know someone in the club, they can tell you when."
          }
        />
      </Shell>
    );
  }

  const intro =
    apply.intro ||
    `${org.name} gives small grants to student founders${
      org.schoolName ? ` at ${org.schoolName}` : ""
    }. Tell us what you're building and what the money would unlock.`;

  return (
    <Shell orgName={org.name} schoolName={org.schoolName}>
      <h1 className="text-xl font-semibold tracking-tight sm:text-[1.75rem] sm:leading-tight">
        Apply for a grant
      </h1>
      <p className="mt-3 max-w-xl whitespace-pre-line text-base leading-relaxed text-fg-muted">{intro}</p>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg-muted">
        {["No equity taken", "Nothing to pay back", "About ten minutes"].map((fact) => (
          <li key={fact} className="flex items-center gap-2">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {fact}
          </li>
        ))}
      </ul>
      <ApplyForm
        token={issueFormToken()}
        orgName={org.name}
        schoolName={org.schoolName}
        askDemographics={apply.askDemographics}
        sendsConfirmation={founderEmails.received}
      />
    </Shell>
  );
}

function Closed({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-6 shadow-xs sm:p-8">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-prose whitespace-pre-line text-base leading-relaxed text-fg-muted">
        {message}
      </p>
    </div>
  );
}
