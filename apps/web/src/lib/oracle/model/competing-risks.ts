/**
 * A3 — Competing-risks inference + factor attribution (STUB, Phase A).
 * `cumulativeIncidence`: cumulative incidence of `sign` over horizon H, and of
 * `ghost` over H under the no-additional-touch counterfactual (clock advances via
 * advanceCovariates, time-since-touch keeps rising, no reset). Outputs in [0,1];
 * ghost monotone increasing in time-since-touch.
 * `attributeFactors`: standardized-coefficient contributions (beta_j * z_ij),
 * ranked by |contribution|, top signed drivers per target.
 */
import type {
  AttributeFactors,
  CumulativeIncidence,
  CumulativeIncidenceFn,
  FittedModel,
  OracleFactor,
} from '../contracts';

export const cumulativeIncidence: CumulativeIncidenceFn = (
  _model: FittedModel,
  _baseXRaw: number[],
  _horizonDays?: number
): CumulativeIncidence => {
  throw new Error('TODO: A3 — cumulativeIncidence (competing-risks.ts)');
};

export const attributeFactors: AttributeFactors = (
  _model: FittedModel,
  _xRaw: number[],
  _target: 'sign' | 'ghost',
  _topN?: number
): OracleFactor[] => {
  throw new Error('TODO: A3 — attributeFactors (competing-risks.ts)');
};
