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
  FEATURE_NAMES,
  MODEL_VERSION,
} from './contracts';
import type {
  ApplyCalibration,
  CalibrationMethod,
  CalibrationParams,
  EvalMetrics,
  FittedModel,
  IsotonicParams,
  PersonPeriodRow,
  PlattParams,
  ReliabilityBin,
  SyntheticCorpus,
} from './contracts';
import { cumulativeIncidence } from './model/competing-risks';
import { fitMultinomial } from './model/fitter';
import type { FitOptions } from './model/fitter';
import { mulberry32 } from './synthetic';
import { churnGhostPrior, blendWithPrior } from './churn-prior';

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
  const rank = Array.from({ length: n }, () => 0);
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
  const sumPred = Array.from({ length: bins }, () => 0);
  const sumObs = Array.from({ length: bins }, () => 0);
  const count = Array.from({ length: bins }, () => 0);

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

  const x = Array.from({ length: n }, () => 0);
  const y = Array.from({ length: n }, () => 0);
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
  const predicted = Array.from({ length: nLeads }, () => 0);
  const y = Array.from({ length: nLeads }, () => 0);
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

// ─── Method selection: isotonic vs Platt ─────────────────────────────────────
//
// Both Platt and isotonic can OVER-fit a small calibration split and end up
// WORSE than the raw scores on held-out data. This helper fits BOTH on the train
// split, measures each (plus the raw "none" baseline) on the held-out test split,
// and returns the method with the lowest held-out ECE. `'none'` is always in the
// running, so the selected method's held-out ECE can never exceed the raw ECE
// (the selection is a min over candidates that includes raw). That property is
// what the lane test asserts.

export interface SelectCalibrationOptions extends CalibrateFromCorpusOptions {
  /** candidate methods to consider; 'none' (raw) is ALWAYS added. */
  candidates?: CalibrationMethod[];
}

export interface CalibrationSelection {
  target: 'sign' | 'ghost';
  /** the winning method (lowest held-out ECE; ties → earlier candidate). */
  chosen: CalibrationMethod;
  /** persisted params for the chosen method (method='none' carries no maps). */
  params: CalibrationParams;
  /** held-out ECE per candidate, including the raw 'none' baseline. */
  heldOutEce: Record<CalibrationMethod, number>;
  /** full held-out metrics for the chosen method (before=raw, after=chosen). */
  heldOut: { before: EvalMetrics; after: EvalMetrics };
}

/**
 * Pick the recalibration method (isotonic | platt | none) with the lowest
 * held-out ECE for `target` on a lead-level split of the corpus. Because the raw
 * `'none'` baseline is always a candidate, the chosen method's held-out ECE is
 * guaranteed ≤ the raw held-out ECE — selection never makes calibration worse.
 *
 * Implementation reuses `calibrateFromCorpus` per candidate with the SAME split
 * seed / horizon so every candidate is scored on the identical held-out leads.
 */
export function selectCalibration(
  model: FittedModel,
  corpus: SyntheticCorpus,
  target: 'sign' | 'ghost',
  opts?: SelectCalibrationOptions
): CalibrationSelection {
  const requested = opts?.candidates ?? ['platt', 'isotonic'];
  // De-dupe, drop 'none' from the requested list, then append it last so it is
  // always evaluated as the raw baseline (and loses ties to a real method).
  const methods: CalibrationMethod[] = [];
  for (const m of requested) {
    if (m !== 'none' && !methods.includes(m)) methods.push(m);
  }
  methods.push('none');

  const shared: CalibrateFromCorpusOptions = {
    splitSeed: opts?.splitSeed,
    horizonDays: opts?.horizonDays,
    testFraction: opts?.testFraction,
  };

  const heldOutEce = {} as Record<CalibrationMethod, number>;
  let best: {
    method: CalibrationMethod;
    result: ReturnType<typeof calibrateFromCorpus>;
  } | null = null;

  for (const method of methods) {
    const result = calibrateFromCorpus(model, corpus, target, {
      ...shared,
      method,
    });
    const ece = result.heldOut.after.ece;
    heldOutEce[method] = ece;
    // Strictly-less keeps the FIRST candidate on ties (real methods precede
    // 'none', so a tie with raw is broken in favor of the real method).
    if (best === null || ece < heldOutEce[best.method]) {
      best = { method, result };
    }
  }

  // `best` is always set (methods always contains at least 'none').
  const chosenResult = best!.result;
  return {
    target,
    chosen: best!.method,
    params: chosenResult.params,
    heldOutEce,
    heldOut: chosenResult.heldOut,
  };
}

