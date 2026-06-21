/**
 * A3 — Eval harness (STUB, Phase A).
 * Golden-case DIRECTION checks on the seed leads (qualitative, not exact values;
 * e.g. ghosted high-bill Noah → elevated ghostRisk; negotiating cash investor
 * Lukas → elevated signProbability) plus a full eval report combining
 * calibration metrics + golden results.
 */
import type {
  EvalMetrics,
  FittedModel,
  GoldenCaseResult,
  OracleFeatures,
  SyntheticCorpus,
} from './contracts';

export interface EvalReport {
  metrics: { sign: EvalMetrics; ghost: EvalMetrics };
  golden: GoldenCaseResult[];
  modelVersion: string;
  regime: string;
  notes: string[];
}

export function runGoldenCases(
  _model: FittedModel,
  _seedFeatures: OracleFeatures[]
): GoldenCaseResult[] {
  throw new Error('TODO: A3 — runGoldenCases (eval.ts)');
}

export function runEvalReport(
  _model: FittedModel,
  _corpus: SyntheticCorpus
): EvalReport {
  throw new Error('TODO: A3 — runEvalReport (eval.ts)');
}
