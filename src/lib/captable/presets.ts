import type { CapEventPayload } from "./types";

/**
 * Lab presets — the situations grantees actually walk in with. Each is an
 * ordered list of event payloads instantiated on cap-table creation; the
 * founder can then rename stakeholders and adjust numbers in the ledger.
 */

export type Preset = {
  key: string;
  name: string;
  description: string;
  events: { label: string; payload: CapEventPayload }[];
};

const foundersBase = (aliceShares: number, bobShares: number): Preset["events"] => [
  {
    label: "Founding issuance",
    payload: {
      kind: "founding_issuance",
      stakeholder: { id: "founder-1", name: "Founder 1", kind: "founder" },
      classId: "common",
      shares: aliceShares,
    },
  },
  {
    label: "Founding issuance",
    payload: {
      kind: "founding_issuance",
      stakeholder: { id: "founder-2", name: "Founder 2", kind: "founder" },
      classId: "common",
      shares: bobShares,
    },
  },
];

export const PRESETS: Preset[] = [
  {
    key: "blank",
    name: "Blank",
    description: "Start from an empty ledger.",
    events: [],
  },
  {
    key: "founder-split",
    name: "Founder split",
    description: "Two founders (60/40) plus a 10% option pool — the day-zero table.",
    events: [
      ...foundersBase(5_400_000, 3_600_000),
      {
        label: "Option pool",
        payload: { kind: "pool_create", classId: "pool", shares: 1_000_000 },
      },
    ],
  },
  {
    key: "pitch-comp-safe",
    name: "Pitch competition SAFE",
    description:
      "You won $60K at a pitch comp on a $1.5M post-money SAFE — that's 4% promised. What does it mean at your seed?",
    events: [
      ...foundersBase(5_000_000, 5_000_000),
      {
        label: "$60K pitch-competition SAFE",
        payload: {
          kind: "safe_issue",
          instrumentId: "pitch-safe",
          stakeholder: { id: "pitch-fund", name: "Pitch Competition Fund", kind: "fund" },
          principal: 60_000,
          capType: "post_money",
          valuationCap: 1_500_000,
          mfn: false,
        },
      },
    ],
  },
  {
    key: "accelerator",
    name: "Accelerator deal",
    description:
      "The classic '$125K for 7%' post-money SAFE, plus an uncapped MFN side letter — the structure most founders misread.",
    events: [
      ...foundersBase(8_500_000, 1_500_000),
      {
        label: "$125K for 7% (post-money SAFE)",
        payload: {
          kind: "safe_issue",
          instrumentId: "acc-main",
          stakeholder: { id: "accelerator", name: "Accelerator", kind: "accelerator" },
          principal: 125_000,
          capType: "post_money",
          valuationCap: Math.round(125_000 / 0.07),
          mfn: false,
        },
      },
      {
        label: "Uncapped MFN SAFE",
        payload: {
          kind: "safe_issue",
          instrumentId: "acc-mfn",
          stakeholder: { id: "accelerator", name: "Accelerator", kind: "accelerator" },
          principal: 375_000,
          capType: "uncapped",
          mfn: true,
        },
      },
    ],
  },
  {
    key: "seed-ready",
    name: "Stacked SAFEs, seed ahead",
    description:
      "Two post-money SAFEs on the books ($500K @ $8M, $750K @ $12M). Use the round preview to see the dilution stack.",
    events: [
      ...foundersBase(8_000_000, 0).slice(0, 1),
      {
        label: "First SAFE — $500K @ $8M post",
        payload: {
          kind: "safe_issue",
          instrumentId: "safe-1",
          stakeholder: { id: "angel-1", name: "Angel One", kind: "angel" },
          principal: 500_000,
          capType: "post_money",
          valuationCap: 8_000_000,
          mfn: false,
        },
      },
      {
        label: "Second SAFE — $750K @ $12M post",
        payload: {
          kind: "safe_issue",
          instrumentId: "safe-2",
          stakeholder: { id: "angel-2", name: "Angel Two", kind: "angel" },
          principal: 750_000,
          capType: "post_money",
          valuationCap: 12_000_000,
          mfn: false,
        },
      },
    ],
  },
];

export function getPreset(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}
