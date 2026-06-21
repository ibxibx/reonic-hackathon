/**
 * A3 — Calibration + metrics.
 *
 * `evaluate`: reliability curve + ECE + Brier + rank-based AUC over predicted
 * probabilities vs 0/1 labels.
 * `fitCalibration`: Platt (1-D logistic on logits) or isotonic (pool-adjacent-
 * violators) recalibration, with persisted CalibrationParams carrying the
 * before/after metrics.
 * `applyCalibration`: map a raw probability through the fitted params.
 * `calibrateFromCorpus`: lead-level (no period leakage) train/test split over a
 * SyntheticCorpus, fitting on train and reporting held-out before/after metrics.
 */
import {
  DEFAULT_HORIZON_DAYS,
  MODEL_VERSION,
} from './contracts';
import type {
  ApplyCalibration,
  CalibrationMethod,
  CalibrationParams,
  EvalMetrics,
  FittedModel,
  IsotonicParams,
  PlattParams,
  ReliabilityBin,
  SyntheticCorpus,
} from './contracts';
import { cumulativeIncidence } from './model/competing-risks';
import { mulberry32 } from './synthetic';

const EPS = 1e-6;

function clamp01(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** logit of a probability, with the input clamped away from 0/1. */
function logit(p: number): number {
  const c = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(c / (1 - c));
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

// ─── evaluate ───────────────────────────────────────────────────────────────

/**
 * Brier, rank-based AUC (Mann–Whitney U), ECE over `nBins` equal-width bins on
 * [0,1], and the reliability curve. AUC is 0.5 if one class is absent.
 */
export function evaluate(
  predicted: number[],
  labels: number[],
  nBins: number = 10
): EvalMetrics {
  const n = Math.min(predicted.length, labels.length);
  const bins = Number.isFinite(nBins) && nBins > 0 ? Math.floor(nBins) : 10;

  if (n === 0) {
    return { brier: 0, auc: 0.5, ece: 0, nBins: bins, reliability: [], n: 0 };
  }

  // Brier.
  let brier = 0;
  for (let i = 0; i < n; i++) {
    const p = clamp01(predicted[i]);
    const y = labels[i] >= 0.5 ? 1 : 0;
    const d = p - y;
    brier += d * d;
  }
  brier /= n;

  // AUC via rank-based Mann–Whitney U (handles ties with average ranks).
  const auc = computeAuc(predicted, labels, n);

  // ECE + reliability over equal-width bins.
  const { ece, reliability } = computeEceReliability(predicted, labels, n, bins);

  return { brier, auc, ece, nBins: bins, reliability, n };
}

function computeAuc(predicted: number[], labels: number[], n: number): number {
  let nPos = 0;
  let nNeg = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] >= 0.5) nPos++;
    else nNeg++;
  }
  if (nPos === 0 || nNeg === 0) return 0.5;

  // Rank all scores (average ranks for ties), 1-based.
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => clamp01(predicted[a]) - clamp01(predicted[b]));
  const rank = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    const vi = clamp01(predicted[idx[i]]);
    while (j + 1 < n && clamp01(predicted[idx[j + 1]]) === vi) j++;
    // ranks i..j share the average rank (1-based)
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rank[idx[k]] = avg;
    i = j + 1;
  }

  let sumRankPos = 0;
  for (let k = 0; k < n; k++) {
    if (labels[k] >= 0.5) sumRankPos += rank[k];
  }
  const u = sumRankPos - (nPos * (nPos + 1)) / 2;
  return u / (nPos * nNeg);
}

function computeEceReliability(
  predicted: number[],
  labels: number[],
  n: number,
  bins: number
): { ece: number; reliability: ReliabilityBin[] } {
  const sumPred = new Array<number>(bins).fill(0);
  const sumObs = new Array<number>(bins).fill(0);
  const count = new Array<number>(bins).fill(0);

  for (let i = 0; i < n; i++) {
    const p = clamp01(predicted[i]);
    const y = labels[i] >= 0.5 ? 1 : 0;
    // Equal-width bin; p === 1 lands in the last bin.
    let b = Math.floor(p * bins);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    sumPred[b] += p;
    sumObs[b] += y;
    count[b] += 1;
  }

  let ece = 0;
  const reliability: ReliabilityBin[] = [];
  for (let b = 0; b < bins; b++) {
    const c = count[b];
    const predictedMean = c > 0 ? sumPred[b] / c : 0;
    const observedRate = c > 0 ? sumObs[b] / c : 0;
    if (c > 0) {
      ece += Math.abs(predictedMean - observedRate) * (c / n);
    }
    reliability.push({ bin: b, predictedMean, observedRate, count: c });
  }
  return { ece, reliability };
}

