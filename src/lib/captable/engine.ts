import Decimal from "decimal.js";
import {
  CapEventInput,
  type CapEventPayload,
  type CapTableState,
  type CapTableRow,
  type DerivationStep,
  type OutstandingInstrument,
} from "./types";

/**
 * The pure cap-table engine. No I/O, no DB imports, no Date.now().
 * foldCapTable(events) → CapTableState. Everything is decimal.js — never
 * floats. Shares are modeled fractionally (exact decimals) so ownership
 * always sums to exactly 100%; the UI rounds for display.
 *
 * Engine version is stamped on snapshots so recomputes are traceable.
 */

export const ENGINE_VERSION = "1.0.0";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const ZERO = new Decimal(0);

type SafeState = {
  instrumentId: string;
  stakeholderId: string;
  stakeholderName: string;
  stakeholderKind: string;
  principal: Decimal;
  capType: "pre_money" | "post_money" | "uncapped";
  valuationCap?: Decimal;
  discount?: Decimal; // 0.20 = 20% discount
  mfn: boolean;
};

type NoteState = {
  instrumentId: string;
  stakeholderId: string;
  stakeholderName: string;
  stakeholderKind: string;
  principal: Decimal;
  interestRate: Decimal;
  issueDate: string;
  capType: "pre_money" | "uncapped";
  valuationCap?: Decimal;
  discount?: Decimal;
};

type InternalState = {
  // stakeholderId -> classId -> shares
  positions: Map<string, Map<string, Decimal>>;
  stakeholderMeta: Map<string, { name: string; kind: string }>;
  poolUnissued: Decimal;
  safes: SafeState[];
  notes: NoteState[];
  pricePerShare?: Decimal;
  lastRoundName?: string;
  derivations: DerivationStep[];
  warnings: string[];
};

function addShares(state: InternalState, stakeholderId: string, classId: string, shares: Decimal) {
  if (!state.positions.has(stakeholderId)) state.positions.set(stakeholderId, new Map());
  const byClass = state.positions.get(stakeholderId)!;
  byClass.set(classId, (byClass.get(classId) ?? ZERO).add(shares));
}

function registerStakeholder(
  state: InternalState,
  ref: { id: string; name: string; kind: string }
) {
  if (!state.stakeholderMeta.has(ref.id)) {
    state.stakeholderMeta.set(ref.id, { name: ref.name, kind: ref.kind });
  }
}

/** Issued shares + granted options (positions) — excludes unissued pool. */
function issuedFullyDiluted(state: InternalState): Decimal {
  let total = ZERO;
  for (const byClass of state.positions.values()) {
    for (const shares of byClass.values()) total = total.add(shares);
  }
  return total;
}

function money(d: Decimal): string {
  return `$${d.toDecimalPlaces(2).toNumber().toLocaleString("en-US")}`;
}

function num(d: Decimal, dp = 0): string {
  return d.toDecimalPlaces(dp).toNumber().toLocaleString("en-US");
}

/** Simple annual interest on a 365-day year between two ISO dates. */
export function accruedNoteValue(note: NoteState, asOf: string): Decimal {
  const start = Date.parse(note.issueDate);
  const end = Date.parse(asOf);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return note.principal;
  const days = new Decimal(end - start).div(86_400_000);
  const interest = note.principal.mul(note.interestRate).mul(days.div(365));
  return note.principal.add(interest);
}

/**
 * MFN: before conversion, an MFN SAFE adopts the most favorable terms of any
 * other outstanding SAFE — the lowest valuation cap and the highest discount.
 */
function resolveMfn(safes: SafeState[], warnings: string[]): SafeState[] {
  return safes.map((s) => {
    if (!s.mfn) return s;
    let best = { ...s };
    for (const other of safes) {
      if (other.instrumentId === s.instrumentId) continue;
      if (other.valuationCap && (!best.valuationCap || other.valuationCap.lt(best.valuationCap))) {
        best = { ...best, valuationCap: other.valuationCap, capType: other.capType };
        warnings.push(
          `MFN: ${s.instrumentId} adopted the ${money(other.valuationCap)} cap from ${other.instrumentId}`
        );
      }
      if (other.discount && (!best.discount || other.discount.gt(best.discount))) {
        best = { ...best, discount: other.discount };
      }
    }
    return best;
  });
}

