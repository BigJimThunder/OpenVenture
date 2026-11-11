import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { FileTextIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { aiConfigured } from "@/lib/ai";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getFundingRequest } from "@/lib/queries/reports";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { PrintButton } from "@/components/reports/print-button";
import { ReopenFundingRequest, SendFundingRequest } from "@/components/reports/funding/funding-actions";
import { FundingDocument } from "@/components/reports/funding/funding-document";
import { FundingRequestEditor } from "@/components/reports/funding/funding-request-editor";

export const dynamic = "force-dynamic";

type Props = PageProps<"/reports/funding/[applicationId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = await requireCtx();
  const { applicationId } = await params;
  const view = await getFundingRequest(ctx.org, applicationId, ctx.member.id);
  return { title: view ? `Funding request: ${view.facts.companyName}` : "Funding request" };
}

export default async function FundingRequestPage({ params }: Props) {
  const ctx = await requireCtx();
  const { applicationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) notFound();
  const view = await getFundingRequest(ctx.org, applicationId, ctx.member.id);
  if (!view) notFound();

  const { facts, content, report, status } = view;
  const settings = orgSettings(ctx.org);
  const canContribute = can(ctx.member.role, "contribute");
  const canPartner = can(ctx.member.role, "partnerWork");
  const editing = status === "draft" && canContribute;
  const today = new Date().toISOString();

  const statusLine =
    status === "sent" && report?.sentAt
      ? `Sent to ${report.sentTo?.join(", ") ?? "the approver"} on ${format(report.sentAt, "MMM d, yyyy")}. The numbers are frozen as of ${format(report.finalizedAt ?? report.sentAt, "MMM d")}.`
      : status === "final" && report?.finalizedAt
        ? `Finalized ${format(report.finalizedAt, "MMM d, yyyy")}. The numbers are frozen; it has not been sent yet.`
        : editing
          ? "Most of this is filled in from the application, the memo and the vote. Check it, write what only the club can say, then a partner finalizes it."
          : report
            ? "A draft in progress. The figures are live until a partner finalizes it."
            : "Nobody has started this request yet.";

  return (
    <div className="print:pb-0">
      {/* Page margins for the PDF; a toast still on screen must not print over the page. */}
      <style>{`@media print { @page { margin: 16mm 18mm; } [data-sonner-toaster] { display: none !important; } }`}</style>
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <>
              <Link href="/reports" className="hover:text-fg hover:underline">
                Reports
              </Link>{" "}
              / Funding requests
            </>
          }
          title={
            <span className="flex flex-wrap items-center gap-2">
              {facts.companyName}
              <Badge variant={status === "sent" ? "success" : status === "final" ? "info" : "neutral"}>
                {status === "sent" ? "Sent" : status === "final" ? "Final" : report || editing ? "Draft" : "Not started"}
              </Badge>
            </span>
          }
          description={statusLine}
          actions={
            <>
              <Link
                href={`/pipeline/${applicationId}`}
                className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline max-md:py-2"
              >
                Application
              </Link>
              {status !== "draft" && (
                <>
                  <PrintButton />
                  {canPartner && <ReopenFundingRequest applicationId={applicationId} />}
                  {canPartner && (
                    <SendFundingRequest
                      applicationId={applicationId}
                      companyName={facts.companyName}
                      approverName={settings.reports.approverName}
                      approverEmail={settings.reports.approverEmail}
                      alreadySent={status === "sent"}
                    />
                  )}
                </>
              )}
            </>
          }
        />
      </div>

      {editing ? (
        <FundingRequestEditor
          applicationId={applicationId}
          exists={report !== null}
          facts={facts}
          initialContent={content}
          sources={view.sources}
          ai={!aiConfigured() ? "no_key" : settings.ai.enabled ? "on" : "club_off"}
          today={today}
        />
      ) : report ? (
        <div className="px-3 pb-16 md:px-6 print:p-0">
          <div className="mx-auto max-w-[50rem] rounded-lg border border-border bg-panel px-5 py-7 shadow-sm sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
            <FundingDocument
              facts={facts}
              content={content}
              date={(report.finalizedAt ?? report.updatedAt).toISOString()}
            />
          </div>
        </div>
      ) : (
        <div className="px-4 pb-16 md:px-6">
          <EmptyState
            icon={<FileTextIcon />}
            title="No funding request yet"
            description={`Nobody has started the request for ${facts.companyName}. A member who can contribute starts it from here; you will be able to read it as it takes shape.`}
          />
        </div>
      )}
    </div>
  );
}