// ─── fitCalibration ─────────────────────────────────────────────────────────

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

/** 1-D logistic regression: fit calibratedLogit = a*rawLogit + b via GD. */
function fitPlatt(predicted: number[], labels: number[]): PlattParams {
  const n = Math.min(predicted.length, labels.length);
  if (n === 0) return { a: 1, b: 0 };

  const x = new Array<number>(n);
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    x[i] = logit(predicted[i]);
    y[i] = labels[i] >= 0.5 ? 1 : 0;
  }

  let a = 1;
  let b = 0;
  const lr = 0.1;
  const maxIter = 2000;
  for (let iter = 0; iter < maxIter; iter++) {
    let ga = 0;
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a * x[i] + b);
      const err = p - y[i];
      ga += err * x[i];
      gb += err;
    }
    ga /= n;
    gb /= n;
    a -= lr * ga;
    b -= lr * gb;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      a = 1;
      b = 0;
      break;
    }
  }
  return { a, b };
}

/**
 * Pool-adjacent-violators algorithm. Returns step knots {x,y} on points sorted
 * by predicted value, where y is the pooled (non-decreasing) observed rate. Each
 * block's representative x is the largest predicted value in the block (the
 * step's right edge), so the mapping is non-decreasing in x.
 */
function fitIsotonic(predicted: number[], labels: number[]): IsotonicParams {
  const n = Math.min(predicted.length, labels.length);
  if (n === 0) return { x: [], y: [] };

  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((p, q) => clamp01(predicted[p]) - clamp01(predicted[q]));

  // Block stack: pooled sum, weight, mean, and right-edge x of each block.
  const blockSum: number[] = [];
  const blockW: number[] = [];
  const blockMean: number[] = [];
  const blockX: number[] = [];

  for (const i of idx) {
    blockSum.push(labels[i] >= 0.5 ? 1 : 0);
    blockW.push(1);
    blockMean.push(labels[i] >= 0.5 ? 1 : 0);
    blockX.push(clamp01(predicted[i]));

    // Merge while the previous block's mean exceeds this block's (violation).
    while (
      blockMean.length >= 2 &&
      blockMean[blockMean.length - 2] > blockMean[blockMean.length - 1]
    ) {
      const sum = blockSum.pop()! + blockSum.pop()!;
      const w = blockW.pop()! + blockW.pop()!;
      const xRight = blockX.pop()!; // current (larger sorted x) = right edge
      blockX.pop();
      blockMean.pop();
      blockMean.pop();
      blockSum.push(sum);
      blockW.push(w);
      blockMean.push(sum / w);
      blockX.push(xRight);
    }
  }

  return { x: blockX.slice(), y: blockMean.slice() };
}

/** Apply Platt mapping to a raw probability. */
function applyPlatt(p: number, params: PlattParams): number {
  return clamp01(sigmoid(params.a * logit(p) + params.b));
}

/** Apply isotonic step/interpolation to a raw probability. */
function applyIsotonic(p: number, params: IsotonicParams): number {
  const { x, y } = params;
  const m = x.length;
  if (m === 0) return clamp01(p);
  const v = clamp01(p);
  if (v <= x[0]) return clamp01(y[0]);
  if (v >= x[m - 1]) return clamp01(y[m - 1]);
  // Linear interpolation between bracketing knots (knots are x-ascending).
  for (let i = 1; i < m; i++) {
    if (v <= x[i]) {
      const x0 = x[i - 1];
      const x1 = x[i];
      const y0 = y[i - 1];
      const y1 = y[i];
      if (x1 === x0) return clamp01(y1);
      const frac = (v - x0) / (x1 - x0);
      return clamp01(y0 + frac * (y1 - y0));
    }
  }
  return clamp01(y[m - 1]);
}

