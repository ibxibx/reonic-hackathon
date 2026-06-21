/**
 * A1 — Synthetic labeled corpus generator.
 *
 * Deterministic-by-seed population. Each lead's raw attributes are sampled from
 * plausible ranges; economics covariates are derived through the SAME
 * `computeSolarEconomics` used in live feature assembly. Daily outcomes are
 * drawn from a known latent competing-risks process (multinomial logits in
 * STANDARDIZED space, reference = stay), so downstream fitters can check
 * coefficient recovery. The clock advances exactly like
 * contracts.TIME_VARYING_FEATURES, so training/inference clocks agree.
 *
 * Purity: NO Date.now / Math.random. All randomness flows from mulberry32(seed).
 * Synthetic rows are flagged `synthetic: true` and never mixed into real data.
 */
import {
  FEATURE_NAMES,
  FEATURE_COUNT,
} from './contracts';
import type {
  FeatureName,
  GenerateSyntheticCorpus,
  PeriodOutcome,
  PersonPeriodRow,
  SyntheticCorpus,
  SyntheticLeadLabel,
  SyntheticOptions,
  SyntheticRegime,
  TerminalOutcome,
} from './contracts';
import { advanceCovariates } from './person-period';
import {
  computeSolarEconomics,
  type FinancingType,
} from '../solar';

// ─── Seeded RNG (mulberry32) ────────────────────────────────────────────────