/**
 * The priced-round solver. Circular system: PPS depends on the pre-money
 * fully-diluted count, which depends on SAFE/note conversion shares and the
 * new pool top-up, which depend on PPS. Iterative fixed-point solve; throws
 * on non-convergence.
 *
 * Conventions (matching YC's post-money SAFE mechanics):
 * - PPS = preMoney / preMoneyFD, where preMoneyFD = issued FD + existing
 *   unissued pool + all conversion shares + the pool increase.
 * - Post-money SAFEs: each claims principal/cap of the "company
 *   capitalization" — issued FD + existing unissued pool + ALL converting
 *   instruments' shares, but EXCLUDING the new pool increase and new money.
 *   Solved in closed form: C = base / (1 − ΣF), then validated in the loop.
 * - Pre-money SAFEs / notes (original YC convention): conversion price =
 *   cap / company capitalization, where company capitalization EXCLUDES
 *   converting securities but INCLUDES the pool increase — so pre-money
 *   holders share pool-shuffle dilution, unlike post-money holders.
 * - Every instrument converts at the better of its cap price and its
 *   discount price.
 */
function applyPricedRound(
  state: InternalState,
  ev: Extract<CapEventPayload, { kind: "priced_round" }>,
  effectiveDate: string
): void {
  const preMoney = new Decimal(ev.preMoneyValuation);
  const newMoney = new Decimal(ev.newMoney);
  const targetPool = ev.targetPoolPctPost != null ? new Decimal(ev.targetPoolPctPost) : null;
  const closeDate = ev.closeDate ?? effectiveDate;
  const d = state.derivations;

  const issuedFD = issuedFullyDiluted(state);
  const existingPool = state.poolUnissued;
  const baseFD = issuedFD.add(existingPool); // pre-conversion, pre-pool-increase FD

  const safes = resolveMfn(state.safes, state.warnings);
  const notes = state.notes;

  // Post-money SAFE closed form: ΣF of post-money-cap instruments.
  let sumPostMoneyFraction = ZERO;
  for (const s of safes) {
    if (s.capType === "post_money" && s.valuationCap) {
      sumPostMoneyFraction = sumPostMoneyFraction.add(s.principal.div(s.valuationCap));
    }
  }
  if (sumPostMoneyFraction.gte(1)) {
    throw new Error("Post-money SAFE ownership fractions sum to ≥ 100% — caps are inconsistent");
  }

  /**
   * Given a candidate PPS, resolve conversions and the pool top-up. The
   * inner poolAdd ↔ pre-money-cap-conversion circularity is its own small
   * fixed point (fast: the coupling coefficient is tiny in practice).
   */
  function evaluate(pps: Decimal): {
    conversionShares: Map<string, Decimal>;
    poolAdd: Decimal;
  } {
    let poolAdd = ZERO;
    let conversionShares = new Map<string, Decimal>();

    for (let inner = 0; inner < 200; inner++) {
      conversionShares = new Map();

      // Company capitalization for pre-money caps (original YC convention):
      // issued FD + existing pool + pool increase, EXCLUDING converting
      // securities.
      const preMoneyCompanyCap = baseFD.add(poolAdd);

      let noteShares = ZERO;
      for (const n of notes) {
        const value = accruedNoteValue(n, closeDate);
        const discountPrice = n.discount ? pps.mul(new Decimal(1).sub(n.discount)) : null;
        const capPrice =
          n.capType === "pre_money" && n.valuationCap
            ? n.valuationCap.div(preMoneyCompanyCap)
            : null;
        const price = bestPrice(discountPrice, capPrice, pps);
        const shares = value.div(price);
        conversionShares.set(n.instrumentId, shares);
        noteShares = noteShares.add(shares);
      }

      // Post-money SAFEs: each is promised principal/cap of the company
      // capitalization INCLUDING all converting securities but excluding
      // the pool increase and new money. Closed form given note shares:
      // C = (base + noteShares) / (1 − ΣF).
      const postMoneyC = baseFD.add(noteShares).div(new Decimal(1).sub(sumPostMoneyFraction));
      for (const s of safes) {
        if (s.capType === "post_money" && s.valuationCap) {
          const capShares = s.principal.div(s.valuationCap).mul(postMoneyC);
          // A post-money SAFE with a discount converts at the better of the two.
          const discountShares = s.discount
            ? s.principal.div(pps.mul(new Decimal(1).sub(s.discount)))
            : ZERO;
          conversionShares.set(s.instrumentId, Decimal.max(capShares, discountShares));
        }
      }

      // Pre-money / uncapped SAFEs.
      for (const s of safes) {
        if (s.capType === "post_money") continue;
        const discountPrice = s.discount ? pps.mul(new Decimal(1).sub(s.discount)) : null;
        const capPrice =
          s.capType === "pre_money" && s.valuationCap
            ? s.valuationCap.div(preMoneyCompanyCap)
            : null;
        const price = bestPrice(discountPrice, capPrice, pps);
        conversionShares.set(s.instrumentId, s.principal.div(price));
      }

      if (!targetPool) break;

      // Pool top-up to hit target % of post-round FD:
      // want existingPool + poolAdd = t · (postExPool + existingPool + poolAdd)
      // ⇒ poolAdd = (t·postExPool − (1−t)·existingPool) / (1−t)
      const totalConversion = sumOf(conversionShares);
      const newShares = newMoney.div(pps);
      const postExPool = issuedFD.add(totalConversion).add(newShares);
      const oneMinusT = new Decimal(1).sub(targetPool);
      const nextPoolAdd = Decimal.max(
        ZERO,
        targetPool.mul(postExPool).sub(oneMinusT.mul(existingPool)).div(oneMinusT)
      );
      if (nextPoolAdd.sub(poolAdd).abs().lt(new Decimal("1e-9"))) {
        poolAdd = nextPoolAdd;
        break;
      }
      poolAdd = nextPoolAdd;
    }

    return { conversionShares, poolAdd };
  }

  /**
   * Residual g(pps) = pps · preMoneyFD(pps) − preMoney. Monotonically
   * increasing in pps (new-money and discount terms contribute constants;
   * base grows linearly), so bisection is robust — including across the
   * piecewise kinks where an instrument switches between cap and discount
   * pricing.
   */
  function residual(pps: Decimal): Decimal {
    const { conversionShares, poolAdd } = evaluate(pps);
    const preMoneyFD = baseFD.add(sumOf(conversionShares)).add(poolAdd);
    return pps.mul(preMoneyFD).sub(preMoney);
  }

  // Upper bound: with conversions and pool ≥ 0, pps ≤ preMoney/baseFD.
  let hi = preMoney.div(baseFD);
  if (residual(hi).lt(0)) {
    // Shouldn't happen (g(hi) ≥ 0 by construction), but guard anyway.
    for (let i = 0; i < 60 && residual(hi).lt(0); i++) hi = hi.mul(2);
  }
  // Lower bound: walk down until the residual goes negative. If it never
  // does, the pool target + instrument terms consume the entire pre-money —
  // there is no valid price.
  let lo = hi;
  let found = false;
  for (let i = 0; i < 200; i++) {
    lo = lo.div(2);
    if (residual(lo).lt(0)) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error(
      `Priced round "${ev.name}": no valid price per share — the pool target and converting instruments consume the entire pre-money valuation`
    );
  }

  let pps = lo.add(hi).div(2);
  for (let i = 0; i < 300; i++) {
    const r = residual(pps);
    if (r.abs().div(preMoney).lt(new Decimal("1e-18"))) break;
    if (r.gt(0)) hi = pps;
    else lo = pps;
    pps = lo.add(hi).div(2);
  }

  const { conversionShares, poolAdd } = evaluate(pps);

  const totalConversion = sumOf(conversionShares);
  const preMoneyFD = baseFD.add(totalConversion).add(poolAdd);

  d.push({
    label: `${ev.name}: price per share`,
    math: `${money(preMoney)} pre-money ÷ ${num(preMoneyFD, 4)} FD shares (incl. conversions + pool) = ${money(pps.toDecimalPlaces(6))}/sh`,
  });

  // Issue conversion shares.
  for (const s of safes) {
    const shares = conversionShares.get(s.instrumentId);
    if (!shares) continue;
    registerStakeholder(state, {
      id: s.stakeholderId,
      name: s.stakeholderName,
      kind: s.stakeholderKind,
    });
    addShares(state, s.stakeholderId, ev.classId, shares);
    const effPrice = s.principal.div(shares);
    d.push({
      label: `SAFE converts: ${s.stakeholderName}`,
      math: `${money(s.principal)} ÷ ${money(effPrice.toDecimalPlaces(6))}/sh = ${num(shares, 0)} shares${
        s.capType === "post_money" && s.valuationCap
          ? ` (${s.principal.div(s.valuationCap).mul(100).toDecimalPlaces(2)}% via ${money(s.valuationCap)} post-money cap)`
          : ""
      }`,
    });
  }
  for (const n of notes) {
    const shares = conversionShares.get(n.instrumentId);
    if (!shares) continue;
    const value = accruedNoteValue(n, closeDate);
    registerStakeholder(state, {
      id: n.stakeholderId,
      name: n.stakeholderName,
      kind: n.stakeholderKind,
    });
    addShares(state, n.stakeholderId, ev.classId, shares);
    d.push({
      label: `Note converts: ${n.stakeholderName}`,
      math: `${money(value)} (incl. interest) ÷ ${money(value.div(shares).toDecimalPlaces(6))}/sh = ${num(shares, 0)} shares`,
    });
  }
  state.safes = [];
  state.notes = [];

  // Pool increase (the option-pool shuffle — dilutes existing holders, not
  // the new investors).
  if (poolAdd.gt(0)) {
    state.poolUnissued = state.poolUnissued.add(poolAdd);
    d.push({
      label: `${ev.name}: pool top-up`,
      math: `Pool increased by ${num(poolAdd, 0)} shares pre-close so unissued pool = ${targetPool?.mul(100)}% of post-round FD — this dilution lands on existing holders, not the new investors`,
    });
  }

  // New money.
  for (const p of ev.participations) {
    const amount = new Decimal(p.amount);
    const shares = amount.div(pps);
    registerStakeholder(state, p.stakeholder);
    addShares(state, p.stakeholder.id, ev.classId, shares);
    d.push({
      label: `${ev.name}: ${p.stakeholder.name} invests`,
      math: `${money(amount)} ÷ ${money(pps.toDecimalPlaces(6))}/sh = ${num(shares, 0)} shares`,
    });
  }
  const totalNewMoney = ev.participations.reduce((acc, p) => acc.add(p.amount), ZERO);
  if (totalNewMoney.sub(newMoney).abs().gt(new Decimal("0.01"))) {
    state.warnings.push(
      `Round "${ev.name}": participations (${money(totalNewMoney)}) don't sum to newMoney (${money(newMoney)})`
    );
  }

  state.pricePerShare = pps;
  state.lastRoundName = ev.name;
}

