/**
 * Demo seed — the fictional "Cardinal Ventures", caught mid-season.
 *
 * Every date is an offset from the moment the seed runs, so the demo always
 * looks like a live club: a few applications from this week, a couple close
 * to their stage deadline, one past it, a blind vote closing in two days, a
 * meeting this week, and grants at every step from proposed to reconciled.
 * Apart from that anchor it is deterministic (fixed-seed PRNG, scripted
 * scenario), so screenshots and tests are stable.
 *
 * All companies are clearly fictional with non-resolving .example domains.
 *
 * Usage: DATABASE_URL=... pnpm seed:demo
 * Wipes and recreates ALL data. It refuses to run against a database that
 * holds a different club unless you pass --force.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import * as schema from "../src/db/schema";
import {
  DEFAULT_STAGES,
  DEFAULT_SECTORS,
  DEFAULT_SCREENING_CRITERIA,
  DEFAULT_MEMO_SECTIONS,
  DEFAULT_ONBOARDING_TASKS,
  DEFAULT_SOURCES,
} from "../src/lib/defaults";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = drizzle(url, { schema });

// Deterministic PRNG (mulberry32)
let seedState = 0xc0ffee;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

const DAY = 86_400_000;
const NOW = Date.now();
/** A moment `days` before the seed ran (negative = in the future). */
const daysAgo = (days: number) => new Date(NOW - days * DAY);
/** Never later than an hour ago: nothing in the past may be dated in the future. */
const past = (ms: number) => new Date(Math.min(ms, NOW - 3_600_000));
/** Academic year (Jul–Jun) the seed is running in; pools and class years hang off it. */
const SEASON = new Date(NOW).getUTCMonth() >= 6 ? new Date(NOW).getUTCFullYear() : new Date(NOW).getUTCFullYear() - 1;

// [name, role, years until graduation at the end of this season]
const MEMBER_NAMES = [
  ["Priya Raman", "admin", 0], ["Marcus Chen", "admin", 0],
  ["Sofia Alvarez", "partner", 1], ["Jamal Wright", "partner", 1],
  ["Emma Kowalski", "partner", 0], ["Daniel Park", "analyst", 2],
  ["Aisha Okafor", "analyst", 2], ["Lucas Meyer", "analyst", 2],
  ["Grace Liu", "analyst", 1], ["Tom Ridley", "analyst", 3],
  ["Nina Petrova", "analyst", 3], ["Sam Goldstein", "partner", 1],
  ["Maya Krishnan", "analyst", 2], ["Alex Fontaine", "read_only", 3],
  ["Jordan Blake", "analyst", 3],
] as const;

const COMPANIES = [
  ["Lecture Loop", "AI note-taking that syncs with the course catalog", "ai-ml", 2400],
  ["CampusEats Collective", "Ghost-kitchen marketplace for student chefs", "marketplace", 3000],
  ["Solara Labs", "DIY solar balcony kits for renters", "climate", 4000],
  ["StudySwap", "Peer tutoring exchange with token credits", "edtech", 800],
  ["Ferrite Robotics", "Cheap magnetic grippers for warehouse cobots", "hardware", 4000],
  ["MintBudget", "Budgeting app for international students", "fintech", 1200],
  ["Quokka Health", "Symptom triage chatbot for campus clinics", "health", 2500],
  ["DormDrop", "Same-day dorm-to-dorm delivery network", "consumer", 600],
  ["PageForge", "Markdown-native zine publishing platform", "devtools", 950],
  ["GreenPlate", "Dining-hall food-waste analytics", "climate", 1800],
  ["EchoCast", "Podcast clip search for lecture archives", "ai-ml", 1400],
  ["TapTix", "NFC event ticketing for student orgs", "consumer", 2000],
  ["LabMate", "Shared inventory for university wet labs", "health", 3200],
  ["CourseCompass", "Degree-planning graph with prereq solver", "edtech", 700],
  ["BikeChain", "P2P bike rental with smart locks", "marketplace", 1500],
  ["NightOwl Security", "Walk-home companion matching app", "consumer", 500],
  ["FormFree", "Accessibility-first form builder", "devtools", 1100],
  ["AquaSense", "Dorm shower water-usage sensors", "climate", 2800],
  ["RecipeRx", "Meal plans from dining-hall ingredients", "health", 400],
  ["SplitStay", "Sublet matching with escrow deposits", "marketplace", 2200],
  ["ChirpDeck", "Presentation karaoke practice tool", "edtech", 300],
  ["VoltVan", "EV charging co-op for commuter students", "climate", 3800],
] as const;

/**
 * Where each company (same order as COMPANIES) stands today.
 *   open:     days since it entered its current stage (SLAs: Screening 7, Coffee Chat 14)
 *   terminal: days since the decision
 * `mine` puts it on the demo admin's plate so their own views aren't empty.
 */
type Scenario =
  | { stage: "applied" | "screening" | "coffee-chat" | "pitched-group" | "decision"; inStage: number; mine?: boolean; nextStep?: [string, number] }
  | { stage: "funded"; decided: number; grant: "approved" | "issued" | "cashed" | "reconciled"; lastCheckin: number | null }
  | { stage: "declined"; decided: number };

