/**
 * A1 — Person-period expansion.
 * Expands a lead timeline into one row per active day-period with outcome ∈
 * {stay, sign, ghost}; no rows after absorption; correct right-censoring.
 * `advanceCovariates` rolls a RAW covariate vector forward under the
 * no-additional-touch counterfactual using contracts.TIME_VARYING_FEATURES —
 * shared with A3's cumulative-incidence clock so training and inference agree.
 */
import {
  FEATURE_NAMES,
  TIME_VARYING_FEATURES,
} from './contracts';
import type {
  PeriodOutcome,
  PersonPeriodRow,
  TerminalOutcome,
} from './contracts';

/** Minimal timeline description an active lead is expanded from. */
export interface LeadTimeline {
  leadId: string;
  /** RAW covariate vector at entry (FEATURE_NAMES order) */
  x0: number[];
  terminal: TerminalOutcome;
  /** number of active day-periods observed before absorption/censor */
  daysObserved: number;
  synthetic: boolean;
}

/**
 * Pre-resolved indices of the time-varying features in FEATURE_NAMES order,
 * paired with their per-period deltas. Resolved once at module load so the hot
 * path does no string lookups. Indices that fail to resolve are dropped (they
 * cannot occur given the frozen contract, but we stay defensive).
 */
const TIME_VARYING_INDICES: ReadonlyArray<{ index: number; delta: number }> =
  TIME_VARYING_FEATURES.map((f) => ({
    index: FEATURE_NAMES.indexOf(f.name),
    delta: f.perPeriodDelta,
  })).filter((e) => e.index >= 0);

/**
 * Return a NEW raw covariate vector advanced by `periods` day-periods under the
 * no-additional-touch counterfactual. Each TIME_VARYING_FEATURES entry moves by
 * perPeriodDelta * periods; every other feature is copied unchanged. Pure: the
 * input array is never mutated.
 */
export function advanceCovariates(xRaw: number[], periods: number): number[] {
  const out = xRaw.slice();
  if (periods === 0) return out;
  for (const { index, delta } of TIME_VARYING_INDICES) {
    if (index < out.length) {
      out[index] = out[index] + delta * periods;
    }
  }
  return out;
}

/**
 * Expand a single lead timeline into person-period rows, one per active day.
 *
 *  - Rows are emitted for t = 0 .. daysObserved-1.
 *  - Covariates for period t = advanceCovariates(x0, t).
 *  - Every period's outcome is "stay" except the final period:
 *      • terminal sign|ghost → the final row carries that absorbing outcome
 *      • terminal censored    → all rows (incl. final) stay (no absorption seen)
 *  - daysObserved is taken as whole periods (floored); <= 0 (or NaN) → no rows.
 */
export function expandToPersonPeriods(
  timeline: LeadTimeline
): PersonPeriodRow[] {
  const { leadId, x0, terminal, synthetic } = timeline;
  // Periods are whole days. Flooring keeps every integer input identical while
  // making a fractional daysObserved (e.g. 3.5) safe: without it the loop would
  // emit ⌈daysObserved⌉ rows yet no integer t would equal the fractional
  // lastIndex, so `isFinal` would never fire and a sign/ghost absorption would
  // be silently dropped (the lead would be mislabeled censored). NaN floors to
  // NaN, for which `<= 0` is false and the loop guard `t < NaN` is false, so we
  // normalize it to 0 (no rows) explicitly.
  const daysObserved = Math.floor(timeline.daysObserved);
  if (!(daysObserved > 0)) return [];

  const absorbing: PeriodOutcome | null =
    terminal === 'sign' || terminal === 'ghost' ? terminal : null;

  const rows: PersonPeriodRow[] = [];
  const lastIndex = daysObserved - 1;
  for (let t = 0; t < daysObserved; t++) {
    const isFinal = t === lastIndex;
    const outcome: PeriodOutcome =
      isFinal && absorbing !== null ? absorbing : 'stay';
    rows.push({
      leadId,
      t,
      outcome,
      x: advanceCovariates(x0, t),
      synthetic,
    });
  }
  return rows;
}