function bestPrice(
  discountPrice: Decimal | null,
  capPrice: Decimal | null,
  pps: Decimal
): Decimal {
  // The investor gets the LOWEST price available to them (most shares).
  const candidates = [discountPrice, capPrice].filter((p): p is Decimal => p != null && p.gt(0));
  if (candidates.length === 0) return pps;
  return Decimal.min(...candidates, pps);
}

function sumOf(map: Map<string, Decimal>): Decimal {
  let t = ZERO;
  for (const v of map.values()) t = t.add(v);
  return t;
}

export function foldCapTable(
  rawEvents: CapEventInput[],
  opts?: { throughSeq?: number }
): CapTableState {
  const state: InternalState = {
    positions: new Map(),
    stakeholderMeta: new Map(),
    poolUnissued: ZERO,
    safes: [],
    notes: [],
    derivations: [],
    warnings: [],
  };

  const events = rawEvents
    .map((e) => CapEventInput.parse(e))
    .sort((a, b) => a.seq - b.seq)
    .filter((e) => opts?.throughSeq == null || e.seq <= opts.throughSeq);

  const seen = new Set<number>();
  for (const e of events) {
    if (seen.has(e.seq)) throw new Error(`Duplicate event seq ${e.seq}`);
    seen.add(e.seq);
  }

  for (const event of events) {
    const p = event.payload;
    switch (p.kind) {
      case "founding_issuance":
      case "share_issuance": {
        registerStakeholder(state, p.stakeholder);
        addShares(state, p.stakeholder.id, p.classId, new Decimal(p.shares));
        break;
      }
      case "pool_create":
      case "pool_increase": {
        state.poolUnissued = state.poolUnissued.add(new Decimal(p.shares));
        break;
      }
      case "option_grant": {
        const shares = new Decimal(p.shares);
        if (shares.gt(state.poolUnissued)) {
          throw new Error(
            `Option grant of ${num(shares)} exceeds unissued pool of ${num(state.poolUnissued)}`
          );
        }
        state.poolUnissued = state.poolUnissued.sub(shares);
        registerStakeholder(state, p.stakeholder);
        addShares(state, p.stakeholder.id, p.classId, shares);
        break;
      }
      case "safe_issue": {
        if (p.capType !== "uncapped" && !p.valuationCap) {
          throw new Error(`SAFE ${p.instrumentId}: ${p.capType} cap requires valuationCap`);
        }
        if (p.capType === "uncapped" && !p.discount && !p.mfn) {
          state.warnings.push(
            `SAFE ${p.instrumentId} is uncapped with no discount or MFN — converts at the round price`
          );
        }
        state.safes.push({
          instrumentId: p.instrumentId,
          stakeholderId: p.stakeholder.id,
          stakeholderName: p.stakeholder.name,
          stakeholderKind: p.stakeholder.kind,
          principal: new Decimal(p.principal),
          capType: p.capType,
          valuationCap: p.valuationCap ? new Decimal(p.valuationCap) : undefined,
          discount: p.discount ? new Decimal(p.discount) : undefined,
          mfn: p.mfn ?? false,
        });
        break;
      }
      case "note_issue": {
        state.notes.push({
          instrumentId: p.instrumentId,
          stakeholderId: p.stakeholder.id,
          stakeholderName: p.stakeholder.name,
          stakeholderKind: p.stakeholder.kind,
          principal: new Decimal(p.principal),
          interestRate: new Decimal(p.interestRate ?? 0),
          issueDate: p.issueDate,
          capType: p.capType,
          valuationCap: p.valuationCap ? new Decimal(p.valuationCap) : undefined,
          discount: p.discount ? new Decimal(p.discount) : undefined,
        });
        break;
      }
      case "priced_round": {
        applyPricedRound(state, p, event.effectiveDate);
        break;
      }
      case "share_transfer": {
        const from = state.positions.get(p.fromStakeholderId)?.get(p.classId);
        const shares = new Decimal(p.shares);
        if (!from || from.lt(shares)) {
          throw new Error(
            `Transfer of ${num(shares)} exceeds ${p.fromStakeholderId}'s ${p.classId} position`
          );
        }
        state.positions.get(p.fromStakeholderId)!.set(p.classId, from.sub(shares));
        registerStakeholder(state, p.toStakeholder);
        addShares(state, p.toStakeholder.id, p.classId, shares);
        break;
      }
      case "stock_split": {
        const ratio = new Decimal(p.numerator).div(p.denominator);
        for (const byClass of state.positions.values()) {
          for (const [classId, shares] of byClass) {
            byClass.set(classId, shares.mul(ratio));
          }
        }
        state.poolUnissued = state.poolUnissued.mul(ratio);
        if (state.pricePerShare) state.pricePerShare = state.pricePerShare.div(ratio);
        break;
      }
    }
  }

  // Materialize rows.
  const issuedFD = issuedFullyDiluted(state);
  const totalFD = issuedFD.add(state.poolUnissued);
  const rows: CapTableRow[] = [];
  for (const [stakeholderId, byClass] of state.positions) {
    const meta = state.stakeholderMeta.get(stakeholderId)!;
    let total = ZERO;
    const classMap: Record<string, string> = {};
    for (const [classId, shares] of byClass) {
      if (shares.isZero()) continue;
      total = total.add(shares);
      classMap[classId] = shares.toFixed();
    }
    if (total.isZero()) continue;
    rows.push({
      stakeholderId,
      name: meta.name,
      kind: meta.kind,
      shares: total.toFixed(),
      pct: totalFD.gt(0) ? total.div(totalFD).toNumber() : 0,
      byClass: classMap,
    });
  }
  if (state.poolUnissued.gt(0)) {
    rows.push({
      stakeholderId: "__pool__",
      name: "Option pool (unissued)",
      kind: "pool",
      shares: state.poolUnissued.toFixed(),
      pct: totalFD.gt(0) ? state.poolUnissued.div(totalFD).toNumber() : 0,
      byClass: { pool: state.poolUnissued.toFixed() },
    });
  }
  rows.sort((a, b) => new Decimal(b.shares).cmp(new Decimal(a.shares)));

  const outstanding: OutstandingInstrument[] = [
    ...state.safes.map((s) => ({
      instrumentId: s.instrumentId,
      holder: s.stakeholderName,
      type: "safe" as const,
      principal: s.principal.toFixed(2),
      capType: s.capType,
      valuationCap: s.valuationCap?.toFixed(2),
      discount: s.discount?.toNumber(),
      mfn: s.mfn,
    })),
    ...state.notes.map((n) => ({
      instrumentId: n.instrumentId,
      holder: n.stakeholderName,
      type: "note" as const,
      principal: n.principal.toFixed(2),
      capType: n.capType,
      valuationCap: n.valuationCap?.toFixed(2),
      discount: n.discount?.toNumber(),
    })),
  ];

  return {
    engineVersion: ENGINE_VERSION,
    rows,
    totalFullyDiluted: totalFD.toFixed(),
    poolUnissued: state.poolUnissued.toFixed(),
    outstanding,
    pricePerShare: state.pricePerShare?.toFixed(10),
    lastRoundName: state.lastRoundName,
    derivations: state.derivations,
    warnings: state.warnings,
  };
}
