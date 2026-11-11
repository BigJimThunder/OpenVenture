import { z } from "zod";
import type { Ctx } from "@/lib/actions/context";
import { ActionError, authedAction } from "@/lib/actions/safe-action";
import { appUrl } from "@/lib/notify";
import { currentFiscalQuarter } from "@/lib/queries/reports";
import { ensureReport, periodKey, type ReportRow } from "@/lib/reports/store";
import type { ToolInput } from "./catalog";
import { resolveApplication, ToolError } from "./resolve";

/**
 * Report drafts for assistants. A tool here makes sure the draft exists and
 * hands back the URL of its editor; the numbers are derived when the member
 * opens it, and reviewing, finalizing and sending stay in the app.
 */

export function reportUrl(r: Pick<ReportRow, "kind" | "periodKey" | "applicationId">): string {
  return appUrl("/reports");
}

const ensureDraft = authedAction({
  minRole: "partner",
  input: z.object({
    kind: z.enum(["funding_request", "quarterly", "annual"]),
    key: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    applicationId: z.string().uuid().optional(),
  }),
  handler: async (input, ctx) => {
    const before = Date.now();
    const row = await ensureReport({
      orgId: ctx.org.id,
      kind: input.kind,
      key: input.key,
      title: input.title,
      memberId: ctx.member.id,
      applicationId: input.applicationId,
    });
    if (row.archivedAt) throw new ActionError("That report was archived. Restore it in the app first.");
    const created = row.createdAt.getTime() >= before - 1000 && row.createdByMemberId === ctx.member.id;
    return {
      data: { row, created },
      activity: created
        ? {
            verb: "report.drafted",
            entityType: "report",
            entityId: row.id,
            entityLabel: row.title,
            summary: `${ctx.member.displayName} started ${row.title} through their assistant`,
          }
        : undefined,
    };
  },
});

async function draft(input: Parameters<typeof ensureDraft>[0]) {
  const result = await ensureDraft(input);
  if (!result.ok) throw new ToolError(result.error);
  const { row, created } = result.data;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    created,
    url: reportUrl(row),
    note:
      row.status === "draft"
        ? "The draft is in the app. The member reviews it, fills any [add: …] prompts, and sends it from there."
        : `This report is already ${row.status}. Nothing was changed.`,
  };
}

export async function draftFundingRequest(input: ToolInput<"draft_funding_request">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  return draft({
    kind: "funding_request",
    key: periodKey.fundingRequest(app.id),
    title: `Funding request: ${app.companyName}`,
    applicationId: app.id,
  });
}

export async function draftQuarterlyLetter(input: ToolInput<"draft_quarterly_letter">, ctx: Ctx) {
  const current = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
  const fiscalYear = input.fiscal_year ?? current.fiscalYear;
  const quarter = input.quarter ?? current.quarter;
  return draft({
    kind: "quarterly",
    key: periodKey.quarterly(fiscalYear, quarter),
    title: `Quarterly letter, FY${fiscalYear} Q${quarter}`,
  });
}

export async function draftAnnualReport(input: ToolInput<"draft_annual_report">, ctx: Ctx) {
  const fiscalYear = input.fiscal_year ?? currentFiscalQuarter(ctx.org.fiscalYearStartMonth).fiscalYear;
  return draft({
    kind: "annual",
    key: periodKey.annual(fiscalYear),
    title: `Annual report, FY${fiscalYear}`,
  });
}
