"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { intakeSchema, loadSoleOrg, receiveApplication } from "@/lib/intake";
import { orgSettings } from "@/lib/org-settings";
import { formatRef } from "@/lib/refs";
import {
  checkFormToken,
  checkRateLimit,
  clientIp,
  hashIp,
  issueFormToken,
  recordAttempt,
} from "./guard";
import { GENDER_OPTIONS, RACE_OPTIONS, TEAM_MIX_OPTIONS } from "./options";

/**
 * The hosted application form's only mutation. Public by design — a founder
 * has no account — so it does not go through `authedAction`. Everything the
 * browser sends is re-validated here, the club's "form is open" switch is
 * re-checked, and the only thing sent back is a confirmation ref.
 */

export type ApplyState =
  | { status: "idle"; token: string }
  | {
      status: "error";
      token: string;
      /** Form-level problem (rate limit, closed form). */
      message?: string;
      fieldErrors: Record<string, string>;
      /** Echoed back so a failed submit never costs the founder their answers. */
      values: Record<string, string>;
    }
  | { status: "done"; ref: string; email: string; companyName: string; emailed: boolean };

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]];

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <S extends z.ZodType>(schema: S) => z.preprocess(blankToUndefined, schema.optional());
const yesNo = optional(z.enum(["yes", "no"])).transform((v) => (v == null ? undefined : v === "yes"));

const formSchema = z.object({
  companyName: z.string().trim().min(1, "Tell us what it's called").max(120, "Keep it under 120 characters"),
  website: optional(z.string().trim().max(200, "That link is too long")),
  pitchSummary: z
    .string()
    .trim()
    .min(30, "A few sentences, please — at least 30 characters")
    .max(5000, "Keep it under 5,000 characters"),
  amountRequested: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[$,\s]/g, "") : v),
    z.coerce
      .number({ error: "Enter an amount in dollars" })
      .min(1, "Enter an amount in dollars")
      .max(1_000_000, "That's more than we can consider")
  ),
  useOfFunds: z
    .string()
    .trim()
    .min(20, "Be specific — at least 20 characters")
    .max(5000, "Keep it under 5,000 characters"),
  applicantName: z.string().trim().min(2, "Your name").max(120),
  applicantEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(200)),
  school: optional(z.string().trim().max(120)),
  department: optional(z.string().trim().max(120)),
  major: optional(z.string().trim().max(120)),
  classYear: optional(
    z.coerce
      .number({ error: "A four-digit year" })
      .int("A four-digit year")
      .min(2000, "A four-digit year")
      .max(2100, "A four-digit year")
  ),
  teamSize: z.coerce
    .number({ error: "How many people, including you" })
    .int("A whole number")
    .min(1, "At least one — you")
    .max(50, "That's a big team — 50 at most"),
  teamStudentMix: optional(z.enum(values(TEAM_MIX_OPTIONS))),
  howHeard: optional(z.string().trim().max(500)),
  gender: optional(z.enum(values(GENDER_OPTIONS))),
  raceEthnicity: optional(z.enum(values(RACE_OPTIONS))),
  firstGeneration: yesNo,
  international: yesNo,
  // A checkbox: present ("yes") only when ticked.
  consent: z.literal("yes", { error: "Tick the box to confirm you've read how your information is handled" }),
});

const FIELDS = Object.keys(formSchema.shape);

function fail(
  token: string,
  echoed: Record<string, string>,
  problem: { message?: string; fieldErrors?: Record<string, string> }
): ApplyState {
  return { status: "error", token, values: echoed, fieldErrors: problem.fieldErrors ?? {}, message: problem.message };
}

export async function submitApplication(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const echoed: Record<string, string> = {};
  for (const name of FIELDS) {
    const value = formData.get(name);
    if (typeof value === "string") echoed[name] = value.slice(0, 6000);
  }
  const token = String(formData.get("t") ?? "");

  const org = await loadSoleOrg();
  const settings = org ? orgSettings(org) : null;
  if (!org || !settings?.apply.enabled) {
    return fail(token, echoed, { message: "Applications are closed right now." });
  }

  // Honeypot: people never see this field. Answer exactly as a success would,
  // so a bot learns nothing, and write nothing.
  if (String(formData.get("nickname") ?? "").trim() !== "") {
    return {
      status: "done",
      ref: formatRef("application", 0),
      email: echoed.applicantEmail ?? "",
      companyName: echoed.companyName ?? "",
      emailed: false,
    };
  }

  const parsed = formSchema.safeParse(echoed);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0] ?? "");
      if (name && !fieldErrors[name]) fieldErrors[name] = issue.message;
    }
    return fail(token, echoed, { fieldErrors });
  }
  const form = parsed.data;

  const timing = checkFormToken(token);
  if (timing === "too_fast") {
    return fail(token, echoed, {
      message: "That was quick. Give your answers one more read, then submit again.",
    });
  }
  if (timing !== "ok") {
    return fail(issueFormToken(), echoed, {
      message: "This page has been open a while. Your answers are still here — submit again.",
    });
  }

  const ipHash = hashIp(clientIp(await headers()));
  const verdict = await checkRateLimit(org.id, ipHash, form.applicantEmail);
  if (verdict !== "ok") {
    return fail(token, echoed, {
      message:
        verdict === "email"
          ? "We already have an application from this email today. If you need to change something, reply to the confirmation we sent."
          : "We're getting more applications than usual from this network. Please try again in an hour.",
    });
  }
  await recordAttempt(org.id, ipHash);

  // Demographics are only accepted when the club asks for them.
  const demographics = settings.apply.askDemographics
    ? {
        gender: form.gender,
        raceEthnicity: form.raceEthnicity,
        firstGeneration: form.firstGeneration,
        international: form.international,
      }
    : undefined;

  const input = intakeSchema.safeParse({
    companyName: form.companyName,
    website: form.website,
    pitchSummary: form.pitchSummary,
    amountRequested: form.amountRequested,
    useOfFunds: form.useOfFunds,
    applicantName: form.applicantName,
    applicantEmail: form.applicantEmail,
    school: form.school ?? org.schoolName ?? undefined,
    department: form.department,
    major: form.major,
    classYear: form.classYear,
    teamSize: form.teamSize,
    teamComposition: form.teamSize > 1 ? "cofounded" : "solo",
    teamStudentMix: form.teamStudentMix,
    howHeard: form.howHeard,
    demographics,
    consentAt: new Date(),
  });
  if (!input.success) {
    return fail(token, echoed, { message: "Something in the form didn't look right. Check it and try again." });
  }

  const unavailable = () =>
    fail(token, echoed, {
      message: "We couldn't take your application just now. Your answers are still here — please try again in a minute.",
    });
  let result;
  try {
    result = await receiveApplication(org, input.data, "form");
  } catch (e) {
    console.error("[apply] intake failed", e);
    return unavailable();
  }
  if (!result.ok) {
    console.error("[apply] no entry stage configured");
    return unavailable();
  }

  return {
    status: "done",
    ref: formatRef("application", result.ref),
    email: form.applicantEmail,
    companyName: form.companyName,
    emailed: settings.founderEmails.received,
  };
}
