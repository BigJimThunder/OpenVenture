import type { OutcomeTier, VoteDecision } from "@/db/schema";

/**
 * Investor self-analysis math — pure functions over revealed ballots joined
 * to grantee outcome tiers. Only ballots from REVEALED rounds may be passed
 * in (the caller enforces the redaction boundary).
 */

export const MEANINGFUL_TIERS: readonly OutcomeTier[] = [
  "revenue",
  "raised_round",
  "accelerator",
  "acquired",
];

export type OutcomeBallot = {
  roundId: string;
  companyId: string;
  memberId: string;
  decision: VoteDecision | null;
  conviction: number | null;
  outcomeTier: OutcomeTier | null;
};

export function isMeaningful(tier: OutcomeTier | null): boolean {
  return tier != null && MEANINGFUL_TIERS.includes(tier);
}

/** Fund-rate for one member vs. the whole sample (abstains excluded). */
export function yesRate(ballots: OutcomeBallot[], memberId: string) {
  const decided = ballots.filter((b) => b.decision === "fund" || b.decision === "decline");
  const mine = decided.filter((b) => b.memberId === memberId);
  const rate = (rows: OutcomeBallot[]) =>
    rows.length === 0 ? null : rows.filter((b) => b.decision === "fund").length / rows.length;
  return { mine: rate(mine), club: rate(decided), myVotes: mine.length };
}

/**
 * Conviction calibration: average conviction on companies that later reached
 * a meaningful tier vs. those that went dormant. A positive spread means
 * your enthusiasm tracked reality.
 */
export function calibration(ballots: OutcomeBallot[], memberId: string) {
  const mine = ballots.filter((b) => b.memberId === memberId && b.conviction != null);
  const avg = (rows: OutcomeBallot[]) =>
    rows.length === 0 ? null : rows.reduce((n, b) => n + (b.conviction ?? 0), 0) / rows.length;
  const winners = mine.filter((b) => isMeaningful(b.outcomeTier));
  const dormant = mine.filter((b) => b.outcomeTier === "dormant");
  const onWinners = avg(winners);
  const onDormant = avg(dormant);
  return {
    onWinners,
    onDormant,
    winnersCount: winners.length,
    dormantCount: dormant.length,
    spread: onWinners != null && onDormant != null ? onWinners - onDormant : null,
  };
}

/**
 * Contrarian record: rounds where the member's fund/decline vote went
 * against the round's majority, split by whether the outcome tier later
 * vindicated them (voted fund on an eventual winner, or decline on an
 * eventual dormant company).
 */
export function contrarianRecord(ballots: OutcomeBallot[], memberId: string) {
  const byRound = new Map<string, OutcomeBallot[]>();
  for (const b of ballots) {
    if (!byRound.has(b.roundId)) byRound.set(b.roundId, []);
    byRound.get(b.roundId)!.push(b);
  }

  const results: { roundId: string; companyId: string; myVote: VoteDecision; vindicated: boolean | null }[] = [];
  for (const [roundId, rows] of byRound) {
    const mine = rows.find((b) => b.memberId === memberId);
    if (!mine || (mine.decision !== "fund" && mine.decision !== "decline")) continue;
    const fund = rows.filter((b) => b.decision === "fund").length;
    const decline = rows.filter((b) => b.decision === "decline").length;
    const majority = fund > decline ? "fund" : decline > fund ? "decline" : null;
    if (!majority || mine.decision === majority) continue;

    const tier = mine.outcomeTier;
    const vindicated =
      tier == null
        ? null // no outcome yet
        : mine.decision === "fund"
          ? isMeaningful(tier)
          : tier === "dormant";
    results.push({ roundId, companyId: mine.companyId, myVote: mine.decision, vindicated });
  }
  return results;
}
