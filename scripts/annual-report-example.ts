/**
 * A believable, half-finished annual report for the demo club, so the builder
 * is not an empty screen. Used by scripts/seed-demo.ts.
 *
 * It starts from the same first draft a real club gets (numbers, team and
 * company spreads from the data) and then plays the part of the members:
 * two essays written and reviewed, one drafted with a prompt still open, one
 * not started, one officer without a bio. The "What's missing" list therefore
 * has real work in it.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { organization, report } from "../src/db/schema";
import { getAnnualDerived, getAnnualMaterials } from "../src/lib/queries/annual-report";
import {
  applyAnnualOps,
  annualContentSchema,
  currentFiscalYear,
  parseAnnualContent,
  syncAnnualContent,
  type AnnualOp,
} from "../src/lib/reports/annual";
import { textToDoc } from "../src/lib/rich-text";

const MISSION =
  "Cardinal Ventures exists so that a student at Example University with a real problem and a rough prototype can get to the next milestone without giving up equity or waiting for a pitch competition. We give grants of $200 to $4,000, we decide within three weeks, and we tell every founder why.";

const THESIS = [
  "We fund students who have already tested something. A sign-up sheet, a pilot in one dining hall, a spreadsheet three labs depend on: any of these tells us more than a deck. We look for founders who can name the person with the problem, and who changed their plan at least once because of what that person said.",
  "We do not fund ideas that need our grant to find out whether anyone cares. For those founders we offer a coffee chat and a list of people to talk to, and we ask them to come back.",
].join("\n\n");

const SUMMARY =
  "Most of what we do for founders is not the check. Every applicant who reaches a coffee chat leaves with written feedback, and this year four of the founders we declined asked to meet again. We count that as the work going well.";

const TEAM_STATEMENT =
  "We are fifteen undergraduates who meet every Friday at six. Nobody is paid, and nobody votes on a company they have a stake in. Half of us joined in the last two years, so we write things down: every decision in this report has a memo and a recorded vote behind it.";

const BIOS: Record<string, { title: string; bio?: string }> = {
  "Priya Raman": {
    title: "President",
    bio: "Priya is a fourth-year in computer science. She joined as an analyst in her first year, ran sourcing for two years, and rewrote the screening rubric after sitting through forty coffee chats.",
  },
  "Marcus Chen": {
    title: "Managing Partner",
    bio: "Marcus is a fourth-year in economics. He keeps the ledger, reconciles every receipt, and is the reason the pool has balanced to the dollar two years running.",
  },
  "Emma Kowalski": {
    title: "Partner, Investment Committee",
    bio: "Emma is a fourth-year in mechanical engineering. She chairs the investment committee and has read every memo the club has circulated since 2024.",
  },
  "Sofia Alvarez": {
    title: "Partner, Founder Support",
    bio: "Sofia is a third-year in public policy. She runs the check-ins with funded founders and wrote most of what this report says about where they are now.",
  },
  "Jamal Wright": { title: "Partner, Sourcing" },
  "Sam Goldstein": {
    title: "Partner, Programs",
    bio: "Sam is a third-year in statistics. He organizes the Friday training sessions and built the pitch-practice format we now use before every group pitch.",
  },
};

const ESSAYS: Record<string, { essay: string; state: "edited" | "ai"; reviewed: boolean; progress?: string; founders?: string }> = {
  "CampusEats Collective": {
    state: "edited",
    reviewed: true,
    essay: [
      "I first met Sage in the basement kitchen of Hartley Hall at eleven at night, because that was the only time the kitchen was free. Sage was portioning forty orders of jollof rice into containers and checking each one against a list on a clipboard. I had come to ask about the application. I ended up carrying bags to the lobby.",
      "CampusEats is a marketplace where students who cook well sell meals to students who do not. By the time Sage applied, eleven student chefs had sold through it and the group chat that ran the whole thing had hit the member limit twice. The application asked for money to rent a licensed kitchen for a semester, because the university had noticed and the basement was not going to last.",
      "What persuaded me was the clipboard. Sage knew which chef sold out by seven and which one always had six portions left, and had already asked the second chef to cut the menu. In the coffee chat we asked what would happen if the kitchen rental fell through. Sage had two other kitchens priced and a third that would trade hours for catering. We did not suggest any of that.",
      "We have turned down marketplaces before, because most of them are an app looking for both sides of a market. This one was a market that had outgrown a group chat. The grant bought it a legal place to cook.",
    ].join("\n\n"),
    progress:
      "CampusEats moved into a licensed kitchen in August and now has nineteen chefs. It was accepted into the university accelerator's fall cohort. Sage has hired a second student to handle deliveries on weekends.",
  },
  LabMate: {
    state: "edited",
    reviewed: true,
    essay: [
      "LabMate started as a spreadsheet. Sage ran inventory for a wet lab as a work-study job, and got tired of finding out that the lab was out of a reagent on the morning someone needed it. The spreadsheet told people what was in the freezer. Within a term, two neighboring labs had asked for a copy.",
      "I met Sage at our September coffee chat. I had read the application twice and still expected a pitch about the size of the lab supplies market. Instead Sage opened a laptop and showed me the reorder log for the past year: every item, who used it last, and how long the lab had gone without it. The longest gap was nineteen days. That number was the whole pitch.",
      "The memo our committee read was candid that the distribution plan was thin. Sage did not have an answer for how LabMate reaches a lab where nobody knows Sage. What we had instead was a founder who knew the problem better than anyone we could have asked, and three labs using the product every day without being asked to.",
      "The grant paid for barcode scanners and a first run of printed labels, so that logging an item takes one scan and not a typed row. It is the smallest thing that could make the fourth lab say yes.",
    ].join("\n\n"),
    progress:
      "LabMate is in seven labs across two departments. In October it closed a small outside round from two alumni angels, which we had no part in beyond an introduction. Sage is now working out what a department-wide license would cost.",
  },
  GreenPlate: {
    state: "ai",
    reviewed: false,
    essay: [
      "[add: how you first met Sage, and what you noticed]",
      "GreenPlate measures what dining halls throw away. When Sage applied, a prototype scale had been sitting under the tray return in one hall for three weeks, and Sage could tell us that the hall discarded the most food on Thursdays, when the menu repeats.",
      "In the coffee chat, the technical work was further along than we expected for a first-year. Pricing was not. Sage had not decided whether the dining service or the sustainability office would pay, and said so plainly. We spent most of the hour on that question and Sage came back a week later having asked both offices.",
      "We funded the design work for a housing that survives a dish room, because the cardboard one did not.",
    ].join("\n\n"),
  },
};

const LOOKING_FORWARD = [
  "We were slower than we wanted to be. Our median decision took longer than the three weeks we promise founders, and two applications sat in screening past their deadline because the member who owned them was in midterms. Next year every application gets a second owner on the day it arrives.",
  "We also said no to things we could have helped. Most of our declines were for being too early, and for those founders a decline letter is not much use. We have started offering a coffee chat to every declined applicant, and we want to turn that into a standing office hour.",
  "The pool is not yet fully committed, and we would rather carry money into the spring than fund a company to hit a number.",
].join("\n\n");

/** Build the example content for the demo club's current fiscal year. */
export async function buildExampleAnnualReport(org: typeof organization.$inferSelect, viewerMemberId: string) {
  const fiscalYear = currentFiscalYear(org.fiscalYearStartMonth);
  const derived = await getAnnualDerived(org, fiscalYear);
  const materials = await getAnnualMaterials(org.id, viewerMemberId, derived.companies);
  const first = syncAnnualContent(parseAnnualContent({}), derived, { materials, mission: MISSION, thesis: THESIS });

  const ops: AnnualOp[] = [
    { op: "set", path: ["cover", "subtitle"], value: "What we funded, why we funded it, and what we would do differently." },
    { op: "set", path: ["team", "statement"], value: textToDoc(TEAM_STATEMENT) },
    { op: "set", path: ["mission", "blocks", "summary", "body"], value: textToDoc(SUMMARY) },
    {
      op: "insert",
      path: ["mission", "stats"],
      value: { id: "demo-training", key: "custom", value: "9", label: "Friday training sessions, open to any student" },
    },
    { op: "set", path: ["lookingForward", "body"], value: textToDoc(LOOKING_FORWARD) },
    {
      op: "insert",
      path: ["programs"],
      value: {
        id: "demo-pitch-practice",
        title: "Pitch practice",
        narrative: textToDoc(
          [
            "Founders who reach a group pitch used to arrive cold. This year every one of them got a practice run first: twenty minutes with three members who had not read the application, followed by written notes the same evening.",
            "It costs us an hour per founder. Founders who took the practice run answered the committee's first question without notes, which had not been true the year before.",
          ].join("\n\n")
        ),
        statsTitle: "Pitch practice, by the numbers",
        stats: ["6 founders took a practice run before their group pitch", "3 members on every panel", "Written notes sent within 24 hours, every time"],
      },
    },
  ];

  for (const m of derived.members) {
    const profile = BIOS[m.name];
    if (!profile) continue;
    ops.push({ op: "set", path: ["team", "members", m.id, "title"], value: profile.title });
    if (profile.bio) ops.push({ op: "set", path: ["team", "members", m.id, "bio"], value: profile.bio });
  }
  for (const c of derived.companies) {
    const written = ESSAYS[c.name];
    if (!written) continue;
    ops.push(
      { op: "set", path: ["companies", c.companyId, "essay"], value: textToDoc(written.essay) },
      { op: "set", path: ["companies", c.companyId, "essayState"], value: written.state },
      { op: "set", path: ["companies", c.companyId, "reviewed"], value: written.reviewed }
    );
    if (written.progress) {
      ops.push(
        { op: "set", path: ["companies", c.companyId, "progress"], value: textToDoc(written.progress) },
        { op: "set", path: ["companies", c.companyId, "progressAuto"], value: false }
      );
    }
  }
  derived.unfunded.forEach((u, i) => {
    if (i > 0) return;
    ops.push({
      op: "set",
      path: ["lookingForward", "unfunded", u.applicationId, "note"],
      value: `${(u.oneLiner ?? "A student company").replace(/[.]+$/, "")}. We met the founder twice and introduced them to two students who had run a similar pilot. They are testing with one residence hall this term and plan to reapply in the spring.`,
    });
  });

  return {
    fiscalYear,
    title: `Annual report ${derived.label}`,
    content: annualContentSchema.parse(applyAnnualOps(first, ops)),
  };
}

/** Insert (or replace) the example report for the demo club. */
export async function seedExampleAnnualReport(orgId: string, memberId: string) {
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1);
  if (!org) throw new Error("Organization not found");
  const example = await buildExampleAnnualReport(org, memberId);
  const values = {
    orgId,
    kind: "annual" as const,
    periodKey: `FY${example.fiscalYear}`,
    title: example.title,
    content: example.content,
    createdByMemberId: memberId,
    updatedByMemberId: memberId,
  };
  await db
    .insert(report)
    .values(values)
    .onConflictDoUpdate({
      target: [report.orgId, report.kind, report.periodKey],
      set: { content: values.content, status: "draft", snapshot: null, updatedAt: new Date() },
    });
  return example;
}
