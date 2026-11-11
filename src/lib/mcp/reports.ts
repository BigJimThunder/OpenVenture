import type { Ctx } from "@/lib/actions/context";
import { startAnnualReport } from "@/lib/actions/annual-report";
import { startFundingRequest } from "@/lib/actions/funding-request";
import { saveQuarterlyLetter } from "@/lib/actions/reports";
import type { ActionResult } from "@/lib/actions/safe-action";
import { appUrl } from "@/lib/notify";
import { currentFiscalQuarter } from "@/lib/queries/reports";
import { currentFiscalYear } from "@/lib/reports/annual";
import { getReport, periodKey, type ReportRow } from "@/lib/reports/store";
import type { ToolInput } from "./catalog";
import { resolveApplication, ToolError } from "./resolve";

/**
 * Report drafts for assistants. Each tool makes sure the draft exists — by
 * calling the action the "Start" button in the app calls, so the draft arrives
 * prefilled the same way — and hands back the URL of its editor. Reviewing,
 * finalizing and sending stay in the app, with a person.
 */

/** Where a report opens in the app. Mirrors the routes under /reports. */
export function reportUrl(r: Pick<ReportRow, "kind" | "periodKey" | "applicationId">): string {
  if (r.kind === "funding_request") {
    return appUrl(`/reports/funding/${r.applicationId ?? r.periodKey}`);
  }
  if (r.kind === "quarterly") {
    const m = /^FY(\d{4})-Q([1-4])$/.exec(r.periodKey);
    return appUrl(m ? `/reports/quarterly?fy=${m[1]}&q=${m[2]}` : "/reports/quarterly");
  }
  const m = /^FY(\d{4})$/.exec(r.periodKey);
  return appUrl(m ? `/reports/annual/${m[1]}` : "/reports/annual");
}

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ToolError(result.error);
  return result.data;
}

function describe(row: ReportRow, created: boolean) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    created,
    url: reportUrl(row),
    note:
      row.status === "draft"
        ? "The draft is in the app. The member reviews it, fills any [add: …] prompts, and finalizes and sends it from there."
        : `This report is already ${row.status}. Nothing was changed.`,
  };
}

/**
 * Return the report if it exists; otherwise run `start` (the app's own
 * action, which checks the role and writes the activity log) and read it back.
 * Looking first keeps a repeat call from re-running the prefill or logging a
 * second "started".
 */
async function ensureDraft(ctx: Ctx, kind: ReportRow["kind"], key: string, start: () => Promise<void>) {
  const existing = await getReport(ctx.org.id, kind, key);
  if (existing) return describe(existing, false);
  await start();
  const row = await getReport(ctx.org.id, kind, key);
  if (!row) throw new ToolError("The draft could not be created. Start it from the Reports page instead.");
  return describe(row, true);
}

export async function draftFundingRequest(input: ToolInput<"draft_funding_request">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  return ensureDraft(ctx, "funding_request", periodKey.fundingRequest(app.id), async () => {
    unwrap(await startFundingRequest({ applicationId: app.id }));
  });
}

export async function draftQuarterlyLetter(input: ToolInput<"draft_quarterly_letter">, ctx: Ctx) {
  const current = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
  const fiscalYear = input.fiscal_year ?? current.fiscalYear;
  const quarter = input.quarter ?? current.quarter;
  return ensureDraft(ctx, "quarterly", periodKey.quarterly(fiscalYear, quarter), async () => {
    // The letter is created by its first save; an empty patch creates it and writes nothing else.
    unwrap(await saveQuarterlyLetter({ fiscalYear, quarter, patch: {} }));
  });
}

export async function draftAnnualReport(input: ToolInput<"draft_annual_report">, ctx: Ctx) {
  const fiscalYear = input.fiscal_year ?? currentFiscalYear(ctx.org.fiscalYearStartMonth);
  return ensureDraft(ctx, "annual", periodKey.annual(fiscalYear), async () => {
    unwrap(await startAnnualReport({ fiscalYear }));
  });
}
