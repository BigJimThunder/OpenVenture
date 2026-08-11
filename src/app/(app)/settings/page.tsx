import { requireCtx } from "@/lib/actions/context";
import { calendarToken } from "@/lib/calendar";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IngestSettings } from "./ingest-settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireCtx("admin");

  return (
    <div className="pb-10">
      <PageHeader
        title="Settings"
        description="Club configuration. Stages, criteria, templates, and members UIs land with their modules."
      />
      <div className="flex max-w-2xl flex-col gap-3 px-6">
        <Card>
          <CardHeader>
            <CardTitle>Club</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">Name</span>
              <span>{ctx.org.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">School</span>
              <span>{ctx.org.schoolName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Sign-in restricted to</span>
              <span>
                {ctx.org.allowedEmailDomains.length > 0 ? (
                  ctx.org.allowedEmailDomains.map((d) => (
                    <Badge key={d} variant="neutral" className="ml-1">
                      @{d}
                    </Badge>
                  ))
                ) : (
                  "any domain"
                )}
              </span>
            </div>
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