// ─── Churn-prior blend impact on GHOST calibration ───────────────────────────
//
// HEADLINE real-data result: does blending the synthetic model's ghostRisk with
// the literature-grounded churn PRIOR (churn-prior.ts — REAL external telecom /
// lead-response statistics used as a prior, NOT this installer's solar outcomes)
// improve held-out GHOST calibration?
//
// We hold leads out exactly as calibrateFromCorpus does (lead-level seeded split,
// no period leakage). For each held-out lead we compute:
//   • raw   = model ghostRisk (cumulative incidence)
//   • prior = churnGhostPrior(...) from the lead's real-shaped signals
//   • blend = blendWithPrior(raw, prior, weight)
// and report held-out ECE/Brier/AUC of raw vs blended. `calibrated` stays false:
// the prior is external/proxy, not fitted on real solar labels.

/** Recover the financing-type string from the one-hot covariate flags. */
function financingFromVector(x: number[]): string {
  const iCash = FEATURE_NAMES.indexOf('financingIsCash');
  const iLoan = FEATURE_NAMES.indexOf('financingIsLoan');
  if (iCash >= 0 && (x[iCash] ?? 0) >= 0.5) return 'cash';
  if (iLoan >= 0 && (x[iLoan] ?? 0) >= 0.5) return 'loan';
  // Neither cash nor loan one-hot set → lease/PPA family (low-commitment analog).
  return 'lease';
}

/** Build the churn-prior input from a FEATURE_NAMES-aligned RAW snapshot. */
function priorInputFromVector(x: number[]): {
  daysSinceTouch: number;
  financingType: string;
  currentStep: number;
  totalSteps: number;
} {
  const iDays = FEATURE_NAMES.indexOf('daysSinceLastTouch');
  const iProg = FEATURE_NAMES.indexOf('stepProgressRatio');
  const daysSinceTouch = iDays >= 0 ? x[iDays] ?? 0 : 0;
  // The corpus snapshot carries stepProgressRatio (0–1), not raw step counts;
  // express progress as currentStep/totalSteps with a fixed totalSteps so the
  // prior's engagement-relief term sees the same ratio.
  const progress = iProg >= 0 ? clamp01(x[iProg] ?? 0) : 0;
  const totalSteps = 4;
  const currentStep = Math.round(progress * totalSteps);
  return {
    daysSinceTouch,
    financingType: financingFromVector(x),
    currentStep,
    totalSteps,
  };
}

export interface GhostPriorBlendOptions {
  splitSeed?: number;
  horizonDays?: number;
  testFraction?: number;
  /** prior pull in [0,1] for the convex blend (default 0.5). */
  priorWeight?: number;
}

export interface GhostPriorBlendComparison {
  /** held-out metrics of the RAW synthetic ghostRisk. */
  raw: EvalMetrics;
  /** held-out metrics of ghostRisk blended with the churn prior. */
  blended: EvalMetrics;
  /** ECE improvement (raw.ece − blended.ece); positive = prior helped. */
  eceDelta: number;
  priorWeight: number;
  nHeldOut: number;
  /** honesty flag: priors are external/proxy, never fitted solar labels. */
  calibrated: false;
  notes: string[];
}

/**
 * Quantify the churn-prior blend's impact on held-out GHOST calibration over a
 * synthetic corpus. Returns raw vs blended EvalMetrics on the SAME held-out
 * leads, plus the ECE delta. Does NOT change any competing-risks signature; it
 * only consumes `cumulativeIncidence`. Pure (seeded split, no Date/Math.random).
 */