export const applyCalibration: ApplyCalibration = (
  rawProbability: number,
  params: CalibrationParams
): number => {
  const p = clamp01(rawProbability);
  switch (params.method) {
    case 'platt':
      if (params.platt) return applyPlatt(p, params.platt);
      return p;
    case 'isotonic':
      if (params.isotonic) return applyIsotonic(p, params.isotonic);
      return p;
    case 'none':
    default:
      return p;
  }
};

export function fitCalibration(
  input: CalibrationFitInput
): CalibrationParams {
  const method: CalibrationMethod = input.method ?? 'platt';
  const predicted = input.predicted;
  const labels = input.labels;

  const metricsBefore = evaluate(predicted, labels);

  let platt: PlattParams | undefined;
  let isotonic: IsotonicParams | undefined;

  const params: CalibrationParams = {
    target: input.target,
    method,
    modelVersion: input.modelVersion || MODEL_VERSION,
    nLabels: input.nLabels ?? labels.length,
    trainedOn: input.trainedOn || 'synthetic',
  };

  if (method === 'platt') {
    platt = fitPlatt(predicted, labels);
    params.platt = platt;
  } else if (method === 'isotonic') {
    isotonic = fitIsotonic(predicted, labels);
    params.isotonic = isotonic;
  }

  // Apply the just-fitted params to the SAME input to report metricsAfter.
  const calibrated = predicted.map((p) => applyCalibration(p, params));
  const metricsAfter = evaluate(calibrated, labels);

  params.metricsBefore = metricsBefore;
  params.metricsAfter = metricsAfter;
  return params;
}

// ─── calibrateFromCorpus ─────────────────────────────────────────────────────

export interface CalibrateFromCorpusOptions {
  method?: CalibrationMethod;
  splitSeed?: number;
  horizonDays?: number;
  /** fraction of leads held out for the test split (default 0.3) */
  testFraction?: number;
}

/**
 * Fit calibration for a target ('sign'|'ghost') from a synthetic corpus's
 * lead-level labels. predicted = cumulativeIncidence(...)[target metric];
 * y = 1 if the lead's terminal equals the target, else 0. Leads (not periods)
 * are split into train/test via a seeded shuffle so there is no leakage. Fit on
 * train, report before/after metrics on the held-out test split.
 */
export function calibrateFromCorpus(
  model: FittedModel,
  corpus: SyntheticCorpus,
  target: 'sign' | 'ghost',
  opts?: CalibrateFromCorpusOptions
): { params: CalibrationParams; heldOut: { before: EvalMetrics; after: EvalMetrics } } {
  const method: CalibrationMethod = opts?.method ?? 'platt';
  const H = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const splitSeed = opts?.splitSeed ?? 1234;
  const testFraction = opts?.testFraction ?? 0.3;
  const metricKey: 'signProbability' | 'ghostRisk' =
    target === 'sign' ? 'signProbability' : 'ghostRisk';

  const labels = corpus.labels;
  const nLeads = labels.length;

  // Build (predicted, y) per lead.
  const predicted = new Array<number>(nLeads);
  const y = new Array<number>(nLeads);
  for (let i = 0; i < nLeads; i++) {
    const label = labels[i];
    const ci = cumulativeIncidence(model, label.features, H);
    predicted[i] = ci[metricKey];
    y[i] = label.terminal === target ? 1 : 0;
  }

  // Seeded Fisher–Yates shuffle of lead indices, then split.
  const order = Array.from({ length: nLeads }, (_, i) => i);
  const rng = mulberry32(splitSeed);
  for (let i = nLeads - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const nTest = Math.max(1, Math.floor(nLeads * testFraction));
  const testIdx = order.slice(0, nTest);
  const trainIdx = order.slice(nTest);

  const trainPred = trainIdx.map((i) => predicted[i]);
  const trainY = trainIdx.map((i) => y[i]);
  const testPred = testIdx.map((i) => predicted[i]);
  const testY = testIdx.map((i) => y[i]);

  // Fit ONLY on train.
  const params = fitCalibration({
    predicted: trainPred,
    labels: trainY,
    target,
    method,
    modelVersion: model.modelVersion,
    nLabels: trainY.length,
    trainedOn: model.trainedOn,
  });

  // Report held-out metrics: raw vs calibrated on the TEST split.
  const before = evaluate(testPred, testY);
  const calibratedTest = testPred.map((p) => applyCalibration(p, params));
  const after = evaluate(calibratedTest, testY);

  return { params, heldOut: { before, after } };
}
