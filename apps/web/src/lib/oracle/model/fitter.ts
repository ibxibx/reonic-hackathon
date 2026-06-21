/**
 * A2 — Logistic / multinomial regression fitter (STUB, Phase A).
 * GD+L2 (or IRLS) fitter over person-period rows, standardization utilities, and
 * softmax `predictProbabilities`. Validated against synthetic data with known
 * coefficients before use anywhere. Numerically stable (no NaN/overflow with L2).
 */
import type {
  FittedModel,
  PeriodOutcome,
  PeriodProbabilities,
  PersonPeriodRow,
  PredictProbabilities,
} from '../contracts';

export interface FitOptions {
  /** L2 penalty strength */
  l2?: number;
  maxIter?: number;
  /** learning rate (GD) */
  lr?: number;
  /** class order; classes[0] is the reference category (default ['stay','sign','ghost']) */
  classes?: PeriodOutcome[];
  modelVersion?: string;
  trainedOn?: 'synthetic' | 'real' | 'mixed';
  /** convergence tolerance on log-loss delta */
  tol?: number;
}

export function fitMultinomial(
  _rows: PersonPeriodRow[],
  _opts?: FitOptions
): FittedModel {
  throw new Error('TODO: A2 — fitMultinomial (fitter.ts)');
}

export const predictProbabilities: PredictProbabilities = (
  _model: FittedModel,
  _xRaw: number[]
): PeriodProbabilities => {
  throw new Error('TODO: A2 — predictProbabilities (fitter.ts)');
};