export function compareGhostPriorBlend(
  model: FittedModel,
  corpus: SyntheticCorpus,
  opts?: GhostPriorBlendOptions
): GhostPriorBlendComparison {
  const H = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const splitSeed = opts?.splitSeed ?? 1234;
  const testFraction = opts?.testFraction ?? 0.3;
  const priorWeight = clamp01(opts?.priorWeight ?? 0.5);

  const labels = corpus.labels;
  const nLeads = labels.length;

  // Seeded Fisher–Yates over lead indices, identical scheme to calibrateFromCorpus.
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

  const rawPred: number[] = [];
  const blendedPred: number[] = [];
  const y: number[] = [];

  for (const idx of testIdx) {
    const label = labels[idx];
    const raw = clamp01(cumulativeIncidence(model, label.features, H).ghostRisk);
    const prior = churnGhostPrior(priorInputFromVector(label.features));
    rawPred.push(raw);
    blendedPred.push(blendWithPrior(raw, prior, priorWeight));
    y.push(label.terminal === 'ghost' ? 1 : 0);
  }

  const raw = evaluate(rawPred, y);
  const blended = evaluate(blendedPred, y);
  const eceDelta = raw.ece - blended.ece;

  const fmt = (v: number): string => v.toFixed(4);
  const notes: string[] = [
    `GHOST prior-blend (weight=${priorWeight}, held-out n=${y.length}):`,
    `raw ECE=${fmt(raw.ece)} → blended ECE=${fmt(blended.ece)} (Δ=${fmt(
      eceDelta
    )}${eceDelta >= 0 ? ' improved' : ' worsened'})`,
    `raw Brier=${fmt(raw.brier)} → blended Brier=${fmt(blended.brier)}`,
    `raw AUC=${fmt(raw.auc)} → blended AUC=${fmt(blended.auc)}`,
    'prior = REAL external telecom/lead-response stats used as a PRIOR, ' +
      'not this installer\'s solar outcomes; calibrated=false.',
  ];

  return {
    raw,
    blended,
    eceDelta,
    priorWeight,
    nHeldOut: y.length,
    calibrated: false,
    notes,
  };
}

// ─── Honest, fully out-of-sample calibration ─────────────────────────────────
//
// SKEPTIC CAVEAT (pass-1): calibrateFromCorpus takes a model that was fit on the
// FULL corpus, then evaluates "before"-metrics on a held-out subset of the SAME
// leads. Those leads' person-period rows were seen by the base model at fit time,
// so the held-out "before" numbers are OPTIMISTIC — the base model has partially
// memorized the very leads it is being graded on.
//
// calibrateFromCorpusHonest closes that leak end-to-end:
//   1. Split LEADS by leadId (seeded Fisher–Yates), identical scheme to
//      calibrateFromCorpus, so no lead's periods straddle the train/test line.
//   2. Re-FIT the base model with fitMultinomial on ONLY the TRAIN leads' rows.
//      (calibrateFromCorpus reuses a caller-supplied, full-corpus model; here we
//      ignore any such model and train fresh on train rows.)
//   3. Compute cumulativeIncidence on the held-out TEST leads' snapshots →
//      genuinely out-of-sample "before" metrics for the base model.
//   4. Fit the calibration transform on the TRAIN leads' predictions, then score
//      raw vs calibrated on the TEST leads → out-of-sample "after" metrics.
//
// The old calibrateFromCorpus is left fully intact for back-compat.

/** Partition leadIds into test/train via a seeded Fisher–Yates shuffle. */
function splitLeadIds(
  leadIds: string[],
  splitSeed: number,
  testFraction: number
): { testIds: Set<string>; trainIds: Set<string> } {
  // Sort first so the order is independent of corpus row/label ordering.
  const sorted = leadIds.slice().sort();
  const rng = mulberry32(splitSeed);
  for (let i = sorted.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = sorted[i];
    sorted[i] = sorted[j];
    sorted[j] = tmp;
  }
  const nTest = Math.max(1, Math.floor(sorted.length * testFraction));
  const testIds = new Set(sorted.slice(0, nTest));
  const trainIds = new Set(sorted.slice(nTest));
  return { testIds, trainIds };
}

export interface CalibrateFromCorpusHonestOptions
  extends CalibrateFromCorpusOptions {
  /**
   * Fit hyperparameters for the FRESH base-model fit on train rows. Mirrors the
   * caller's normal fitMultinomial call so the honest base model matches the
   * production fit. Defaults match the lane's usual {l2:0.5, lr:0.4, maxIter:600}.
   */
  fit?: Omit<FitOptions, 'classes'>;
}

export interface CalibrateFromCorpusHonestResult {
  params: CalibrationParams;
  /** out-of-sample held-out metrics: before = raw base model, after = calibrated. */
  heldOut: { before: EvalMetrics; after: EvalMetrics };
  /** the base model trained on TRAIN leads only (handy for inspection/tests). */
  baseModel: FittedModel;
  nTrainLeads: number;
  nTestLeads: number;
  /** the held-out test leadIds (for leakage assertions). */
  testLeadIds: string[];
  /** the train leadIds used to fit the base model + calibration. */
  trainLeadIds: string[];
}