const SCENARIOS: Scenario[] = [
  { stage: "decision", inStage: 2, nextStep: ["Vote before the round closes", -2] }, // Lecture Loop — open blind vote
  { stage: "funded", decided: 110, grant: "reconciled", lastCheckin: 100 }, // CampusEats — check-in due
  { stage: "coffee-chat", inStage: 19, mine: true, nextStep: ["Log the coffee-chat debrief", 4] }, // Solara — past SLA
  { stage: "applied", inStage: 0.2 }, // StudySwap — arrived this morning
  { stage: "pitched-group", inStage: 3, nextStep: ["Founder pitch at the general meeting", -2] }, // Ferrite
  { stage: "funded", decided: 12, grant: "approved", lastCheckin: null }, // MintBudget — approved, not yet paid
  { stage: "screening", inStage: 5, mine: true, nextStep: ["Score against the rubric", -1] }, // Quokka — 2 days left
  { stage: "declined", decided: 8 },
  { stage: "applied", inStage: 1 },
  { stage: "funded", decided: 25, grant: "issued", lastCheckin: null }, // GreenPlate — check in the mail
  { stage: "screening", inStage: 2, nextStep: ["Ask for their pilot numbers", -3] },
  { stage: "coffee-chat", inStage: 12, nextStep: ["Decide: advance to group pitch?", -1] }, // TapTix — 2 days left
  { stage: "funded", decided: 60, grant: "cashed", lastCheckin: 20 },
  { stage: "declined", decided: 40 },
  { stage: "applied", inStage: 3, mine: true },
  { stage: "declined", decided: 95 },
  { stage: "pitched-group", inStage: 6, nextStep: ["Circulate the memo for comments", -1] },
  { stage: "funded", decided: 170, grant: "reconciled", lastCheckin: 35 },
  { stage: "coffee-chat", inStage: 4, nextStep: ["Coffee chat on the calendar", -2] }, // RecipeRx — chat scheduled
  { stage: "funded", decided: 250, grant: "reconciled", lastCheckin: 60 }, // last fiscal year
  { stage: "declined", decided: 200 },
  { stage: "screening", inStage: 6 }, // VoltVan — 1 day left
];

/** Meetings happen at 6pm Eastern, whatever time of day the seed runs. */
function eveningOf(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 0, 0, 0);
  return d;
}

const DEPARTMENTS = [
  "Computer Science", "Computer Science", "Computer Science", "Economics",
  "Economics", "Mechanical Engineering", "Electrical Engineering", "Business",
  "Business", "Biology", "Design", "Public Policy", "Mathematics", "Physics",
];

const CAMPUS_SOURCES = [
  "Startup Fair booth", "Intro to Entrepreneurship class", "Engineering quad tabling",
  "Hackathon", "Professor referral", "Website", "Instagram", "Friend of a member",
  "Demo Day", "Dorm flyer",
];

