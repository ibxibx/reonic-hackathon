/**
 * A1 — Person-period expansion (STUB, Phase A).
 * Expands a lead timeline into one row per active day-period with outcome ∈
 * {stay, sign, ghost}; no rows after absorption; correct right-censoring.
 * `advanceCovariates` rolls a RAW covariate vector forward under the
 * no-additional-touch counterfactual using contracts.TIME_VARYING_FEATURES —
 * shared with A3's cumulative-incidence clock so training and inference agree.
 */
import type { PersonPeriodRow, TerminalOutcome } from './contracts';

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

export function expandToPersonPeriods(
  _timeline: LeadTimeline
): PersonPeriodRow[] {
  throw new Error('TODO: A1 — expandToPersonPeriods (person-period.ts)');
}

export function advanceCovariates(_xRaw: number[], _periods: number): number[] {
  throw new Error('TODO: A1 — advanceCovariates (person-period.ts)');
}