/** Classic mulberry32: deterministic uint32-seeded PRNG returning [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [lo, hi). */
function uniform(rng: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** Pick one element of `arr` uniformly. */
function pick<T>(rng: () => number, arr: readonly T[]): T {
  const i = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[i];
}

// ─── Fixed standardization (internal, reproducible) ─────────────────────────
//
// These rough means/sds are FIXED so the latent process is reproducible and the
// standardized logits stay well-scaled. They are intentionally hand-set (not
// learned) and live only in this module. Keys are FEATURE_NAMES; any feature
// not listed defaults to mean 0, sd 1.

const FEATURE_STATS: Partial<Record<FeatureName, { mean: number; sd: number }>> =
  {
    monthlyBill: { mean: 300, sd: 130 },
    systemSizeKw: { mean: 9, sd: 3 },
    totalCost: { mean: 26000, sd: 8000 },
    costPerKw: { mean: 2900, sd: 400 },
    simplePaybackYears: { mean: 14, sd: 6 },
    monthlySavingsRatio: { mean: 0.6, sd: 0.3 },
    roi25yrRatio: { mean: 1.2, sd: 0.6 },
    financingAdjustedUpfront: { mean: 13000, sd: 12000 },
    personaConfidence: { mean: 0.7, sd: 0.2 },
    messagesSent: { mean: 4, sd: 3 },
    messagesFailed: { mean: 0.3, sd: 0.7 },
    distinctChannels: { mean: 2, sd: 1 },
    maxSequenceOrder: { mean: 4, sd: 3 },
    daysSinceLastTouch: { mean: 6, sd: 5 },
    stepProgressRatio: { mean: 0.5, sd: 0.3 },
    daysToNextAction: { mean: 2, sd: 3 },
    daysInPipeline: { mean: 12, sd: 8 },
    daysSinceLatestStrategy: { mean: 10, sd: 7 },
    signProbSlope: { mean: 0, sd: 1 },
    ghostRiskSlope: { mean: 0, sd: 1 },
    awaitingReply: { mean: 0.4, sd: 0.5 },
    hasStrategy: { mean: 0.8, sd: 0.4 },
    financingIsCash: { mean: 0.4, sd: 0.5 },
    financingIsLoan: { mean: 0.4, sd: 0.5 },
    personaInvestor: { mean: 0.25, sd: 0.43 },
    personaSkeptic: { mean: 0.25, sd: 0.43 },
  };

const MEANS: number[] = FEATURE_NAMES.map(
  (n) => FEATURE_STATS[n]?.mean ?? 0
);
const SDS: number[] = FEATURE_NAMES.map((n) => {
  const sd = FEATURE_STATS[n]?.sd ?? 1;
  return sd > 0 ? sd : 1;
});

function standardize(xRaw: number[]): number[] {
  const z = new Array<number>(FEATURE_COUNT);
  for (let i = 0; i < FEATURE_COUNT; i++) {
    z[i] = (xRaw[i] - MEANS[i]) / SDS[i];
  }
  return z;
}

// ─── Latent coefficient rows in STANDARDIZED space ──────────────────────────
//
// Returned in `trueCoefficients` so A2/A3 can score recovery. Each row is
// [intercept, ...betas] aligned to FEATURE_NAMES. Daily hazards are kept small
// (intercepts ~ -3.5) so most periods are `stay`. Betas are sparse & signed to
// encode believable drivers.

const SIGN_BETAS_BY_NAME: Partial<Record<FeatureName, number>> = {
  monthlySavingsRatio: 0.6, // better savings → more likely to sign
  roi25yrRatio: 0.5,
  personaConfidence: 0.3,
  hasStrategy: 0.4,
  stepProgressRatio: 0.5,
  awaitingReply: -0.3, // waiting on them → not signing yet
  daysSinceLastTouch: -0.2,
  simplePaybackYears: -0.4, // longer payback → less likely to sign
  costPerKw: -0.25,
};

const GHOST_BETAS_BY_NAME: Partial<Record<FeatureName, number>> = {
  daysSinceLastTouch: 0.7, // gone quiet → ghosting
  daysInPipeline: 0.3,
  messagesFailed: 0.4,
  simplePaybackYears: 0.3,
  awaitingReply: 0.4,
  monthlySavingsRatio: -0.4, // good economics → less likely to ghost
  personaConfidence: -0.2,
  stepProgressRatio: -0.5, // engaged in sequence → less likely to ghost
};

const SIGN_INTERCEPT_BASE = -3.5;
const GHOST_INTERCEPT_BASE = -3.5;

function betaRow(map: Partial<Record<FeatureName, number>>): number[] {
  return FEATURE_NAMES.map((n) => map[n] ?? 0);
}

/** Regime tilts the two intercepts only (keeps betas comparable across runs). */
function regimeIntercepts(regime: SyntheticRegime): {
  sign: number;
  ghost: number;
} {
  switch (regime) {
    case 'high-ghost':
      return { sign: SIGN_INTERCEPT_BASE - 0.6, ghost: GHOST_INTERCEPT_BASE + 1.0 };
    case 'high-sign':
      return { sign: SIGN_INTERCEPT_BASE + 1.0, ghost: GHOST_INTERCEPT_BASE - 0.6 };
    case 'balanced':
    default:
      return { sign: SIGN_INTERCEPT_BASE, ghost: GHOST_INTERCEPT_BASE };
  }
}

// ─── Raw attribute → x0 vector ──────────────────────────────────────────────

const set = (x: number[], name: FeatureName, v: number) => {
  x[FEATURE_NAMES.indexOf(name)] = v;
};

const PERSONAS_4 = ['family', 'investor', 'environmentalist', 'skeptic'] as const;
const FINANCINGS_4: readonly FinancingType[] = ['cash', 'loan', 'lease', 'PPA'];

interface RawAttrs {
  monthlyBill: number;
  systemSizeKw: number;
  totalCost: number;
  financing: FinancingType;
  persona: (typeof PERSONAS_4)[number];
  personaConfidence: number;
  messagesSent: number;
  messagesFailed: number;
  distinctChannels: number;
  maxSequenceOrder: number;
  stepProgressRatio: number;
}

function sampleAttrs(rng: () => number): RawAttrs {
  const monthlyBill = uniform(rng, 80, 600);
  const systemSizeKw = uniform(rng, 4, 14);
  const costPerKw = uniform(rng, 2200, 3600);
  const totalCost = systemSizeKw * costPerKw;
  const financing = pick(rng, FINANCINGS_4);
  const persona = pick(rng, PERSONAS_4);
  return {
    monthlyBill,
    systemSizeKw,
    totalCost,
    financing,
    persona,
    personaConfidence: uniform(rng, 0.4, 0.95),
    messagesSent: Math.floor(uniform(rng, 1, 8)),
    messagesFailed: rng() < 0.25 ? Math.floor(uniform(rng, 1, 3)) : 0,
    distinctChannels: Math.floor(uniform(rng, 1, 4)),
    maxSequenceOrder: Math.floor(uniform(rng, 1, 8)),
    stepProgressRatio: uniform(rng, 0, 1),
  };
}

/** Build the RAW x0 covariate vector (FEATURE_NAMES order) at t=0. */
function buildX0(attrs: RawAttrs): number[] {
  const x = new Array<number>(FEATURE_COUNT).fill(0);

  const econ = computeSolarEconomics({
    monthlyBill: attrs.monthlyBill,
    systemSizeKw: attrs.systemSizeKw,
    totalCost: attrs.totalCost,
    financingType: attrs.financing,
  });

  // structured / economics
  set(x, 'monthlyBill', attrs.monthlyBill);
  set(x, 'systemSizeKw', attrs.systemSizeKw);
  set(x, 'totalCost', attrs.totalCost);
  set(x, 'costPerKw', econ.costPerKw);
  set(x, 'simplePaybackYears', econ.simplePaybackYears);
  set(x, 'monthlySavingsRatio', econ.monthlySavingsRatio);
  set(x, 'roi25yrRatio', econ.roi25yrRatio);
  set(x, 'financingAdjustedUpfront', econ.financingAdjustedUpfront);
  set(x, 'personaConfidence', attrs.personaConfidence);

  // engagement (plausible at t0)
  set(x, 'messagesSent', attrs.messagesSent);
  set(x, 'messagesFailed', attrs.messagesFailed);
  set(x, 'distinctChannels', attrs.distinctChannels);
  set(x, 'maxSequenceOrder', attrs.maxSequenceOrder);
  set(x, 'daysSinceLastTouch', 0); // just touched at entry
  set(x, 'stepProgressRatio', attrs.stepProgressRatio);
  set(x, 'daysToNextAction', 2); // a follow-up is queued

  // temporal (entry)
  set(x, 'daysInPipeline', 0);
  set(x, 'daysSinceLatestStrategy', 0);

  // trend slopes are 0 at t0 (no prior predictions yet)
  set(x, 'signProbSlope', 0);
  set(x, 'ghostRiskSlope', 0);

  // booleans / one-hots
  set(x, 'awaitingReply', attrs.stepProgressRatio > 0.5 ? 1 : 0);
  set(x, 'hasStrategy', 1);
  set(x, 'financingIsCash', attrs.financing === 'cash' ? 1 : 0);
  set(x, 'financingIsLoan', attrs.financing === 'loan' ? 1 : 0);
  set(x, 'personaInvestor', attrs.persona === 'investor' ? 1 : 0);
  set(x, 'personaSkeptic', attrs.persona === 'skeptic' ? 1 : 0);

  return x;
}

// ─── Latent daily competing-risks draw ──────────────────────────────────────

function dot(beta: number[], z: number[]): number {
  let s = 0;
  for (let i = 0; i < z.length; i++) s += beta[i] * z[i];
  return s;
}

/**
 * Given standardized covariates and the two beta rows (incl. intercept), draw
 * one period's outcome. Reference category is `stay` (logit 0); sign/ghost get
 * exp(logit); softmax over {stay, sign, ghost}.
 */
function drawOutcome(
  rng: () => number,
  z: number[],
  signRow: number[],
  ghostRow: number[]
): PeriodOutcome {
  const lSign = signRow[0] + dot(signRow.slice(1), z);
  const lGhost = ghostRow[0] + dot(ghostRow.slice(1), z);
  const eSign = Math.exp(lSign);
  const eGhost = Math.exp(lGhost);
  const denom = 1 + eSign + eGhost; // stay = exp(0) = 1
  const pStay = 1 / denom;
  const pSign = eSign / denom;
  // pGhost is the remainder
  const u = rng();
  if (u < pStay) return 'stay';
  if (u < pStay + pSign) return 'sign';
  return 'ghost';
}

// ─── Public generator ───────────────────────────────────────────────────────

export const generateSyntheticCorpus: GenerateSyntheticCorpus = (
  opts: SyntheticOptions
): SyntheticCorpus => {
  const seed = opts.seed;
  const nLeads = opts.nLeads ?? 400;
  const maxDays = opts.maxDays ?? 30;
  const regime: SyntheticRegime = opts.regime ?? 'balanced';

  const rng = mulberry32(seed);

  const { sign: signIntercept, ghost: ghostIntercept } =
    regimeIntercepts(regime);
  const signRow = [signIntercept, ...betaRow(SIGN_BETAS_BY_NAME)];
  const ghostRow = [ghostIntercept, ...betaRow(GHOST_BETAS_BY_NAME)];
  const trueCoefficients = [signRow, ghostRow];

  const rows: PersonPeriodRow[] = [];
  const labels: SyntheticLeadLabel[] = [];

  for (let i = 0; i < nLeads; i++) {
    const leadId = `syn-${seed}-${i}`;
    const attrs = sampleAttrs(rng);
    const x0 = buildX0(attrs);

    let current = x0;
    let terminal: TerminalOutcome = 'censored';
    let daysObserved = 0;

    for (let t = 0; t < maxDays; t++) {
      const z = standardize(current);
      const outcome = drawOutcome(rng, z, signRow, ghostRow);
      daysObserved = t + 1;
      rows.push({
        leadId,
        t,
        outcome,
        x: current.slice(),
        synthetic: true,
      });
      if (outcome === 'sign' || outcome === 'ghost') {
        terminal = outcome;
        break; // absorbed: no rows after this
      }
      // not absorbed → roll the clock forward by exactly one day-period
      current = advanceCovariates(current, 1);
    }

    labels.push({
      leadId,
      terminal,
      daysObserved,
      features: x0.slice(),
    });
  }

  return {
    rows,
    labels,
    seed,
    regime,
    trueCoefficients,
  };
};
