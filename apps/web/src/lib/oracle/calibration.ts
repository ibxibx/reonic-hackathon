/**
 * A3 — Calibration + metrics (STUB, Phase A).
 * Lead-level split (no period leakage), reliability curve + ECE + Brier + AUC,
 * Platt (and optional isotonic) recalibration with persisted CalibrationParams.
 * Backtest scaffold over real `predictions` history + final `status`.
 */
import type {
  ApplyCalibration,
  CalibrationMethod,
  CalibrationParams,
  EvalMetrics,
} from './contracts';

/** Reliability/ECE/Brier/AUC over predicted probabilities vs 0/1 labels. */
export function evaluate(
  _predicted: number[],
  _labels: number[],
  _nBins?: number
): EvalMetrics {
  throw new Error('TODO: A3 — evaluate (calibration.ts)');
}

export interface CalibrationFitInput {
  /** raw model probabilities in [0,1] */
  predicted: number[];
  /** 0/1 ground-truth labels, parallel to predicted */
  labels: number[];
  target: 'sign' | 'ghost';
  method?: CalibrationMethod;
  modelVersion?: string;
  nLabels?: number;
  trainedOn?: 'synthetic' | 'real' | 'mixed';
}

export function fitCalibration(
  _input: CalibrationFitInput
): CalibrationParams {
  throw new Error('TODO: A3 — fitCalibration (calibration.ts)');
}

export const applyCalibration: ApplyCalibration = (
  _rawProbability: number,
  _params: CalibrationParams
): number => {
  throw new Error('TODO: A3 — applyCalibration (calibration.ts)');
};
