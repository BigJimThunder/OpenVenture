import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCtx } from "@/lib/actions/context";
import { aiConfigured } from "@/lib/ai";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getAnnualMaterials, getAnnualReportView } from "@/lib/queries/annual-report";
import { fiscalYearLabel, fiscalYearPhase } from "@/lib/reports/annual";
import { AnnualBuilder } from "@/components/reports/annual/builder";
import { StartAnnualReport } from "@/components/reports/annual/start-report";

export const metadata: Metadata = { title: "Annual report" };
export const dynamic = "force-dynamic";

export default async function AnnualReportBuilderPage({ params }: { params: Promise<{ fy: string }> }) {
  const ctx = await requireCtx();
  const fiscalYear = Number((await params).fy);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) notFound();

  const view = await getAnnualReportView(ctx.org, fiscalYear);
  // Read-only members and anyone opening a locked report get the reader.
  if (view && (view.report.status !== "draft" || !can(ctx.member.role, "contribute"))) {
    redirect(`/reports/annual/${fiscalYear}/view`);
  }

  if (!view) {
    const phase = fiscalYearPhase(fiscalYear, ctx.org.fiscalYearStartMonth);
    return (
      <StartAnnualReport
        fiscalYear={fiscalYear}
        label={fiscalYearLabel(fiscalYear, ctx.org.fiscalYearStartMonth)}
        inProgress={phase === "running"}
        notStarted={phase === "upcoming"}
      />
    );
  }

  const materials = await getAnnualMaterials(ctx.org.id, ctx.member.id, view.derived.companies);
  return (
    <AnnualBuilder
      reportId={view.report.id}
      fiscalYear={fiscalYear}
      initialContent={view.content}
      derived={view.derived}
      materials={materials}
      viewerId={ctx.member.id}
      canEditAll={can(ctx.member.role, "partnerWork")}
      aiEnabled={aiConfigured() && orgSettings(ctx.org).ai.enabled}
    />
  );
}
