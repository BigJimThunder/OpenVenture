/**
 * Demo seed — a plausible year for the fictional "Cardinal Ventures".
 * Deterministic (fixed-seed PRNG) so screenshots and tests are stable.
 * All companies are clearly fictional with non-resolving .example domains.
 *
 * Usage: DATABASE_URL=... pnpm seed:demo
 * Wipes and recreates all org data. Never point this at a production DB.
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

const MEMBER_NAMES = [
  ["Priya Raman", "admin", 2026], ["Marcus Chen", "admin", 2026],
  ["Sofia Alvarez", "partner", 2027], ["Jamal Wright", "partner", 2027],
  ["Emma Kowalski", "partner", 2026], ["Daniel Park", "analyst", 2028],
  ["Aisha Okafor", "analyst", 2028], ["Lucas Meyer", "analyst", 2028],
  ["Grace Liu", "analyst", 2027], ["Tom Ridley", "analyst", 2029],
  ["Nina Petrova", "analyst", 2029], ["Sam Goldstein", "partner", 2027],
  ["Maya Krishnan", "analyst", 2028], ["Alex Fontaine", "read_only", 2029],
  ["Jordan Blake", "analyst", 2029],
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

  // Wipe in FK order.
  const t = schema;
  for (const table of [
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
    t.activity, t.invitation, t.member,
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
    })
    .returning();

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
      MEMBER_NAMES.map(([name, role, classYear], i) => ({
        orgId: org.id,
        userId: i === 0 ? demoUser.id : null,
        email: i === 0 ? "demo@example.com" : `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
        displayName: name,
        role: role as schema.MemberRole,
        status: "active" as const,
        classYear,
        cohort: `Fall ${classYear - 4}`,
      }))
    )
    .returning();

  // Grant pools: last year (spent) + this year (in progress).
  const [lastPool, thisPool] = await db
    .insert(t.grantPool)
    .values([
      { orgId: org.id, name: "FY2025 Pool", fiscalYear: 2025, totalBudget: "10000" },
      { orgId: org.id, name: "FY2026 Pool", fiscalYear: 2026, totalBudget: "10000", rolloverFromPrior: "850" },
    ])
    .returning();

  // Applications across the past ~11 months with realistic funnel shape.
  // Anchored to the run date so the demo always feels current; the PRNG
  // keeps the *shape* deterministic.
  const now = Date.now();
  const start = now - 334 * 86400000;

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
  };
  const memoCandidates: MemoCandidate[] = [];
  for (let i = 0; i < COMPANIES.length; i++) {
    const [name, oneLiner, sectorSlug, ask] = COMPANIES[i];
    const domain = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.example.com`;
    const appliedAt = new Date(start + rand() * (now - start));

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

    // Funnel: applied → some screened out → some to coffee → some pitch → some funded
    const r = rand();
    let finalSlug: string;
    if (r < 0.18) finalSlug = "applied";
    else if (r < 0.3) finalSlug = "screening";
    else if (r < 0.42) finalSlug = "coffee-chat";
    else if (r < 0.5) finalSlug = "pitched-group";
    else if (r < 0.56) finalSlug = "decision";
    else if (r < 0.74) finalSlug = "funded";
    else finalSlug = "declined";

    const finalStage = stageBySlug[finalSlug];
    const owner = pick(members.filter((m) => m.role !== "read_only"));
    const isTerminal = finalSlug === "funded" || finalSlug === "declined";

    const [app] = await db
      .insert(t.application)
      .values({
        orgId: org.id,
        companyId: co.id,
        stageId: finalStage.id,
        status: finalSlug === "funded" ? "funded" : finalSlug === "declined" ? "declined" : "open",
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
        classYear: randInt(2026, 2029),
        teamSize: randInt(1, 4),
        teamComposition: rand() < 0.35 ? "solo" : "cofounded",
        teamStudentMix: rand() < 0.8 ? "all_students" : "mixed",
        campusSource: pick(CAMPUS_SOURCES),
        appliedAt,
        enteredStageAt: new Date(appliedAt.getTime() + randInt(1, 40) * 86400000),
        ...(finalSlug === "declined"
          ? {
              declineReason: pick(schema.DECLINE_REASONS),
              decidedAt: new Date(appliedAt.getTime() + randInt(10, 60) * 86400000),
            }
          : {}),
        ...(finalSlug === "funded"
          ? { decidedAt: new Date(appliedAt.getTime() + randInt(20, 70) * 86400000) }
          : {}),
      })
      .returning();

    // Stage history walk.
    const path = ["applied", "screening", "coffee-chat", "pitched-group", "decision"];
    const walkTo = isTerminal ? path.length : path.indexOf(finalSlug) + 1;
    let cursor = appliedAt.getTime();
    let prev: string | null = null;
    for (let sIdx = 0; sIdx < walkTo; sIdx++) {
      const stage = stageBySlug[path[sIdx]];
      await db.insert(t.stageHistory).values({
        orgId: org.id,
        applicationId: app.id,
        fromStageId: prev ? stageBySlug[prev].id : null,
        toStageId: stage.id,
        movedByMemberId: sIdx === 0 ? null : owner.id,
        movedAt: new Date(cursor),
        secondsInPrevStage: sIdx === 0 ? null : randInt(2, 14) * 86400,
      });
      prev = path[sIdx];
      cursor += randInt(2, 14) * 86400000;
    }
    if (isTerminal) {
      await db.insert(t.stageHistory).values({
        orgId: org.id,
        applicationId: app.id,
        fromStageId: stageBySlug["decision"].id,
        toStageId: finalStage.id,
        movedByMemberId: owner.id,
        movedAt: new Date(cursor),
        secondsInPrevStage: randInt(1, 7) * 86400,
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

    // Coffee chat with two attendees past that stage (the club's rule).
    if (walkTo >= 3) {
      const [chat] = await db
        .insert(t.coffeeChat)
        .values({
          orgId: org.id,
          applicationId: app.id,
          happenedAt: new Date(appliedAt.getTime() + randInt(10, 25) * 86400000),
          location: pick(["Campus café", "Library lobby", "Zoom", "Student center"]),
          debrief: pick([
            "Founder knows the space cold. Distribution plan is hand-wavy but the wedge is real.",
            "Strong technical progress; needs help thinking about pricing. Worth a pitch.",
            "Passionate but the ask doesn't map to a clear milestone. Coached them to tighten it.",
            "Impressive demo. Two paying pilots already. Fast yes from both of us.",
          ]),
          verdict: walkTo >= 4 ? "advance" : pick(["advance", "undecided", "decline"]),
        })
        .returning();
      const two = [owner, pick(members.filter((m) => m.id !== owner.id))];
      for (const attendee of two) {
        await db.insert(t.coffeeChatAttendee).values({
          coffeeChatId: chat.id,
          memberId: attendee.id,
          verdict: chat.verdict,
        });
      }
    }

    // Grant for funded companies.
    if (finalSlug === "funded") {
      fundedCount++;
      const amount = Math.round(ask * (0.5 + rand() * 0.5));
      const pool = rand() < 0.4 ? lastPool : thisPool;
      const statusRoll = rand();
      await db.insert(t.grant).values({
        orgId: org.id,
        poolId: pool.id,
        applicationId: app.id,
        companyId: co.id,
        status: statusRoll < 0.6 ? "reconciled" : statusRoll < 0.85 ? "issued" : "approved",
        amountRequested: String(ask),
        amountAwarded: String(amount),
        useOfFunds: pick(schema.USE_OF_FUNDS),
        paymentMethod: pick(["check", "ach", "zelle"]),
        approvedByMemberId: members[0].id,
        approvedAt: app.decidedAt,
        issuedAt: statusRoll < 0.85 ? new Date(app.decidedAt!.getTime() + 7 * 86400000) : null,
      });
      await db.update(t.company).set({
        status: "portfolio",
        outcomeTier: pick(["dormant", "incorporated", "launched", "launched", "revenue", "raised_round", "accelerator"]),
        outcomeUpdatedAt: new Date(now - randInt(0, 90) * 86400000),
      }).where(eq(t.company.id, co.id));
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
        createdAt: new Date(appliedAt.getTime() + randInt(5, 30) * 86400000),
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
      Summary: `${c.companyName} is ${c.oneLiner.charAt(0).toLowerCase()}${c.oneLiner.slice(1)}. The founding team is asking for $${c.ask.toLocaleString()} in non-dilutive funding to get past a specific, verifiable blocker. They came through our standard funnel: application, screening against criteria, and a two-member coffee chat that ended in a clear advance.`,
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
        applicationId: c.appId,
        templateId: template.id,
        title: `${c.companyName} — grant memo`,
        status: opts.roundState === "revealed" ? "decided" : "circulated",
        authorMemberId: c.ownerId,
        currentVersionNo: 1,
        recommendation: c.finalSlug === "declined" ? "decline" : "fund",
        proposedAmount: String(c.ask),
        circulatedAt: new Date(c.appliedAt.getTime() + 30 * 86400000),
        ...(opts.roundState === "revealed"
          ? { decidedAt: new Date(c.appliedAt.getTime() + 40 * 86400000) }
          : {}),
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
    const now2 = Date.now();
    const [round] = await db
      .insert(t.voteRound)
      .values({
        orgId: org.id,
        applicationId: c.appId,
        memoId: memoRow.id,
        title: `IC vote: ${c.companyName}`,
        opensAt: new Date(now2 - 3 * 86400000),
        closesAt: new Date(now2 + (opts.roundState === "open" ? 2 : -1) * 86400000),
        status: opts.roundState,
        ...(opts.roundState === "revealed"
          ? {
              revealedAt: new Date(now2 - 86400000),
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

  // Weekly meetings over the past 12 weeks.
  for (let w = 0; w < 12; w++) {
    const when = new Date(now - (12 - w) * 7 * 86400000);
    const isPast = when.getTime() < now;
    const [meeting] = await db
      .insert(t.meeting)
      .values({
        orgId: org.id,
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

  // One upcoming meeting.
  await db.insert(t.meeting).values({
    orgId: org.id,
    title: "Weekly General Meeting",
    kind: "general",
    scheduledAt: new Date(now + 3 * 86400000),
    durationMinutes: 60,
    location: "Huntsman Hall 240",
    status: "scheduled",
    createdByMemberId: members[0].id,
  });

  console.log(`Seeded: ${COMPANIES.length} applications, ${fundedCount} funded, ${members.length} members.`);
  console.log("Log in as demo@example.com (magic link prints to the server console in dev).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
