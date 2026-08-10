import { requireCtx } from "@/lib/actions/context";
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
      </div>
    </div>
  );
}