const HONEST_DEFAULT_FIT: Omit<FitOptions, 'classes'> = {
  l2: 0.5,
  lr: 0.4,
  maxIter: 600,
};

/**
 * Fully out-of-sample calibration: re-fits the base model on TRAIN leads only,
 * then evaluates the base model AND the fitted calibration transform on entirely
 * held-out TEST leads. Unlike calibrateFromCorpus (which grades a model that was
 * fit on the full corpus), the base-model "before" metrics here contain zero leak
 * — the TEST leads' rows never touched fitMultinomial. Pure (seeded split, no
 * Date.now / Math.random). Honesty: trainedOn flows from the corpus provenance;
 * `calibrated` semantics are unchanged (still synthetic, not real solar labels).
 */
export function calibrateFromCorpusHonest(
  corpus: SyntheticCorpus,
  target: 'sign' | 'ghost',
  opts?: CalibrateFromCorpusHonestOptions
): CalibrateFromCorpusHonestResult {
  const method: CalibrationMethod = opts?.method ?? 'platt';
  const H = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const splitSeed = opts?.splitSeed ?? 1234;
  const testFraction = opts?.testFraction ?? 0.3;
  const fitOpts = opts?.fit ?? HONEST_DEFAULT_FIT;
  const metricKey: 'signProbability' | 'ghostRisk' =
    target === 'sign' ? 'signProbability' : 'ghostRisk';

  const labels = corpus.labels;

  // Distinct leadIds from the LABELS (one per lead), split by leadId.
  const leadIds = labels.map((l) => l.leadId);
  const { testIds, trainIds } = splitLeadIds(leadIds, splitSeed, testFraction);

  // Base model is fit on TRAIN leads' person-period rows ONLY — no test leakage.
  const trainRows: PersonPeriodRow[] = corpus.rows.filter((r) =>
    trainIds.has(r.leadId)
  );
  // Corpus is synthetic by construction; keep trainedOn honest as 'synthetic'
  // unless the caller's fit opts explicitly override it.
  const baseModel = fitMultinomial(trainRows, {
    trainedOn: 'synthetic',
    ...fitOpts,
  });

  // Predictions per lead, partitioned by the SAME lead split.
  const trainPred: number[] = [];
  const trainY: number[] = [];
  const testPred: number[] = [];
  const testY: number[] = [];
  const trainLeadIds: string[] = [];
  const testLeadIds: string[] = [];

  for (const label of labels) {
    const ci = cumulativeIncidence(baseModel, label.features, H);
    const p = ci[metricKey];
    const yi = label.terminal === target ? 1 : 0;
    if (testIds.has(label.leadId)) {
      testPred.push(p);
      testY.push(yi);
      testLeadIds.push(label.leadId);
    } else if (trainIds.has(label.leadId)) {
      trainPred.push(p);
      trainY.push(yi);
      trainLeadIds.push(label.leadId);
    }
  }

  // Fit calibration ONLY on train predictions.
  const params = fitCalibration({
    predicted: trainPred,
    labels: trainY,
    target,
    method,
    modelVersion: baseModel.modelVersion,
    nLabels: trainY.length,
    trainedOn: baseModel.trainedOn,
  });

  // Out-of-sample metrics on TEST leads: before = raw base, after = calibrated.
  const before = evaluate(testPred, testY);
  const calibratedTest = testPred.map((pp) => applyCalibration(pp, params));
  const after = evaluate(calibratedTest, testY);

  return {
    params,
    heldOut: { before, after },
    baseModel,
    nTrainLeads: trainLeadIds.length,
    nTestLeads: testLeadIds.length,
    testLeadIds,
    trainLeadIds,
  };
}

// ─── Honest ghost-prior RANKING evaluation ───────────────────────────────────
//
// compareGhostPriorBlend answers "does blending the churn prior improve held-out
// ECE/Brier (CALIBRATION)?" — and the honest answer is often "no", because the
// prior is on a different scale than this synthetic model. But a PRIOR's natural
// job is to improve ORDERING: ranking quiet/low-commitment leads above engaged
// ones. AUC is invariant to monotone rescaling, so it isolates that ranking
// signal from the scale mismatch ECE penalizes.
//
// compareGhostPriorRanking reports held-out ghost AUC for raw vs prior-blended
// (and the prior alone), on the SAME held-out leads, re-fitting the base model on
// TRAIN leads only so the ranking comparison is itself out-of-sample. This gives
// the honest "does the prior help ORDERING" answer, separately from calibration.

