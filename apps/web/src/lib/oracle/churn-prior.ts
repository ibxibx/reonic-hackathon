/**
 * REAL-WORLD CHURN GROUNDING for the ghost (churn) hazard.
 *
 * The Oracle model is trained on a synthetic corpus (cold-start: only ~3 real
 * absorbed leads exist). To ground the GHOST side in ACTUAL data rather than
 * synthetic priors alone, this module encodes published, cited real-world
 * statistics and turns them into an informative prior + base-rate anchors that
 * can be blended with the model's ghostRisk.
 *
 * HONESTY: these are REAL external statistics from ADJACENT domains (B2B/B2C
 * lead response + telecom subscription churn). They are used as PRIORS/ANCHORS,
 * not as this installer's solar outcomes, and are never presented as such. The
 * financing-commitment mapping is an explicit cross-domain ANALOG. All magnitudes
 * are bounded modeling choices anchored to the cited direction/magnitude — see
 * ORACLE_EVAL.md "Real-world grounding". Pure module: no Date.now / Math.random.
 *
 * Sources:
 *  [1] MIT / Dr. James Oldroyd & InsideSales.com, "Lead Response Management
 *      Study" (3 yrs, 6 companies, 15,000+ leads, 100,000+ dials). Odds of
 *      CONTACTING a lead drop ~100x from 5→30 min; odds of QUALIFYING drop ~21x
 *      from 5→30 min; >10x contact / >6x qualify decline within the first hour;
 *      waiting a full day drops qualify odds ~400x. → response/engagement
 *      collapses steeply with elapsed time (the mechanism of ghosting).
 *  [2] IBM "Telco Customer Churn" sample (7,043 customers): overall churn 26.5%;
 *      month-to-month contracts churn 47.4% vs 2.8% for two-year contracts
 *      (lower commitment → much higher churn).
 *  [3] Aggregated sales follow-up research: ~80% of deals need 5+ touches; ~95%
 *      of converted leads are reached by the 6th attempt; ~48% of reps never
 *      follow up once; only ~2% of sales close on first contact.
 */

/** Cited real-world constants (the raw published figures). */
export const CHURN_DATA = {
  /** [2] overall telecom churn base rate (proxy anchor for ghost base rate). */
  telcoBaseChurn: 0.265,
  /** [2] low-commitment (month-to-month) churn. */
  telcoMonthToMonthChurn: 0.474,
  /** [2] high-commitment (two-year) churn. */
  telcoTwoYearChurn: 0.028,
  /** [3] share of deals that require 5+ touches. */
  dealsNeeding5PlusTouches: 0.8,
  /** [3] converted leads reached by this attempt number. */
  touchesForMostConversions: 6,
  /** [1] qualify-odds multiplier after a full day vs 5 min (≈ 1/400). */
  qualifyOddsDropOneDay: 1 / 400,
} as const;

/**
 * Day-scale re-engagement odds multiplier in (0,1] given days since last touch.
 * Anchored to [1]: re-engagement odds collapse steeply with elapsed time. The
 * minute/hour-scale points are extreme; for the ghost-relevant DAY horizon we
 * use a conservative exponential odds decay with a documented 3-day half-life
 * (so 3d→0.5, 6d→0.25, …). The half-life is a tunable modeling choice anchored
 * to the published within-day collapse, not a fitted value.
 */
export const REENGAGEMENT_HALF_LIFE_DAYS = 3;

export function reengagementOddsMultiplier(daysSinceTouch: number): number {
  const d = Number.isFinite(daysSinceTouch) && daysSinceTouch > 0 ? daysSinceTouch : 0;
  return 0.5 ** (d / REENGAGEMENT_HALF_LIFE_DAYS);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Financing as a cross-domain commitment ANALOG of telecom contract length [2]. */
function commitmentFactor(financingType: string): number {
  // cash/loan ≈ committed (lower churn); lease/PPA ≈ low-commitment (higher).
  // Derived from the real month-to-month vs two-year direction, but BOUNDED to
  // a sane ±30% adjustment rather than the raw 47.4/2.8 spread.
  const f = (financingType || '').toLowerCase();
  if (f === 'cash' || f === 'loan') return 0.7;
  if (f === 'lease' || f === 'ppa') return 1.3;
  return 1.0;
}

export interface ChurnPriorInput {
  /** days since the last real outbound touch */
  daysSinceTouch: number;
  /** quote financing type (commitment analog) */
  financingType: string;
  /** orchestration position */
  currentStep: number;
  totalSteps: number;
}

/**
 * Literature-grounded ghost-risk PRIOR in [0,1] from the real signals available
 * pre-cold-start. Combines:
 *   • base rate [2] (telcoBaseChurn) adjusted by the financing commitment analog,
 *   • SILENCE PRESSURE from time-since-touch [1] (rises as re-engagement odds
 *     collapse), pushing toward high ghost the longer a lead is quiet,
 *   • ENGAGEMENT RELIEF from follow-up depth [3] (a lead deep in an active
 *     sequence is being worked → lower ghost).
 * Honest: this is a PRIOR, not a measurement.
 */
export function churnGhostPrior(input: ChurnPriorInput): number {
  const base = clamp01(CHURN_DATA.telcoBaseChurn * commitmentFactor(input.financingType));

  // Silence pressure: (1 - reengagement odds) scaled into the remaining headroom.
  const silence = 1 - reengagementOddsMultiplier(input.daysSinceTouch);
  const silencePressure = silence * (1 - base) * 0.6;

  // Engagement relief: progress through the sequence reduces ghost (capped 30%).
  const progress =
    input.totalSteps > 0
      ? clamp01(input.currentStep / input.totalSteps)
      : 0;
  const reliefFactor = 1 - 0.3 * progress;

  return clamp01((base + silencePressure) * reliefFactor);
}

/**
 * Shrink a model probability toward the literature prior when evidence is thin
 * (a simple convex blend). `weight` in [0,1] is the prior's pull — higher when
 * the model is synthetic/uncalibrated or the lead has little real signal.
 */
export function blendWithPrior(
  modelProbability: number,
  prior: number,
  weight: number
): number {
  const w = clamp01(weight);
  return clamp01((1 - w) * clamp01(modelProbability) + w * clamp01(prior));
}
