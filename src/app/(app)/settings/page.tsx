import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { formatDistanceToNow } from "date-fns";
import { DownloadIcon } from "lucide-react";
import { db } from "@/db";
import {
  grant,
  grantPool,
  memo,
  memoTemplate,
  memoTemplateSection,
  notificationLog,
  pipelineStage,
} from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { aiConfigured } from "@/lib/ai";
import { calendarToken } from "@/lib/calendar";
import { defaultFounderEmail, type FounderEmailKind } from "@/lib/founder-emails";
import { summarizePool } from "@/lib/grants/budget";
import { appUrl } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getLookups } from "@/lib/queries/lookups";
import { currentFiscalQuarter } from "@/lib/queries/reports";
import { NoAccess } from "@/components/patterns/no-access";
import { PageHeader } from "@/components/patterns/page-header";
import { CopyField } from "@/components/patterns/form-copy-field";
import { AutoAssignSelect } from "@/components/settings/auto-assign-select";
import { CalendarSection } from "@/components/settings/calendar-section";
import { ClubSettings } from "@/components/settings/club-settings";
import { EmailPreview } from "@/components/settings/email-preview";
import {
  CriteriaManager,
  DealSourceManager,
  SectorManager,
} from "@/components/settings/lookup-sections";
import { PoolManager } from "@/components/settings/pool-manager";
import { PreferenceText } from "@/components/settings/preference-text";
import { ReportSettings } from "@/components/settings/report-settings";
import { PreferenceToggle } from "@/components/settings/preference-toggle";
import { SettingsNav, type SettingsNavItem } from "@/components/settings/settings-nav";
import { SettingsCard, SettingsSection, StatusLine } from "@/components/settings/settings-section";
import { SlackWebhook } from "@/components/settings/slack-webhook";
import { StageManager } from "@/components/settings/stage-manager";
import { StagesReviewed } from "@/components/settings/stages-reviewed";
import { TemplateManager } from "@/components/settings/template-manager";
import { WebhookIntake } from "@/components/settings/webhook-intake";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** Section ids are deep-linked from other screens (/settings#money) — don't rename. */
const SECTIONS: SettingsNavItem[] = [
  { id: "club", label: "Club" },
  { id: "calendar", label: "Calendar" },
  { id: "money", label: "Money" },
  { id: "pipeline", label: "Pipeline" },
  { id: "intake", label: "Intake" },
  { id: "email", label: "Email" },
  { id: "automations", label: "Automations" },
  { id: "reports", label: "Reports" },
  { id: "ai", label: "AI" },
  { id: "templates", label: "Templates" },
  { id: "data", label: "Data" },
];

/** Plain names for the `kind` column of notification_log. */
const NOTIFICATION_LABEL: Record<string, string> = {
  weekly_digest: "Weekly digest",
  sla_nudge: "Stalled-application nudge",
  sla_nudge_email: "Stalled-application nudge",
  vote_reminder: "Vote reminder",
  vote_closed: "Vote closed",
  checkin_reminder: "Grantee check-in reminder",
  checkin_reminder_email: "Grantee check-in reminder",
  intake_assigned: "Application assigned",
  onboarding_invite_reminder: "Onboarding — invite reminder",
  onboarding_nudge: "Onboarding — reminder",
  onboarding_admin_notice: "Onboarding — update to inviter",
  schedule_reminder: "Class schedule reminder",
  schedule_reminder_manual: "Class schedule reminder (sent by an admin)",
  mcp_email_me: "AI connection — email to self",
  mcp_email_member: "AI connection — email to a member",
  mcp_digest: "AI connection — digest",
  founder_received: "Founder email — received",
  founder_declined: "Founder email — declined",
  founder_funded: "Founder email — funded",
};

const notificationLabel = (kind: string) =>
  NOTIFICATION_LABEL[kind] ?? kind.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

const FOUNDER_EMAILS: { kind: FounderEmailKind; label: string; description: string }[] = [
  {
    kind: "received",
    label: "Application received",
    description:
      "Sent to the founder the moment their application arrives, by the hosted form or your own. Says what happens next.",
  },
  {
    kind: "declined",
    label: "Declined",
    description:
      "Sent when the club declines an application. The member recording the decision can read and edit the letter before it goes.",
  },
  {
    kind: "funded",
    label: "Funded",
    description:
      "Sent when the club records a decision to fund. States the amount and that it is a grant, not an investment.",
  },
];

export default async function SettingsPage() {
  const ctx = await requireCtx();
  if (!can(ctx.member.role, "manageClub")) return <NoAccess />;

  const settings = orgSettings(ctx.org);
  const [pools, poolGrants, stages, lookups, templates, templateSections, recentlySent] =
    await Promise.all([
      db
        .select()
        .from(grantPool)
        .where(eq(grantPool.orgId, ctx.org.id))
        .orderBy(desc(grantPool.fiscalYear), desc(grantPool.createdAt)),
      db
        .select({ poolId: grant.poolId, status: grant.status, amountAwarded: grant.amountAwarded })
        .from(grant)
        .where(eq(grant.orgId, ctx.org.id)),
      db
        .select()
        .from(pipelineStage)
        .where(and(eq(pipelineStage.orgId, ctx.org.id), isNull(pipelineStage.archivedAt)))
        .orderBy(asc(pipelineStage.position)),
      getLookups(ctx.org.id),
      db
        .select({
          id: memoTemplate.id,
          name: memoTemplate.name,
          description: memoTemplate.description,
          isDefault: memoTemplate.isDefault,
          archivedAt: memoTemplate.archivedAt,
          memoCount: sql<number>`(
            select count(*)::int from ${memo} where ${memo}."template_id" = ${memoTemplate}."id"
          )`,
        })
        .from(memoTemplate)
        .where(eq(memoTemplate.orgId, ctx.org.id))
        .orderBy(desc(memoTemplate.isDefault), asc(memoTemplate.name)),
      db
        .select({
          id: memoTemplateSection.id,
          templateId: memoTemplateSection.templateId,
          title: memoTemplateSection.title,
          guidance: memoTemplateSection.guidance,
          required: memoTemplateSection.required,
        })
        .from(memoTemplateSection)
        .innerJoin(memoTemplate, eq(memoTemplateSection.templateId, memoTemplate.id))
        .where(eq(memoTemplate.orgId, ctx.org.id))
        .orderBy(asc(memoTemplateSection.position), asc(memoTemplateSection.title)),
      db
        .select()
        .from(notificationLog)
        .where(eq(notificationLog.orgId, ctx.org.id))
        .orderBy(desc(notificationLog.sentAt))
        .limit(20),
    ]);

  const { fiscalYear } = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const emailFrom = process.env.EMAIL_FROM ?? null;
  const aiKey = aiConfigured();
  const replyToShown = settings.founderEmails.replyTo || "the application owner's email";
  const applyUrl = appUrl("/apply");

  return (
    <div className="pb-16">
      <PageHeader
        title="Settings"
        description="How the club runs: its budget, its process, and what the app does on its own."
      />
      <div className="px-4 md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8 md:px-6">
        <SettingsNav items={SECTIONS} />

        <div className="flex max-w-3xl min-w-0 flex-col gap-10 pt-5 md:pt-0">
          <SettingsSection
            id="club"
            title="Club"
            description="The name on every screen and email, who may sign in, and the calendar the budget follows."
          >
            <SettingsCard>
              <ClubSettings
                org={{
                  name: ctx.org.name,
                  schoolName: ctx.org.schoolName,
                  allowedEmailDomains: ctx.org.allowedEmailDomains,
                  fiscalYearStartMonth: ctx.org.fiscalYearStartMonth,
                  timezone: ctx.org.timezone,
                }}
                timezones={Intl.supportedValuesOf("timeZone")}
              />
            </SettingsCard>
          </SettingsSection>

          <CalendarSection org={ctx.org} />

          <SettingsSection
            id="money"
            title="Money"
            description="Grant pools: one budget per fiscal year. Remaining budget is derived from the grants, and a grant that would overdraw its pool can't be approved."
          >
            <PoolManager
              suggestedFiscalYear={
                pools.some((p) => p.fiscalYear === fiscalYear) ? fiscalYear + 1 : fiscalYear
              }
              pools={pools.map((p) => {
                const rows = poolGrants.filter((g) => g.poolId === p.id);
                return {
                  id: p.id,
                  name: p.name,
                  fiscalYear: p.fiscalYear,
                  totalBudget: p.totalBudget,
                  rolloverFromPrior: p.rolloverFromPrior,
                  notes: p.notes,
                  linkedGrants: rows.length,
                  ...summarizePool(p, rows),
                };
              })}
            />
          </SettingsSection>

          <SettingsSection
            id="pipeline"
            title="Pipeline"
            description="The stages an application moves through, what it is scored on, and the lists members pick from."
          >
            <StagesReviewed reviewed={settings.setup.stagesReviewed} />
            <SettingsCard
              title="Stages"
              description="Rename, reorder, and set the rules an application must clear to advance. Reports group by stage kind, so a rename never breaks them."
            >
              <StageManager stages={stages} />
            </SettingsCard>
            <SettingsCard
              title="Screening criteria"
              description="The 1–5 scorecard members fill in during screening. Archiving a criterion keeps the scores already given."
            >
              <CriteriaManager
                items={lookups.criteria.map((c) => ({ id: c.id, label: c.label, hint: c.description }))}
              />
            </SettingsCard>
            <SettingsCard title="Sectors" description="Tags for what a company does. Used in filters and the LP letter.">
              <SectorManager items={lookups.sectors.map((s) => ({ id: s.id, label: s.name }))} />
            </SettingsCard>
            <SettingsCard
              title="Deal sources"
              description="Where applications come from. Powers the sourcing breakdown, so keep the list short."
            >
              <DealSourceManager
                items={lookups.sources.map((s) => ({ id: s.id, label: s.name, hint: s.kind }))}
              />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection
            id="intake"
            title="Intake"
            description="How applications reach the pipeline. Use the hosted form, connect a form you already have, or both."
          >
            <SettingsCard
              title="Hosted application form"
              description="A public page founders fill in. Submissions land in the first pipeline stage with an owner assigned."
            >
              <div className="divide-y divide-border">
                <PreferenceToggle
                  section="apply"
                  field="enabled"
                  checked={settings.apply.enabled}
                  label="Accept applications"
                  description="On: the form is open at the link below. Off: the same link shows your closed message instead, and nothing can be submitted."
                />
                <div className="flex flex-col gap-1.5 py-3">
                  <span className="text-sm font-medium">Public link</span>
                  <CopyField value={applyUrl} label="Form link" openHref={applyUrl} />
                  <p className="text-xs text-fg-subtle">
                    Put this on your website, in your newsletter, on a poster QR code.
                  </p>
                </div>
                <PreferenceToggle
                  section="apply"
                  field="askDemographics"
                  checked={settings.apply.askDemographics}
                  label="Ask the optional demographic questions"
                  description="Four optional questions at the end of the form. Answers are stored apart from the application and only ever shown as club-wide totals — never per founder, and never in an export."
                />
                <div className="flex flex-col gap-4 pt-4">
                  <PreferenceText
                    section="apply"
                    field="intro"
                    value={settings.apply.intro}
                    label="Welcome text"
                    hint="Shown above the form. Say who should apply and how much you grant."
                    placeholder="We give grants of $200–$4,000 to student founders at…"
                    maxLength={1200}
                    multiline
                  />
                  <PreferenceText
                    section="apply"
                    field="closedMessage"
                    value={settings.apply.closedMessage}
                    label="Closed message"
                    hint="Shown instead of the form while applications are off."
                    placeholder="Applications reopen in September."
                    maxLength={600}
                    multiline
                  />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Connect your own form"
              description="Already have a form on your website? Have it POST to this signed endpoint and submissions land in the pipeline the same way."
            >
              <WebhookIntake
                endpoint={appUrl("/api/ingest/application")}
                hasSecret={Boolean(ctx.org.ingestSecret)}
              />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection
            id="email"
            title="Email"
            description="Whether the app can send mail at all, and which emails founders get from the club."
          >
            <SettingsCard title="Delivery">
              {emailConfigured ? (
                <StatusLine ok>
                  <p>
                    Email is connected.{" "}
                    {emailFrom ? (
                      <>
                        Messages are sent from <span className="font-medium">{emailFrom}</span>.
                      </>
                    ) : (
                      <span className="text-fg-muted">
                        No sender address is set, so messages come from Resend&apos;s shared test address —
                        set <code className="font-mono text-xs">EMAIL_FROM</code> before inviting real people.
                      </span>
                    )}
                  </p>
                </StatusLine>
              ) : (
                <div className="flex flex-col gap-3">
                  <StatusLine ok={false}>
                    <p>
                      Email isn&apos;t connected. Sign-in links, invites, reminders and founder emails are
                      only printed to the server log — nobody receives them.
                    </p>
                  </StatusLine>
                  <ol className="ml-4.5 flex list-decimal flex-col gap-1.5 pl-4 text-sm text-fg-muted">
                    <li>
                      Create a free account at <span className="font-medium text-fg">resend.com</span> and
                      verify the domain you want to send from.
                    </li>
                    <li>
                      Create an API key there. In your hosting dashboard (Vercel → Project → Settings →
                      Environment Variables) add it as{" "}
                      <code className="font-mono text-xs text-fg">RESEND_API_KEY</code>.
                    </li>
                    <li>
                      Add <code className="font-mono text-xs text-fg">EMAIL_FROM</code>, e.g.{" "}
                      <code className="font-mono text-xs text-fg">{ctx.org.name} &lt;grants@yourclub.edu&gt;</code>.
                    </li>
                    <li>Redeploy. This card turns green when the key is picked up.</li>
                  </ol>
                </div>
              )}
            </SettingsCard>

            <SettingsCard
              title="Emails to founders"
              description="Sent on the club's behalf. Each one goes out at most once per application, however many times a stage is re-saved."
            >
              <div className="divide-y divide-border">
                {FOUNDER_EMAILS.map((e) => {
                  const sample = defaultFounderEmail(e.kind, {
                    orgName: ctx.org.name,
                    companyName: "Lumen Labs",
                    firstName: "Ada",
                    amount: e.kind === "funded" ? "1500" : null,
                  });
                  return (
                    <PreferenceToggle
                      key={e.kind}
                      section="founderEmails"
                      field={e.kind}
                      checked={settings.founderEmails[e.kind]}
                      label={e.label}
                      description={e.description}
                      trailing={
                        <EmailPreview
                          name={`${e.label} email`}
                          subject={sample.subject}
                          body={sample.body}
                          replyTo={replyToShown}
                        />
                      }
                    />
                  );
                })}
                <div className="pt-4">
                  <PreferenceText
                    section="founderEmails"
                    field="replyTo"
                    value={settings.founderEmails.replyTo}
                    label="Reply-to address"
                    hint="Where a founder's reply lands. Leave empty to use the application owner's own email."
                    placeholder="grants@yourclub.edu"
                    maxLength={200}
                    type="email"
                  />
                </div>
              </div>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection
            id="automations"
            title="Automations"
            description="What the app does without being asked. A daily job runs these; each message is sent once, never twice."
          >
            <SettingsCard>
              {!emailConfigured && (
                <p className="mb-3 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
                  Email isn&apos;t connected, so the reminders below are logged but not delivered.{" "}
                  <a href="#email" className="underline underline-offset-2">
                    Connect email
                  </a>
                </p>
              )}
              <div className="divide-y divide-border">
                <PreferenceToggle
                  section="automation"
                  field="weeklyDigest"
                  checked={settings.automation.weeklyDigest}
                  label="Monday digest"
                  description="Every Monday morning, each active member gets one email: their open applications, votes waiting on them, overdue action items and the next meeting. Skipped for a member with nothing waiting in a quiet week."
                />
                <PreferenceToggle
                  section="automation"
                  field="slaNudges"
                  checked={settings.automation.slaNudges}
                  label="Stalled-application nudges"
                  description="When an application sits in a stage longer than that stage's day limit, its owner gets a nudge. With no owner, the admins do. One nudge per stay in a stage, not one a day."
                />
                <PreferenceToggle
                  section="automation"
                  field="voteReminders"
                  checked={settings.automation.voteReminders}
                  label="Vote reminders"
                  description="About a day before a vote closes, members who are eligible and haven't voted get a reminder. The email never says how anyone else voted."
                />
                <PreferenceToggle
                  section="automation"
                  field="autoCloseVotes"
                  checked={settings.automation.autoCloseVotes}
                  label="Close votes at their deadline"
                  description="A vote that passes its closing time is closed by the daily job, so late ballots can't trickle in. Results stay hidden until a partner reveals them."
                />
                <PreferenceToggle
                  section="automation"
                  field="checkinReminders"
                  checked={settings.automation.checkinReminders}
                  label="Grantee check-in reminders"
                  description="When a funded company has had no outcome update for 90 days, the application's owner is asked to check in and record how it is going."
                />
                <PreferenceToggle
                  section="automation"
                  field="onboardingNudges"
                  checked={settings.automation.onboardingNudges}
                  label="Onboarding reminders"
                  description="An invited member who hasn't signed in after 3 days gets one reminder. Members with required onboarding items outstanding are nudged before the due date and when overdue, at most once every 3 days. Whoever invited them hears when they finish or fall a week behind."
                />
                <PreferenceToggle
                  section="onboarding"
                  field="blockUntilComplete"
                  checked={settings.onboarding.blockUntilComplete}
                  label="Require onboarding before using the app"
                  description="New members must finish every required onboarding item before they can open the rest of the app. Admins can always skip. Turn this off to let members in once their details are confirmed; required items then stay on their list and in the reminders."
                />
                <AutoAssignSelect value={settings.automation.autoAssign} />
              </div>
            </SettingsCard>

            <SettingsCard>
              <SlackWebhook url={ctx.org.slackWebhookUrl} />
            </SettingsCard>

            <SettingsCard
              title="Recently sent"
              description="The last 20 things the app sent or did on its own — proof the automations are running."
            >
              {recentlySent.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  Nothing yet. The first entries appear after the daily job runs, or when an application
                  arrives.
                </p>
              ) : (
                <ul className="-my-2 divide-y divide-border">
                  {recentlySent.map((n) => (
                    <li key={n.id} className="flex items-baseline gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{notificationLabel(n.kind)}</span>
                          {n.recipient && (
                            <span className="min-w-0 truncate text-xs text-fg-muted">to {n.recipient}</span>
                          )}
                        </div>
                        {n.summary && <p className="truncate text-xs text-fg-subtle">{n.summary}</p>}
                      </div>
                      <time
                        dateTime={n.sentAt.toISOString()}
                        className="tnum shrink-0 text-xs text-fg-subtle"
                      >
                        {formatDistanceToNow(n.sentAt, { addSuffix: true })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </SettingsCard>
          </SettingsSection>

          <SettingsSection
            id="reports"
            title="Reports"
            description="Where funding requests and letters go, and the words they borrow. The reports themselves live under Reports."
          >
            <ReportSettings reports={settings.reports} />
          </SettingsSection>

          <SettingsSection
            id="ai"
            title="AI"
            description="Optional drafting help. Everything else in the app works the same with it off."
          >
            <SettingsCard>
              <div className="flex flex-col gap-4">
                <StatusLine ok={aiKey}>
                  {aiKey ? (
                    <p>An Anthropic API key is set on this deployment.</p>
                  ) : (
                    <p>
                      No API key is set, so AI controls are hidden across the app. To enable them, add{" "}
                      <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to your hosting
                      environment variables and redeploy.
                    </p>
                  )}
                </StatusLine>
                <div className="border-t border-border pt-3">
                  <PreferenceToggle
                    section="ai"
                    field="enabled"
                    checked={settings.ai.enabled}
                    label="Allow AI drafts"
                    description="The club-wide switch. Off hides every AI button for every member, even with a key set."
                  />
                </div>
                <div className="border-t border-border pt-4">
                  <h4 className="text-xs font-medium text-fg-muted">What it does when it is on</h4>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                    <li>
                      <span className="font-medium">Memo first draft.</span>{" "}
                      <span className="text-fg-muted">
                        Fills the empty sections of a memo from the application, averaged screening
                        scores, coffee-chat debriefs and notes. It never overwrites what a member wrote.
                      </span>
                    </li>
                    <li>
                      <span className="font-medium">Screening brief and duplicate check.</span>{" "}
                      <span className="text-fg-muted">
                        A short summary of a new application and a flag when it looks like one you
                        have already seen.
                      </span>
                    </li>
                    <li>
                      <span className="font-medium">Decline letter.</span>{" "}
                      <span className="text-fg-muted">
                        A draft reply to the founder that the declining member edits before it sends.
                      </span>
                    </li>
                  </ul>
                  <div className="mt-4 rounded-md border border-border bg-bg-subtle px-3 py-2.5 text-sm">
                    <p className="font-medium">Always a draft</p>
                    <p className="mt-0.5 text-fg-muted">
                      AI output is never saved as a decision, a vote or a sent email on its own. A
                      member reads and edits it first, and AI-written memo sections stay labeled until
                      someone does. Votes and founder demographics are never sent to the model.
                    </p>
                  </div>
                </div>
              </div>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection
            id="templates"
            title="Templates"
            description="The sections every memo starts with. A consistent structure is what makes two memos comparable on vote night."
          >
            <TemplateManager
              templates={templates.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                isDefault: t.isDefault,
                archived: Boolean(t.archivedAt),
                memoCount: t.memoCount,
                sections: templateSections
                  .filter((s) => s.templateId === t.id)
                  .map(({ id, title, guidance, required }) => ({ id, title, guidance, required })),
              }))}
            />
          </SettingsSection>

          <SettingsSection
            id="data"
            title="Data"
            description="Your records are yours. Subscribe to the calendar, or take everything with you."
          >
            <SettingsCard
              title="Calendar feed"
              description="Subscribe once in Google or Apple Calendar and every club meeting shows up, and stays up to date."
            >
              {ctx.org.ingestSecret ? (
                <CopyField
                  value={appUrl(`/api/calendar/${calendarToken(ctx.org.ingestSecret)}`)}
                  label="Calendar feed"
                />
              ) : (
                <p className="text-sm text-fg-muted">
                  The feed link is derived from the club&apos;s signing secret, and there isn&apos;t one yet.{" "}
                  <a href="#intake" className="text-accent underline-offset-2 hover:underline">
                    Generate it under Intake
                  </a>{" "}
                  and the link appears here.
                </p>
              )}
            </SettingsCard>

            <SettingsCard
              title="Export"
              description="One click each, no lock-in. Founder demographics are aggregate-only by design and are not in any export."
            >
              <div className="flex flex-wrap gap-2">
                <ExportLink href="/api/export/json" label="Everything (JSON)" />
                <ExportLink href="/api/export/csv/applications" label="Applications (CSV)" />
                <ExportLink href="/api/export/csv/grants" label="Grants (CSV)" />
                <ExportLink href="/api/export/csv/members" label="Members (CSV)" />
                <ExportLink href="/api/export/csv/outcomes" label="Outcomes (CSV)" />
              </div>
            </SettingsCard>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-sm font-medium shadow-xs transition-colors hover:border-border-strong hover:bg-bg-subtle max-md:h-10"
    >
      <DownloadIcon className="size-3.5 text-fg-subtle" />
      {label}
    </a>
  );
}