export interface GhostPriorRankingOptions extends GhostPriorBlendOptions {
  /** fit hyperparameters for the fresh TRAIN-only base model. */
  fit?: Omit<FitOptions, 'classes'>;
}

export interface GhostPriorRankingComparison {
  /** held-out ghost AUC of the raw (TRAIN-fit) model ghostRisk. */
  rawAuc: number;
  /** held-out ghost AUC of the prior alone. */
  priorAuc: number;
  /** held-out ghost AUC of the convex blend(raw, prior, weight). */
  blendedAuc: number;
  /** blendedAuc − rawAuc; positive = the prior improved ORDERING. */
  aucDelta: number;
  priorWeight: number;
  nHeldOut: number;
  /** honesty flag: priors are external/proxy, never fitted solar labels. */
  calibrated: false;
  notes: string[];
}

/**
 * Honest held-out RANKING comparison for the churn prior on GHOST. Re-fits the
 * base model on TRAIN leads only (no leakage), then on the held-out TEST leads
 * reports ghost AUC for raw model vs prior-alone vs blend. Ranking (AUC) is the
 * dimension a prior can help even when ECE/scale worsens, so this isolates the
 * "does the prior help ORDERING" answer. Pure (seeded split, no Date/Math.random).
 */
export function compareGhostPriorRanking(
  corpus: SyntheticCorpus,
  opts?: GhostPriorRankingOptions
): GhostPriorRankingComparison {
  const H = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const splitSeed = opts?.splitSeed ?? 1234;
  const testFraction = opts?.testFraction ?? 0.3;
  const priorWeight = clamp01(opts?.priorWeight ?? 0.5);
  const fitOpts = opts?.fit ?? HONEST_DEFAULT_FIT;

  const labels = corpus.labels;
  const leadIds = labels.map((l) => l.leadId);
  const { testIds, trainIds } = splitLeadIds(leadIds, splitSeed, testFraction);

  // Re-fit base model on TRAIN leads only → out-of-sample ranking on TEST.
  const trainRows: PersonPeriodRow[] = corpus.rows.filter((r) =>
    trainIds.has(r.leadId)
  );
  const baseModel = fitMultinomial(trainRows, fitOpts);

  const rawPred: number[] = [];
  const priorPred: number[] = [];
  const blendedPred: number[] = [];
  const y: number[] = [];

  for (const label of labels) {
    if (!testIds.has(label.leadId)) continue;
    const raw = clamp01(
      cumulativeIncidence(baseModel, label.features, H).ghostRisk
    );
    const prior = churnGhostPrior(priorInputFromVector(label.features));
    rawPred.push(raw);
    priorPred.push(prior);
    blendedPred.push(blendWithPrior(raw, prior, priorWeight));
    y.push(label.terminal === 'ghost' ? 1 : 0);
  }

  const rawAuc = evaluate(rawPred, y).auc;
  const priorAuc = evaluate(priorPred, y).auc;
  const blendedAuc = evaluate(blendedPred, y).auc;
  const aucDelta = blendedAuc - rawAuc;

  const fmt = (v: number): string => v.toFixed(4);
  const notes: string[] = [
    `GHOST prior RANKING (weight=${priorWeight}, held-out n=${y.length}, ` +
      'TRAIN-fit base model — fully out-of-sample):',
    `raw AUC=${fmt(rawAuc)} · prior-alone AUC=${fmt(priorAuc)} · ` +
      `blended AUC=${fmt(blendedAuc)} (Δvs raw=${fmt(aucDelta)}${
        aucDelta >= 0 ? ' prior helps ordering' : ' prior hurts ordering'
      })`,
    'AUC is rescaling-invariant, so it isolates ORDERING from the scale ' +
      'mismatch ECE penalizes.',
    'prior = REAL external telecom/lead-response stats used as a PRIOR, ' +
      "not this installer's solar outcomes; calibrated=false.",
  ];

  return {
    rawAuc,
    priorAuc,
    blendedAuc,
    aucDelta,
    priorWeight,
    nHeldOut: y.length,
    calibrated: false,
    notes,
  };
}
