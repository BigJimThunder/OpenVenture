import { and, asc, isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { pipelineStage } from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { calendarToken } from "@/lib/calendar";
import { currentFiscalQuarter } from "@/lib/queries/reports";
import { getPools } from "@/lib/queries/grants";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPoolDialog } from "@/components/grants/new-pool-dialog";
import { StageManager } from "@/components/settings/stage-manager";
import { IngestSettings } from "./ingest-settings";
import { ClubSettings } from "./club-settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireCtx("admin");
  const [pools, stages] = await Promise.all([
    getPools(ctx.org.id),
    db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.orgId, ctx.org.id), isNull(pipelineStage.archivedAt)))
      .orderBy(asc(pipelineStage.position)),
  ]);
  const { fiscalYear } = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);

  return (
    <div className="pb-10">
      <PageHeader title="Settings" description="Club configuration." />
      <div className="flex max-w-2xl flex-col gap-3 px-6">
        <Card>
          <CardHeader>
            <CardTitle>Club</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>Grant pools</CardTitle>
              <CardDescription>One pool per fiscal year; rollover carries what&apos;s left.</CardDescription>
            </div>
            <NewPoolDialog defaultFiscalYear={pools.some((p) => p.fiscalYear === fiscalYear) ? fiscalYear + 1 : fiscalYear} />
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {pools.length === 0 ? (
              <p className="text-fg-muted">No pools yet — create the fiscal-year pool to start granting.</p>
            ) : (
              pools.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span>
                    {p.name}
                    <span className="ml-2 text-xs text-fg-muted">FY{p.fiscalYear}</span>
                  </span>
                  <span className="tnum text-xs text-fg-muted">
                    {formatMoney(p.totalBudget)}
                    {Number(p.rolloverFromPrior) > 0
                      ? ` + ${formatMoney(p.rolloverFromPrior)} rollover`
                      : ""}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline stages</CardTitle>
            <CardDescription>
              Rename, reorder, and set the gates an application must clear to advance. Funnel
              metrics group by stage kind, so renames never break analytics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StageManager stages={stages} />
          </CardContent>
        </Card>

        {ctx.org.ingestSecret && (
          <Card>
            <CardHeader>
              <CardTitle>Calendar feed</CardTitle>
              <CardDescription>
                Subscribe in Google/Apple Calendar — meetings appear automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block truncate rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 font-mono text-xs">
                {process.env.BETTER_AUTH_URL ?? ""}/api/calendar/{calendarToken(ctx.org.ingestSecret)}
              </code>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Application intake</CardTitle>
            <CardDescription>
              Point your website form at this endpoint and applications land in the pipeline
              instantly — no Airtable hop.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IngestSettings
              hasSecret={!!ctx.org.ingestSecret}
              slackWebhookUrl={ctx.org.slackWebhookUrl}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export everything</CardTitle>
            <CardDescription>
              Your data is yours — one click dumps it all, no lock-in. Self-reported
              demographics are aggregate-only by design and never appear in any export.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <ExportLink href="/api/export/json" label="Full JSON dump" />
            <ExportLink href="/api/export/csv/applications" label="Applications CSV" />
            <ExportLink href="/api/export/csv/grants" label="Grants CSV" />
            <ExportLink href="/api/export/csv/members" label="Members CSV" />
            <ExportLink href="/api/export/csv/outcomes" label="Outcomes CSV" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-bg-subtle"
    >
      {label} ↓
    </a>
  );
}