async function main() {
  console.log("Seeding demo data (Cardinal Ventures)…");

  const t = schema;
  const other = (await db.select({ name: t.organization.name }).from(t.organization)).filter(
    (o) => o.name !== "Cardinal Ventures"
  );
  if (other.length > 0 && !process.argv.includes("--force")) {
    console.error(
      `This database belongs to "${other[0].name}". The demo seed deletes everything in it.\n` +
        "If that is really what you want, run it again with --force."
    );
    process.exit(1);
  }

  // Wipe in FK order.
  for (const table of [
    t.report, t.apiToken,
    t.receipt, t.grant, t.grantPool,
    t.vote, t.voteEligibility, t.voteRound,
    t.memoComment, t.memoSection, t.memoVersion, t.memo,
    t.memoTemplateSection, t.memoTemplate,
    t.attendance, t.actionItem, t.agendaItem, t.meeting,
    t.onboardingCompletion, t.onboardingAssignment, t.onboardingTask, t.onboardingTrack,
    t.doc,
    t.capTableSnapshot, t.capEvent, t.stakeholder, t.securityClass, t.capTable,
    t.screeningScore, t.screeningCriterion,
    t.coffeeChatAttendee, t.coffeeChat,
    t.applicationNote, t.applicationDemographics, t.stageHistory, t.file,
    t.application, t.contact, t.companySector, t.company,
    t.outcomeUpdate, t.dealSource, t.sector, t.pipelineStage,
    t.notificationLog, t.activity, t.invitation, t.member,
    t.session, t.account, t.verification, t.user,
    t.organization,
  ]) {
    await db.delete(table);
  }

  const [org] = await db
    .insert(t.organization)
    .values({
      name: "Cardinal Ventures",
      slug: "cardinal-ventures",
      schoolName: "Example University",
      allowedEmailDomains: [],
      ingestSecret: randomBytes(32).toString("hex"),
      settings: {
        setup: { stagesReviewed: true },
        apply: {
          enabled: true,
          intro:
            "Cardinal Ventures gives grants of $200 to $4,000 to student founders at Example University. We fund the specific thing standing between you and your next milestone: a filing fee, API credits, a prototype run.",
        },
        reports: {
          approverName: "Dana Whitfield",
          approverEmail: "dana.whitfield@example.edu",
          lpEmails: "dana.whitfield@example.edu, alumni-board@example.org",
          mission:
            "We give small grants to student founders at Example University so the first real experiment does not wait on money.",
          thesis:
            "A founder who has already talked to the people with the problem, a specific thing the money buys, and a check small enough that we can say yes within two weeks.",
        },
      },
    })
    .returning();

  // Per-org ref counters (APP-1, MEM-1, …). The seed is single-threaded and
  // starts from an empty org, so plain counters give the same result as
  // withRef() without the round-trip per insert.
  let appRef = 0;
  let memoRef = 0;
  let meetingRef = 0;
  let taskRef = 0;

  const stages = await db
    .insert(t.pipelineStage)
    .values(
      DEFAULT_STAGES.map((s) => ({
        ...s,
        orgId: org.id,
        slaDays: "slaDays" in s ? s.slaDays : null,
        minAttendees: "minAttendees" in s ? s.minAttendees : null,
      }))
    )
    .returning();
  const stageBySlug = Object.fromEntries(stages.map((s) => [s.slug, s]));

  const sectors = await db
    .insert(t.sector)
    .values(DEFAULT_SECTORS.map((s, i) => ({ ...s, orgId: org.id, position: i })))
    .returning();
  const sectorBySlug = Object.fromEntries(sectors.map((s) => [s.slug, s]));

  const sources = await db
    .insert(t.dealSource)
    .values(DEFAULT_SOURCES.map((s) => ({ ...s, orgId: org.id })))
    .returning();

  const criteria = await db
    .insert(t.screeningCriterion)
    .values(DEFAULT_SCREENING_CRITERIA.map((c) => ({ ...c, orgId: org.id })))
    .returning();

  const [template] = await db
    .insert(t.memoTemplate)
    .values({ orgId: org.id, name: "Grant memo", isDefault: true })
    .returning();
  await db
    .insert(t.memoTemplateSection)
    .values(DEFAULT_MEMO_SECTIONS.map((s) => ({ ...s, templateId: template.id })));

  const [track] = await db
    .insert(t.onboardingTrack)
    .values({ orgId: org.id, name: "New analyst", isDefault: true })
    .returning();
  await db
    .insert(t.onboardingTask)
    .values(DEFAULT_ONBOARDING_TASKS.map((task) => ({ ...task, trackId: track.id })));

  // Members. First one gets a demo auth user so you can log in as
  // demo@example.com via the console-logged magic link in dev.
  const [demoUser] = await db
    .insert(t.user)
    .values({
      id: "demo-user",
      name: "Priya Raman",
      email: "demo@example.com",
      emailVerified: true,
    })
    .returning();

  const members = await db
    .insert(t.member)
    .values(
      MEMBER_NAMES.map(([name, role, yearsLeft], i) => ({
        orgId: org.id,
        userId: i === 0 ? demoUser.id : null,
        email: i === 0 ? "demo@example.com" : `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
        displayName: name,
        role: role as schema.MemberRole,
        status: "active" as const,
        classYear: SEASON + 1 + yearsLeft,
        cohort: `Fall ${SEASON - 3 + yearsLeft}`,
      }))
    )
    .returning();

  // Grant pools: last year (spent) + this year (in progress).
  const [lastPool, thisPool] = await db
    .insert(t.grantPool)
    .values([
      { orgId: org.id, name: `FY${SEASON - 1} Pool`, fiscalYear: SEASON - 1, totalBudget: "10000" },
      { orgId: org.id, name: `FY${SEASON} Pool`, fiscalYear: SEASON, totalBudget: "10000", rolloverFromPrior: "850" },
    ])
    .returning();

  const now = NOW;
  const PATH = ["applied", "screening", "coffee-chat", "pitched-group", "decision"] as const;

  let fundedCount = 0;
  type MemoCandidate = {
    appId: string;
    companyId: string;
    companyName: string;
    oneLiner: string;
    ask: number;
    finalSlug: string;
    ownerId: string;
    appliedAt: Date;
    /** When it reached Pitched Group — the memo is written from here. */
    pitchedAt: Date;
    /** Decision date for funded/declined; null while still open. */
    decidedAt: Date | null;
  };
  const memoCandidates: MemoCandidate[] = [];
  for (let i = 0; i < COMPANIES.length; i++) {
    const [name, oneLiner, sectorSlug, ask] = COMPANIES[i];
    const domain = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.example.com`;
    const scenario = SCENARIOS[i];
    const finalSlug: string = scenario.stage;
    const isTerminal = scenario.stage === "funded" || scenario.stage === "declined";

    // Work backwards from today: when it entered its current stage (or was
    // decided), then a few days in each stage before that.
    const walkTo = isTerminal ? PATH.length : PATH.indexOf(scenario.stage as (typeof PATH)[number]) + 1;
    const enteredStageAt = daysAgo("inStage" in scenario ? scenario.inStage : scenario.decided);
    const stays = Array.from({ length: isTerminal ? walkTo : walkTo - 1 }, () => randInt(2, 8));
    const appliedAt = new Date(enteredStageAt.getTime() - stays.reduce((a, b) => a + b, 0) * DAY);
    const enteredAt: Record<string, Date> = {};
    {
      let cursor = appliedAt.getTime();
      for (let sIdx = 0; sIdx < walkTo; sIdx++) {
        enteredAt[PATH[sIdx]] = new Date(cursor);
        cursor += (stays[sIdx] ?? 0) * DAY;
      }
    }
    const decidedAt = isTerminal ? enteredStageAt : null;

    const [co] = await db
      .insert(t.company)
      .values({
        orgId: org.id,
        name,
        domain,
        websiteUrl: `https://${domain}`,
        oneLiner,
        status: "prospect",
      })
      .returning();
    await db.insert(t.companySector).values({
      companyId: co.id,
      sectorId: sectorBySlug[sectorSlug].id,
    });

    const finalStage = stageBySlug[finalSlug];
    const drawnOwner = pick(members.filter((m) => m.role !== "read_only"));
    const owner = "mine" in scenario && scenario.mine ? members[0] : drawnOwner;
    const nextStep = "nextStep" in scenario ? scenario.nextStep : undefined;

    const [app] = await db
      .insert(t.application)
      .values({
        orgId: org.id,
        ref: ++appRef,
        companyId: co.id,
        stageId: finalStage.id,
        status: finalSlug === "funded" ? "funded" : finalSlug === "declined" ? "declined" : "open",
        // Later-stage work skews urgent; most of the Applied column is untriaged.
        priority: isTerminal
          ? "none"
          : finalSlug === "decision"
            ? pick(["urgent", "high"] as const)
            : finalSlug === "pitched-group"
              ? pick(["high", "high", "medium"] as const)
              : finalSlug === "coffee-chat"
                ? pick(["high", "medium", "medium"] as const)
                : finalSlug === "screening"
                  ? pick(["medium", "medium", "low"] as const)
                  : pick(["none", "none", "low"] as const),
        ownerMemberId: owner.id,
        sourcedByMemberId: rand() < 0.4 ? pick(members).id : null,
        sourceId: pick(sources).id,
        amountRequested: String(ask),
        pitchSummary: oneLiner,
        useOfFundsNarrative: pick([
          "Incorporation filing fees and registered agent for the first year.",
          "API credits and hosting through the pilot semester.",
          "Materials for the first production prototype run.",
          "Design freelancer for brand and landing page.",
          "Travel to the regional pitch competition finals.",
        ]),
        applicantName: pick(["Riley", "Casey", "Morgan", "Avery", "Quinn", "Rowan", "Sage"]) +
          " " + pick(["Nguyen", "Garcia", "Smith", "Johnson", "Lee", "Patel", "Brown"]),
        applicantEmail: `founder@${domain}`,
        department: pick(DEPARTMENTS),
        classYear: randInt(SEASON + 1, SEASON + 4),
        teamSize: randInt(1, 4),
        teamComposition: rand() < 0.35 ? "solo" : "cofounded",
        teamStudentMix: rand() < 0.8 ? "all_students" : "mixed",
        campusSource: pick(CAMPUS_SOURCES),
        appliedAt,
        createdAt: appliedAt,
        enteredStageAt,
        decidedAt,
        // Negative offset = due in the future; positive = overdue.
        ...(nextStep ? { nextStep: nextStep[0], nextStepDue: daysAgo(nextStep[1]) } : {}),
        ...(finalSlug === "declined" ? { declineReason: pick(schema.DECLINE_REASONS) } : {}),
      })
      .returning();

    // Stage history walk.
    for (let sIdx = 0; sIdx < walkTo; sIdx++) {
      await db.insert(t.stageHistory).values({
        orgId: org.id,
        applicationId: app.id,
        fromStageId: sIdx === 0 ? null : stageBySlug[PATH[sIdx - 1]].id,
        toStageId: stageBySlug[PATH[sIdx]].id,
        movedByMemberId: sIdx === 0 ? null : owner.id,
        movedAt: enteredAt[PATH[sIdx]],
        secondsInPrevStage: sIdx === 0 ? null : stays[sIdx - 1] * 86400,
      });
    }
    if (isTerminal) {
      await db.insert(t.stageHistory).values({
        orgId: org.id,
        applicationId: app.id,
        fromStageId: stageBySlug["decision"].id,
        toStageId: finalStage.id,
        movedByMemberId: owner.id,
        movedAt: enteredStageAt,
        secondsInPrevStage: stays[PATH.length - 1] * 86400,
      });
    }

    // Demographics (optional, self-reported — aggregate-only downstream).
    if (rand() < 0.7) {
      await db.insert(t.applicationDemographics).values({
        orgId: org.id,
        applicationId: app.id,
        gender: pick(["woman", "man", "non_binary", "prefer_not_to_say"]),
        raceEthnicity: pick(["asian", "black", "hispanic_latino", "white", "two_or_more", "prefer_not_to_say"]),
        firstGeneration: rand() < 0.25,
        international: rand() < 0.3,
      });
    }

    // Screening scores past Screening.
    if (walkTo >= 2) {
      const scorers = [owner, pick(members)].filter(
        (m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx
      );
      for (const scorer of scorers) {
        for (const c of criteria) {
          await db.insert(t.screeningScore).values({
            applicationId: app.id,
            criterionId: c.id,
            scoredByMemberId: scorer.id,
            score: randInt(2, 5),
          });
        }
      }
    }

    // Coffee chat with two attendees (the club's rule). An application that
    // only just reached the stage has its chat on the calendar, not logged.
    if (walkTo >= 3) {
      const upcoming = finalSlug === "coffee-chat" && "inStage" in scenario && scenario.inStage < 7;
      const verdict = upcoming ? null : walkTo >= 4 ? "advance" : pick(["advance", "undecided"] as const);
      const [chat] = await db
        .insert(t.coffeeChat)
        .values({
          orgId: org.id,
          applicationId: app.id,
          scheduledAt: upcoming ? daysAgo(-2) : null,
          happenedAt: upcoming ? null : past(enteredAt["coffee-chat"].getTime() + randInt(1, 3) * DAY),
          location: pick(["Campus café", "Library lobby", "Zoom", "Student center"]),
          debrief: upcoming
            ? null
            : pick([
                "Founder knows the space cold. Distribution plan is hand-wavy but the wedge is real.",
                "Strong technical progress; needs help thinking about pricing. Worth a pitch.",
                "Passionate but the ask doesn't map to a clear milestone. Coached them to tighten it.",
                "Impressive demo. Two paying pilots already. Fast yes from both of us.",
              ]),
          verdict,
        })
        .returning();
      const two = [owner, pick(members.filter((m) => m.id !== owner.id && m.role !== "read_only"))];
      for (const attendee of two) {
        await db.insert(t.coffeeChatAttendee).values({
          coffeeChatId: chat.id,
          memberId: attendee.id,
          verdict,
        });
      }
    }

    // Grants: one per funded company, spread across the lifecycle, plus a
    // proposal riding on the open vote.
    if (scenario.stage === "funded") {
      fundedCount++;
      const amount = Math.round((ask * (0.5 + rand() * 0.5)) / 50) * 50;
      const decided = decidedAt!;
      // Charge the pool whose fiscal year (Jul–Jun) contains the decision date.
      const fy = decided.getUTCMonth() >= 6 ? decided.getUTCFullYear() : decided.getUTCFullYear() - 1;
      const paid = scenario.grant !== "approved";
      const settled = scenario.grant === "cashed" || scenario.grant === "reconciled";
      await db.insert(t.grant).values({
        orgId: org.id,
        poolId: (fy >= SEASON ? thisPool : lastPool).id,
        applicationId: app.id,
        companyId: co.id,
        status: scenario.grant,
        amountRequested: String(ask),
        amountAwarded: String(amount),
        useOfFunds: pick(schema.USE_OF_FUNDS),
        paymentMethod: paid ? pick(["check", "ach", "zelle"] as const) : null,
        approvedByMemberId: members[0].id,
        approvedAt: decided,
        issuedAt: paid ? past(decided.getTime() + 7 * DAY) : null,
        cashedAt: settled ? past(decided.getTime() + 16 * DAY) : null,
        reconciledAt: scenario.grant === "reconciled" ? past(decided.getTime() + 45 * DAY) : null,
        createdAt: decided,
      });
      await db.update(t.company).set({
        status: "portfolio",
        ...(scenario.lastCheckin != null
          ? {
              outcomeTier: pick(["incorporated", "launched", "launched", "revenue", "raised_round", "accelerator"] as const),
              outcomeUpdatedAt: daysAgo(scenario.lastCheckin),
            }
          : {}),
      }).where(eq(t.company.id, co.id));
      await db.insert(t.activity).values({
        orgId: org.id,
        actorMemberId: members[0].id,
        actorType: "member",
        verb: "grant.approved",
        entityType: "application",
        entityId: app.id,
        entityLabel: name,
        summary: `${members[0].displayName} approved a $${amount.toLocaleString()} grant for ${name}`,
        occurredAt: decided,
      });
    }
    if (scenario.stage === "decision") {
      await db.insert(t.grant).values({
        orgId: org.id,
        poolId: thisPool.id,
        applicationId: app.id,
        companyId: co.id,
        status: "proposed",
        amountRequested: String(ask),
        amountAwarded: String(ask),
        useOfFunds: "api_credits",
        notes: "Proposed in the memo; waiting on the vote.",
        createdAt: enteredStageAt,
      });
    }

    // Notes.
    if (rand() < 0.6) {
      await db.insert(t.applicationNote).values({
        applicationId: app.id,
        authorMemberId: owner.id,
        body: pick([
          "Followed up over email — sending their deck by Friday.",
          "Talked to a professor who supervised the project. Very positive signal.",
          "Their competitor at State U just shut down; timing might be good.",
          "Ask might be too low — they underestimated cloud costs.",
        ]),
        createdAt: past(appliedAt.getTime() + randInt(1, 6) * DAY),
      });
    }

    await db.insert(t.activity).values({
      orgId: org.id,
      actorMemberId: owner.id,
      actorType: "member",
      verb: "application.created",
      entityType: "application",
      entityId: app.id,
      entityLabel: name,
      summary: `${owner.displayName} added ${name} to the pipeline`,
      occurredAt: appliedAt,
    });

    if (["pitched-group", "decision", "funded", "declined"].includes(finalSlug)) {
      memoCandidates.push({
        appId: app.id,
        companyId: co.id,
        companyName: name,
        oneLiner,
        ask,
        finalSlug,
        ownerId: owner.id,
        appliedAt,
        pitchedAt: enteredAt["pitched-group"],
        decidedAt,
      });
    }
  }

  // ——— Memos + blind IC votes ———
  // Real prose (not lorem), one circulated version each; two revealed rounds
  // with outcomes, one OPEN blind round so the reveal flow is demoable live.
  const templateSections = await db
    .select()
    .from(t.memoTemplateSection)
    .where(eq(t.memoTemplateSection.templateId, template.id));
  const bySectionTitle = (title: string) =>
    templateSections.find((s) => s.title === title)!;

  const tiptap = (text: string) => ({
    type: "doc",
    content: text.split("\n\n").map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  });

  function memoProse(c: MemoCandidate): Record<string, string> {
    return {
      Summary: `${c.companyName}: ${c.oneLiner}. The founding team is asking for $${c.ask.toLocaleString()} in non-dilutive funding to get past a specific, verifiable blocker. They came through our standard funnel: application, screening against criteria, and a two-member coffee chat that ended in a clear advance.`,
      Team: `The founders are current students with real skin in the game — this is not a class project they will abandon in May. In the coffee chat they were direct about what they don't know, which we weight heavily. They have shipped something usable and iterated on user feedback at least twice.`,
      "Product & Traction": `The product exists and works. Early usage is small but genuine: real users they can name, not sign-ups from friends. The honest read is that traction is early-stage even by our standards, and the grant is precisely what removes the next bottleneck rather than general runway.`,
      "Use of Funds": `The full ask of $${c.ask.toLocaleString()} maps to itemized costs the founders quoted from real invoices. Nothing in the budget is salary. If we fund at a lower number, the founders identified which line items they would cut first, which we take as a good sign of planning discipline.`,
      Risks: `The biggest risk is graduation drift — the team's timeline collides with recruiting season. Second, a well-funded competitor could reach campus first, though distribution here favors whoever actually shows up in person. We are not underwriting a venture-scale outcome; we are underwriting momentum.`,
      Recommendation: `${c.finalSlug === "declined" ? `Decline for now. The team is promising but the ask doesn't unlock a milestone we can verify; we'd rather see them again in a semester.` : `Fund $${c.ask.toLocaleString()}. The ask is within range, maps to a verifiable milestone, and the team has done everything our process asks of them.`}`,
    };
  }

  async function seedMemo(
    c: MemoCandidate,
    opts: { roundState: "none" | "open" | "revealed"; outcome?: "fund" | "decline" }
  ) {
    const prose = memoProse(c);
    const [memoRow] = await db
      .insert(t.memo)
      .values({
        orgId: org.id,
        ref: ++memoRef,
        applicationId: c.appId,
        templateId: template.id,
        title: `${c.companyName} — grant memo`,
        status: opts.roundState === "revealed" ? "decided" : "circulated",
        authorMemberId: c.ownerId,
        currentVersionNo: 1,
        recommendation: c.finalSlug === "declined" ? "decline" : "fund",
        proposedAmount: String(c.ask),
        circulatedAt: past(c.pitchedAt.getTime() + DAY),
        createdAt: c.pitchedAt,
        ...(opts.roundState === "revealed" ? { decidedAt: c.decidedAt } : {}),
      })
      .returning();

    const [version] = await db
      .insert(t.memoVersion)
      .values({ memoId: memoRow.id, versionNo: 1, createdByMemberId: c.ownerId })
      .returning();

    for (const [title, text] of Object.entries(prose)) {
      const ts = bySectionTitle(title);
      const base = {
        memoId: memoRow.id,
        templateSectionId: ts.id,
        title,
        position: ts.position,
        contentJson: tiptap(text),
        contentText: text,
        wordCount: text.split(/\s+/).length,
        updatedByMemberId: c.ownerId,
      };
      await db.insert(t.memoSection).values(base); // live draft
      await db.insert(t.memoSection).values({ ...base, versionId: version.id }); // v1 snapshot
    }

    if (opts.roundState === "none") return;

    const voters = members.filter((m) => m.role !== "read_only");
    // Past rounds ran in the three days before the decision; the live one
    // opened two days ago and closes in two.
    const closesAt = opts.roundState === "open" ? daysAgo(-2) : new Date((c.decidedAt?.getTime() ?? NOW) - DAY);
    const [round] = await db
      .insert(t.voteRound)
      .values({
        orgId: org.id,
        applicationId: c.appId,
        memoId: memoRow.id,
        title: `IC vote: ${c.companyName}`,
        opensAt: opts.roundState === "open" ? daysAgo(2) : new Date(closesAt.getTime() - 3 * DAY),
        closesAt,
        status: opts.roundState,
        createdAt: opts.roundState === "open" ? daysAgo(2) : new Date(closesAt.getTime() - 3 * DAY),
        ...(opts.roundState === "revealed"
          ? {
              revealedAt: new Date(closesAt.getTime() + DAY / 2),
              revealedByMemberId: members[0].id,
              outcome: opts.outcome,
              outcomeNote:
                opts.outcome === "fund"
                  ? `Approved at $${c.ask.toLocaleString()} contingent on receipts.`
                  : "Revisit after they land their first two paying users.",
              decidedByMemberId: members[0].id,
            }
          : {}),
      })
      .returning();

    await db.insert(t.voteEligibility).values(
      voters.map((v, idx) => ({
        voteRoundId: round.id,
        memberId: v.id,
        isRecused: idx === voters.length - 1, // one recusal for realism
      }))
    );

    // Ballots: a contentious spread for revealed rounds, partial for open.
    const eligibleVoters = voters.slice(0, -1);
    const votersToCast =
      opts.roundState === "open"
        ? eligibleVoters.slice(0, Math.floor(eligibleVoters.length * 0.6))
        : eligibleVoters;
    const rationalesFund = [
      "Ask maps to a hard milestone. Cheap way to find out.",
      "Team has shipped twice since applying — momentum is real.",
      "This is exactly the kind of founder our grant exists for.",
      "Small check, verifiable use of funds, strong coffee-chat signal.",
    ];
    const rationalesDecline = [
      "Traction is friends-and-family. One semester too early.",
      "Use of funds is fuzzy — half of this is nice-to-have.",
      "Worried the team disbands at graduation.",
    ];
    for (let vi = 0; vi < votersToCast.length; vi++) {
      const leanFund = opts.outcome !== "decline" ? vi % 3 !== 2 : vi % 3 === 0;
      await db.insert(t.vote).values({
        voteRoundId: round.id,
        memberId: votersToCast[vi].id,
        decision: leanFund ? "fund" : "decline",
        conviction: leanFund ? 3 + (vi % 3) : 1 + (vi % 2),
        rationale: leanFund
          ? rationalesFund[vi % rationalesFund.length]
          : rationalesDecline[vi % rationalesDecline.length],
        suggestedAmount: leanFund && vi % 2 === 0 ? String(Math.round(c.ask * 0.8)) : null,
      });
    }
  }

  const fundedCandidates = memoCandidates.filter((c) => c.finalSlug === "funded");
  const declinedCandidates = memoCandidates.filter((c) => c.finalSlug === "declined");
  const liveCandidates = memoCandidates.filter(
    (c) => c.finalSlug === "pitched-group" || c.finalSlug === "decision"
  );
  if (fundedCandidates[0]) await seedMemo(fundedCandidates[0], { roundState: "revealed", outcome: "fund" });
  if (declinedCandidates[0]) await seedMemo(declinedCandidates[0], { roundState: "revealed", outcome: "decline" });
  if (liveCandidates[0]) await seedMemo(liveCandidates[0], { roundState: "open" });
  if (liveCandidates[1]) await seedMemo(liveCandidates[1], { roundState: "none" });
  if (fundedCandidates[1]) await seedMemo(fundedCandidates[1], { roundState: "revealed", outcome: "fund" });
  // Extra revealed rounds so per-member calibration has ≥3 data points.
  if (fundedCandidates[2]) await seedMemo(fundedCandidates[2], { roundState: "revealed", outcome: "fund" });
  if (declinedCandidates[1]) await seedMemo(declinedCandidates[1], { roundState: "revealed", outcome: "decline" });

  // Outcome-tier check-in history for portfolio companies that have had one:
  // up to three steps up the ladder, a term apart, ending at the last check-in.
  const TIER_LADDER = ["incorporated", "launched", "revenue", "raised_round", "accelerator"];
  const portfolioCos = await db
    .select()
    .from(t.company)
    .where(eq(t.company.status, "portfolio"));
  for (const co of portfolioCos) {
    if (!co.outcomeTier || !co.outcomeUpdatedAt) continue;
    const ladderIdx = Math.max(0, TIER_LADDER.indexOf(co.outcomeTier));
    const fundedDaysAgo = (SCENARIOS[COMPANIES.findIndex((c) => c[0] === co.name)] as { decided: number }).decided;
    const lastDaysAgo = (now - co.outcomeUpdatedAt.getTime()) / DAY;
    const steps = Math.min(ladderIdx + 1, 3, 1 + Math.floor((fundedDaysAgo - lastDaysAgo) / 80));
    for (let s = 0; s < steps; s++) {
      await db.insert(t.outcomeUpdate).values({
        orgId: org.id,
        companyId: co.id,
        tier: TIER_LADDER[Math.max(0, ladderIdx - (steps - 1 - s))],
        recordedByMemberId: pick(members).id,
        recordedAt: daysAgo(lastDaysAgo + (steps - 1 - s) * 80),
        note: s === steps - 1 ? "Latest check-in." : null,
      });
    }
  }

  // Weekly meetings over the past 12 weeks.
  for (let w = 0; w < 12; w++) {
    const when = eveningOf(daysAgo((12 - w) * 7 - 2));
    const isPast = when.getTime() < now;
    const [meeting] = await db
      .insert(t.meeting)
      .values({
        orgId: org.id,
        ref: ++meetingRef,
        title: w % 4 === 3 ? "Investment Committee" : "Weekly General Meeting",
        kind: w % 4 === 3 ? "ic" : "general",
        scheduledAt: when,
        durationMinutes: 60,
        location: "Huntsman Hall 240",
        status: isPast ? "completed" : "scheduled",
        createdByMemberId: members[0].id,
      })
      .returning();
    if (isPast) {
      for (const m of members) {
        await db.insert(t.attendance).values({
          meetingId: meeting.id,
          memberId: m.id,
          status: rand() < 0.78 ? "present" : rand() < 0.5 ? "excused" : "absent",
          recordedByMemberId: members[0].id,
        });
      }
    }
  }

  // One upcoming meeting with a pre-built agenda.
  const [upcomingMeeting] = await db
    .insert(t.meeting)
    .values({
      orgId: org.id,
      ref: ++meetingRef,
      title: "Weekly General Meeting",
      kind: "general",
      scheduledAt: eveningOf(daysAgo(-2)),
      durationMinutes: 60,
      location: "Huntsman Hall 240",
      status: "scheduled",
      createdByMemberId: members[0].id,
    })
    .returning();
  const pitchedApp = memoCandidates.find((c) => c.finalSlug === "pitched-group");
  await db.insert(t.agendaItem).values([
    { meetingId: upcomingMeeting.id, position: "1", title: "Sourcing updates", kind: "update", durationMinutes: 10, presenterMemberId: members[2].id },
    ...(pitchedApp
      ? [{ meetingId: upcomingMeeting.id, position: "2", title: `${pitchedApp.companyName} — founder pitch`, kind: "pitch" as const, applicationId: pitchedApp.appId, durationMinutes: 20 }]
      : []),
    { meetingId: upcomingMeeting.id, position: "3", title: "Budget check-in: pacing to May", kind: "admin", durationMinutes: 10, presenterMemberId: members[0].id },
    { meetingId: upcomingMeeting.id, position: "4", title: "New-member onboarding progress", kind: "admin", durationMinutes: 5 },
  ]);
  await db.insert(t.actionItem).values([
    { orgId: org.id, ref: ++taskRef, meetingId: upcomingMeeting.id, title: "Email the two coffee-chat founders with scheduling links", assigneeMemberId: members[3].id, createdByMemberId: members[0].id, dueAt: new Date(now + 2 * 86400000), status: "open" },
    { orgId: org.id, ref: ++taskRef, title: "Post the grant application deadline on the club Instagram", assigneeMemberId: members[6].id, createdByMemberId: members[1].id, dueAt: new Date(now - 2 * 86400000), status: "open" },
    { orgId: org.id, ref: ++taskRef, title: "Confirm the room for Thursday's founder pitch", assigneeMemberId: members[0].id, createdByMemberId: members[1].id, dueAt: new Date(now + 1 * 86400000), status: "open" },
    { orgId: org.id, ref: ++taskRef, title: "Collect receipts from last semester's grantees", assigneeMemberId: members[4].id, createdByMemberId: members[0].id, status: "done", completedAt: new Date(now - 5 * 86400000) },
  ]);

  // Onboarding: assign the default track to the 5 newest members with
  // varied progress (one complete, one untouched).
  const trackTasks = await db
    .select()
    .from(t.onboardingTask)
    .where(eq(t.onboardingTask.trackId, track.id));
  const newest = members.slice(-5);
  for (let mi = 0; mi < newest.length; mi++) {
    const [assignment] = await db
      .insert(t.onboardingAssignment)
      .values({
        memberId: newest[mi].id,
        trackId: track.id,
        completedAt: mi === 0 ? new Date(now - 20 * 86400000) : null,
      })
      .returning();
    const doneCount = mi === 0 ? trackTasks.length : Math.max(0, trackTasks.length - 1 - mi);
    for (let ti = 0; ti < doneCount; ti++) {
      await db.insert(t.onboardingCompletion).values({
        assignmentId: assignment.id,
        taskId: trackTasks[ti].id,
      });
    }
  }

  // Lab cap tables from presets — these double as living engine examples.
  const { PRESETS } = await import("../src/lib/captable/presets");
  for (const presetKey of ["founder-split", "accelerator", "seed-ready"]) {
    const preset = PRESETS.find((p) => p.key === presetKey)!;
    const [table] = await db
      .insert(t.capTable)
      .values({
        orgId: org.id,
        name: `${preset.name} — example`,
        source: "preset",
        createdByMemberId: members[0].id,
      })
      .returning();
    await db.insert(t.capEvent).values(
      preset.events.map((e, i) => ({
        capTableId: table.id,
        seq: i + 1,
        effectiveDate: new Date(now - 30 * 86400000),
        kind: e.payload.kind,
        label: e.label,
        payload: e.payload as unknown as Record<string, unknown>,
        createdByMemberId: members[0].id,
      }))
    );
  }

  // Docs: the wiki that survives officer turnover.
  await db.insert(t.doc).values([
    {
      orgId: org.id,
      title: "Club thesis",
      slug: "club-thesis",
      folder: "General",
      isPinned: true,
      contentText:
        "We fund student founders at the earliest possible moment — before incorporation, before revenue, sometimes before a name. Our checks are small ($200–$4,000) and non-dilutive because the constraint at this stage is rarely capital; it is a specific, verifiable blocker: a filing fee, API credits, a prototype run. We optimize for founders who ship between conversations.",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "We fund student founders at the earliest possible moment — before incorporation, before revenue, sometimes before a name. Our checks are small ($200–$4,000) and non-dilutive because the constraint at this stage is rarely capital; it is a specific, verifiable blocker: a filing fee, API credits, a prototype run. We optimize for founders who ship between conversations." }] },
        ],
      }),
      createdByMemberId: members[0].id,
      updatedByMemberId: members[0].id,
    },
    {
      orgId: org.id,
      title: "Screening rubric",
      slug: "screening-rubric",
      folder: "Process",
      isPinned: true,
      contentText:
        "Score each criterion 1–5. Advance to coffee chat at 3.5+ average with no criterion below 2. The two coffee-chat members must BOTH mark advance for a group pitch — one maybe is a no. Declines always get a reason recorded and a kind, specific email within a week.",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Score each criterion 1–5. Advance to coffee chat at 3.5+ average with no criterion below 2. The two coffee-chat members must BOTH mark advance for a group pitch — one maybe is a no. Declines always get a reason recorded and a kind, specific email within a week." }] },
        ],
      }),
      createdByMemberId: members[0].id,
      updatedByMemberId: members[1].id,
    },
    {
      orgId: org.id,
      title: "How we run meetings",
      slug: "how-we-run-meetings",
      folder: "Process",
      contentText:
        "Agenda goes out the night before, built in the app from suggested items. Attendance is taken in run mode in the first two minutes. Every discussion item ends with either an action item (with an owner and a date) or an explicit decision — nothing ends with 'we should look into that.' Recap email sends automatically at wrap.",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Agenda goes out the night before, built in the app from suggested items. Attendance is taken in run mode in the first two minutes. Every discussion item ends with either an action item (with an owner and a date) or an explicit decision — nothing ends with 'we should look into that.' Recap email sends automatically at wrap." }] },
        ],
      }),
      createdByMemberId: members[1].id,
      updatedByMemberId: members[1].id,
    },
  ]);

  // One funding request in progress, so Reports shows what a draft looks like:
  // line items that add up to the ask, and the written parts a member still owes.
  const requestFor = fundedCandidates[1] ?? fundedCandidates[0];
  if (requestFor) {
    const trays = Math.round(requestFor.ask * 0.5);
    const sensors = Math.round(requestFor.ask * 0.3);
    const askedItems = [
      { id: "a1", name: "Materials for the prototype run", amount: trays.toFixed(2) },
      { id: "a2", name: "Sensors and a test rig", amount: sensors.toFixed(2) },
      { id: "a3", name: "Printing and signage for the pilot", amount: (requestFor.ask - trays - sensors).toFixed(2) },
    ];
    await db.insert(t.report).values({
      orgId: org.id,
      kind: "funding_request",
      periodKey: requestFor.appId,
      applicationId: requestFor.appId,
      title: `Funding request: ${requestFor.companyName}`,
      content: {
        askedItems,
        approvedItems: askedItems.slice(0, 2).map((item, i) => ({ ...item, id: `p${i + 1}` })),
        rationaleFunding:
          "The founders had already run the pilot by hand for a month before they asked us for anything. The money replaces the parts they were borrowing.",
        rationaleCuts: "We left out printing and signage. The pilot sites print their own.",
        summary: `${requestFor.companyName}: ${requestFor.oneLiner}. The first version runs at two sites on campus; the founders want to offer it to other universities once the numbers hold for a full term.`,
        team: "",
        upside: [
          "The team has already done the unglamorous part - they ran the pilot by hand before building anything.",
        ],
        concerns: [],
      },
      createdByMemberId: requestFor.ownerId,
      updatedByMemberId: requestFor.ownerId,
    });
  }

  // ——— Onboarding pipeline ———
  // Seeded members are established (they skip the welcome flow), the newest
  // five carry due dates, and one invite is still waiting to be used.
  const { defaultProcessDoc, PROCESS_DOC_TASK_TITLE } = await import("../src/lib/defaults");
  const { and } = await import("drizzle-orm");
  const [processDoc] = await db
    .insert(t.doc)
    .values({
      orgId: org.id,
      ...defaultProcessDoc(),
      isPinned: true,
      createdByMemberId: members[0].id,
      updatedByMemberId: members[0].id,
    })
    .returning();
  await db
    .update(t.onboardingTask)
    .set({ docId: processDoc.id })
    .where(and(eq(t.onboardingTask.trackId, track.id), eq(t.onboardingTask.title, PROCESS_DOC_TASK_TITLE)));
  await db.update(t.member).set({ onboardedAt: daysAgo(30) }).where(eq(t.member.orgId, org.id));
  const dueInDays = [null, 9, 2, -4, 12];
  for (let mi = 0; mi < newest.length; mi++) {
    const days = dueInDays[mi];
    if (days == null) continue;
    await db
      .update(t.onboardingAssignment)
      .set({ dueAt: daysAgo(-days), assignedAt: daysAgo(14 - days) })
      .where(eq(t.onboardingAssignment.memberId, newest[mi].id));
  }
  const [invitee] = await db
    .insert(t.member)
    .values({
      orgId: org.id,
      email: "riley.chen@example.com",
      displayName: "Riley Chen",
      role: "analyst",
      status: "invited",
      classYear: SEASON + 4,
      cohort: `Fall ${SEASON}`,
      joinedAt: daysAgo(5),
      createdAt: daysAgo(5),
    })
    .returning();
  await db
    .insert(t.onboardingAssignment)
    .values({ memberId: invitee.id, trackId: track.id, assignedAt: daysAgo(5), dueAt: daysAgo(-9) });
  await db.insert(t.activity).values({
    orgId: org.id,
    actorMemberId: members[0].id,
    actorType: "member",
    verb: "member.invited",
    entityType: "member",
    entityId: invitee.id,
    entityLabel: invitee.displayName,
    summary: `${members[0].displayName} invited ${invitee.displayName} as analyst and enrolled them on “${track.name}”`,
    occurredAt: daysAgo(5),
  });

  console.log(`Seeded: ${COMPANIES.length} applications, ${fundedCount} funded, ${members.length} members.`);
  console.log("Log in as demo@example.com (magic link prints to the server console in dev).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
