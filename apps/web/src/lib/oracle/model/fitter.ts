/**
 * A2 — Discrete-time multinomial logistic regression fitter.
 *
 * Fits a softmax (multinomial logit) over person-period rows with the reference
 * class fixed at logit 0. Gradient descent with L2 (intercepts unpenalized),
 * standardized covariates. Numerically stable (stable softmax, clamped values),
 * never produces NaN/Infinity. Pure: no Date.now / Math.random.
 */
import type {
  FittedModel,
  PeriodOutcome,
  PeriodProbabilities,
  PersonPeriodRow,
  PredictProbabilities,
  Standardization,
} from '../contracts';
import { FEATURE_COUNT, FEATURE_NAMES, MODEL_VERSION } from '../contracts';
import { mulberry32 } from '../synthetic';
import { softmax } from './linalg';

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
  /**
   * Optional explicit feature names. If absent and the row width equals
   * FEATURE_COUNT, contracts.FEATURE_NAMES is used; otherwise ["f0","f1",...].
   */
  featureNames?: string[];
}

const DEFAULT_CLASSES: PeriodOutcome[] = ['stay', 'sign', 'ghost'];
const DEFAULT_L2 = 1.0;
const DEFAULT_LR = 0.1;
const DEFAULT_MAX_ITER = 500;
const DEFAULT_TOL = 1e-6;

/** Largest finite magnitude we let any coefficient / value reach. */
const CLAMP = 1e6;
/** Clamp standardized logits to keep exp() finite and gradients sane. */
const LOGIT_CLAMP = 60;

function isFiniteNum(v: number): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v: number, lo: number, hi: number): number {
  if (!isFiniteNum(v)) return 0;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Resolve feature names for a given width per the contract rules. */
function resolveFeatureNames(width: number, explicit?: string[]): string[] {
  if (explicit && explicit.length === width) return explicit.slice();
  if (width === FEATURE_COUNT) return FEATURE_NAMES.slice();
  return Array.from({ length: width }, (_, i) => `f${i}`);
}

/**
 * Population mean/sd per feature from raw rows. sd guarded: any sd <= 1e-9 -> 1
 * so standardization never divides by ~0. Non-finite inputs are treated as 0.
 */
export function computeStandardization(
  rows: PersonPeriodRow[],
  width: number
): Standardization {
  const n = rows.length;
  const mean = Array.from({ length: width }, () => 0);
  const sd = Array.from({ length: width }, () => 1);
  if (n === 0) return { mean, sd };

  for (let r = 0; r < n; r++) {
    const x = rows[r].x;
    for (let j = 0; j < width; j++) {
      const v = j < x.length ? x[j] : 0;
      mean[j] += isFiniteNum(v) ? v : 0;
    }
  }
  for (let j = 0; j < width; j++) mean[j] /= n;

  const varAcc = Array.from({ length: width }, () => 0);
  for (let r = 0; r < n; r++) {
    const x = rows[r].x;
    for (let j = 0; j < width; j++) {
      const raw = j < x.length ? x[j] : 0;
      const v = isFiniteNum(raw) ? raw : 0;
      const d = v - mean[j];
      varAcc[j] += d * d;
    }
  }
  for (let j = 0; j < width; j++) {
    const variance = varAcc[j] / n; // population variance
    const s = Math.sqrt(variance);
    sd[j] = s <= 1e-9 || !isFiniteNum(s) ? 1 : s;
    if (!isFiniteNum(mean[j])) mean[j] = 0;
  }
  return { mean, sd };
}

/** Standardize a raw vector with the given standardization. */
function standardizeVec(
  xRaw: number[],
  std: Standardization,
  width: number
): number[] {
  const z = Array.from({ length: width }, () => 0);
  for (let j = 0; j < width; j++) {
    const raw = j < xRaw.length ? xRaw[j] : 0;
    const v = isFiniteNum(raw) ? raw : 0;
    const sd = std.sd[j] || 1;
    z[j] = (v - std.mean[j]) / sd;
  }
  return z;
}

/**
 * Compute class probabilities given a standardized feature vector and the
 * coefficient matrix (one row per non-reference class, [intercept, ...betas]).
 * Reference class logit is fixed at 0. Returns a vector aligned to `classes`.
 */
function classProbsFromZ(
  z: number[],
  coefficients: number[][],
  nClasses: number,
  width: number
): number[] {
  const logits = Array.from({ length: nClasses }, () => 0);
  logits[0] = 0; // reference
  for (let c = 1; c < nClasses; c++) {
    const row = coefficients[c - 1];
    let s = row[0]; // intercept
    for (let j = 0; j < width; j++) {
      s += row[j + 1] * z[j];
    }
    logits[c] = clamp(s, -LOGIT_CLAMP, LOGIT_CLAMP);
  }
  return softmax(logits);
}

/**
 * Fit a multinomial logistic regression over person-period rows.
 */
export function fitMultinomial(
  rows: PersonPeriodRow[],
  opts?: FitOptions
): FittedModel {
  const classes = opts?.classes ?? DEFAULT_CLASSES;
  const nClasses = classes.length;
  const l2 = opts?.l2 ?? DEFAULT_L2;
  const lr = opts?.lr ?? DEFAULT_LR;
  const maxIter = opts?.maxIter ?? DEFAULT_MAX_ITER;
  const tol = opts?.tol ?? DEFAULT_TOL;
  const modelVersion = opts?.modelVersion ?? MODEL_VERSION;
  const trainedOn = opts?.trainedOn ?? 'synthetic';

  // Width derived from data, NOT a hardcoded FEATURE_COUNT.
  const width = rows.length > 0 ? rows[0].x.length : FEATURE_COUNT;
  const featureNames = resolveFeatureNames(width, opts?.featureNames);

  const standardization = computeStandardization(rows, width);

  // Map outcome -> class index; rows with unknown outcomes are skipped.
  const classIndex = new Map<string, number>();
  for (let c = 0; c < nClasses; c++) classIndex.set(classes[c], c);

  // Precompute standardized design matrix and label indices.
  const n = rows.length;
  const Z: number[][] = Array.from({ length: n }, () => []);
  const y: number[] = Array.from({ length: n }, () => 0);
  let usable = 0;
  const distinctLeads = new Set<string>();
  for (let r = 0; r < n; r++) {
    const row = rows[r];
    const ci = classIndex.get(row.outcome);
    Z[r] = standardizeVec(row.x, standardization, width);
    y[r] = ci === undefined ? -1 : ci;
    if (ci !== undefined) usable++;
    if (row.leadId !== undefined && row.leadId !== null) {
      distinctLeads.add(row.leadId);
    }
  }

  // Coefficient matrix: (nClasses-1) rows, each width+1 (intercept first).
  const nParamRows = Math.max(0, nClasses - 1);
  const coefficients: number[][] = Array.from({ length: nParamRows }, () =>
    Array.from({ length: width + 1 }, () => 0)
  );

  if (usable > 0 && nParamRows > 0) {
    let prevLoss = Infinity;
    for (let iter = 0; iter < maxIter; iter++) {
      // Gradient accumulators, same shape as coefficients.
      const grad: number[][] = Array.from({ length: nParamRows }, () =>
        Array.from({ length: width + 1 }, () => 0)
      );
      let loss = 0;

      for (let r = 0; r < n; r++) {
        const yr = y[r];
        if (yr < 0) continue;
        const z = Z[r];
        const probs = classProbsFromZ(z, coefficients, nClasses, width);

        // Negative log-likelihood of the true class (guarded).
        const pTrue = probs[yr];
        loss += -Math.log(pTrue > 1e-15 ? pTrue : 1e-15);

        // Gradient of NLL wrt logit_c is (p_c - 1[y==c]); reference fixed.
        for (let c = 1; c < nClasses; c++) {
          const err = probs[c] - (yr === c ? 1 : 0);
          const g = grad[c - 1];
          g[0] += err; // intercept gradient
          for (let j = 0; j < width; j++) {
            g[j + 1] += err * z[j];
          }
        }
      }

      // Average over usable rows, then add L2 (betas only, not intercept).
      const invN = 1 / usable;
      for (let c = 0; c < nParamRows; c++) {
        const g = grad[c];
        const row = coefficients[c];
        g[0] *= invN;
        for (let j = 1; j <= width; j++) {
          g[j] = g[j] * invN + l2 * invN * row[j];
        }
      }
      // L2 term added to loss (betas only) for monotone-decrease checks.
      if (l2 > 0) {
        let reg = 0;
        for (let c = 0; c < nParamRows; c++) {
          const row = coefficients[c];
          for (let j = 1; j <= width; j++) reg += row[j] * row[j];
        }
        loss += 0.5 * l2 * reg;
      }
      loss *= invN;

      // Gradient step + clamp.
      for (let c = 0; c < nParamRows; c++) {
        const row = coefficients[c];
        const g = grad[c];
        for (let j = 0; j <= width; j++) {
          let v = row[j] - lr * g[j];
          v = clamp(v, -CLAMP, CLAMP);
          row[j] = v;
        }
      }

      // Convergence on log-loss delta.
      if (isFiniteNum(loss)) {
        if (Math.abs(prevLoss - loss) < tol) {
          prevLoss = loss;
          break;
        }
        prevLoss = loss;
      }
    }
  }

  // Final guard: scrub any non-finite coefficient.
  for (let c = 0; c < nParamRows; c++) {
    const row = coefficients[c];
    for (let j = 0; j < row.length; j++) {
      if (!isFiniteNum(row[j])) row[j] = 0;
    }
  }

  return {
    kind: 'multinomial',
    featureNames,
    classes: classes.slice(),
    coefficients,
    standardization,
    l2,
    modelVersion,
    trainedOn,
    nRows: n,
    nLeads: distinctLeads.size,
  };
}

/**
 * Per-period class probabilities for a raw feature vector.
 * Standardizes with the model's standardization, computes per-class logits with
 * the reference fixed at 0, then a stable softmax. Result keys sum to 1.
 */
export const predictProbabilities: PredictProbabilities = (
  model: FittedModel,
  xRaw: number[]
): PeriodProbabilities => {
  const classes = model.classes;
  const nClasses = classes.length;
  const width = model.standardization.mean.length;

  const z = standardizeVec(xRaw, model.standardization, width);
  const probsArr = classProbsFromZ(z, model.coefficients, nClasses, width);

  const out = {} as PeriodProbabilities;
  // Initialize every PeriodOutcome key to 0 so the record is complete.
  out.stay = 0;
  out.sign = 0;
  out.ghost = 0;
  let sum = 0;
  for (let c = 0; c < nClasses; c++) {
    const p = isFiniteNum(probsArr[c]) ? probsArr[c] : 0;
    out[classes[c]] = p;
    sum += p;
  }
  // Renormalize defensively so keys sum to exactly 1.
  if (sum > 0 && isFiniteNum(sum)) {
    for (let c = 0; c < nClasses; c++) {
      out[classes[c]] = out[classes[c]] / sum;
    }
  } else {
    const u = 1 / nClasses;
    for (let c = 0; c < nClasses; c++) out[classes[c]] = u;
  }
  return out;
};

// ─── Lead-aware k-fold cross-validation (additive) ──────────────────────────

export interface CrossValidateL2Options {
  /** L2 grid to search; the best (lowest mean held-out log-loss) is returned. */
  l2Grid: number[];
  /** number of folds (clamped to [2, #leads]); default 5. */
  folds?: number;
  /** deterministic seed for the lead→fold assignment (mulberry32). default 0. */
  seed?: number;
  /**
   * Fit hyperparameters held FIXED across the sweep (only l2 varies). These flow
   * straight into fitMultinomial; behavior of fitMultinomial is unchanged.
   */
  fit?: Omit<FitOptions, 'l2'>;
}

export interface CrossValidateL2FoldDetail {
  l2: number;
  /** per-fold mean held-out log-loss (NaN-free; folds with no usable held-out rows are omitted). */
  foldLogLoss: number[];
  /** mean over folds that produced a usable held-out score. */
  meanLogLoss: number;
}

export interface CrossValidateL2Result {
  /** the l2 from the grid with the lowest mean held-out log-loss. */
  bestL2: number;
  bestMeanLogLoss: number;
  /** full per-l2 breakdown, grid order preserved. */
  perL2: CrossValidateL2FoldDetail[];
  folds: number;
  /** number of distinct leads partitioned across folds. */
  nLeads: number;
  /** lead→fold map actually used (stable for a given rows+folds+seed). */
  assignment: Record<string, number>;
}

/**
 * Mean per-row negative log-loss of `model` on `rows` (skips rows whose outcome
 * is not one of the model's classes). Returns NaN when no row is scorable.
 */
function meanLogLoss(model: FittedModel, rows: PersonPeriodRow[]): number {
  const known = new Set<string>(model.classes);
  let acc = 0;
  let scored = 0;
  for (const row of rows) {
    if (!known.has(row.outcome)) continue;
    const probs = predictProbabilities(model, row.x);
    const p = probs[row.outcome];
    const safe = isFiniteNum(p) && p > 1e-15 ? p : 1e-15;
    acc += -Math.log(safe);
    scored++;
  }
  return scored > 0 ? acc / scored : NaN;
}

/**
 * Deterministically partition the DISTINCT leadIds into `folds` groups using a
 * seeded Fisher–Yates shuffle (mulberry32). Returns a leadId→foldIndex map.
 * Stable for a given (sorted lead set, folds, seed). NO leadId ever appears in
 * more than one fold, so person-periods of the same lead never leak across the
 * train/held-out boundary.
 */
function assignLeadsToFolds(
  rows: PersonPeriodRow[],
  folds: number,
  seed: number
): Record<string, number> {
  // Sorted distinct leads → order is independent of row insertion order.
  const leadSet = new Set<string>();
  for (const r of rows) leadSet.add(r.leadId);
  const leads = Array.from(leadSet).sort();

  // Seeded Fisher–Yates shuffle (pure: RNG injected via mulberry32 seed).
  const rng = mulberry32(seed);
  for (let i = leads.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = leads[i];
    leads[i] = leads[j];
    leads[j] = tmp;
  }

  // Round-robin into folds so sizes are as balanced as possible.
  const assignment: Record<string, number> = {};
  for (let i = 0; i < leads.length; i++) {
    assignment[leads[i]] = i % folds;
  }
  return assignment;
}

/**
 * Lead-aware k-fold cross-validation over an L2 grid. For each candidate l2 we
 * fit on the union of the other folds and score mean held-out log-loss on the
 * left-out fold, then average over folds; the l2 with the LOWEST mean held-out
 * log-loss wins. Folds are split BY leadId so all person-period rows of a lead
 * stay together — there is no within-lead period leakage between train and test.
 *
 * Pure & deterministic: the lead→fold assignment is a seeded shuffle (mulberry32)
 * and fitMultinomial itself is deterministic. Empty grid / <2 leads degrade
 * gracefully (returns the only/first l2 with NaN-free bookkeeping).
 */
export function crossValidateL2(
  rows: PersonPeriodRow[],
  opts: CrossValidateL2Options
): CrossValidateL2Result {
  const grid =
    opts.l2Grid && opts.l2Grid.length > 0 ? opts.l2Grid.slice() : [DEFAULT_L2];
  const seed = opts.seed ?? 0;
  const fitOpts = opts.fit ?? {};

  // Count distinct leads to clamp the fold count sensibly.
  const leadSet = new Set<string>();
  for (const r of rows) leadSet.add(r.leadId);
  const nLeads = leadSet.size;

  const requested = opts.folds ?? 5;
  // Need at least 2 folds, and never more folds than leads (else a fold is empty
  // and its complement would silently train on everything).
  const folds = Math.max(2, Math.min(requested, Math.max(2, nLeads)));

  const assignment = assignLeadsToFolds(rows, folds, seed);

  // Pre-bucket rows by their lead's fold so we build train/test sets once.
  const rowsByFold: PersonPeriodRow[][] = Array.from(
    { length: folds },
    () => []
  );
  for (const r of rows) {
    const f = assignment[r.leadId];
    if (f !== undefined) rowsByFold[f].push(r);
  }

  const perL2: CrossValidateL2FoldDetail[] = [];
  let bestL2 = grid[0];
  let bestMeanLogLoss = Infinity;

  for (const l2 of grid) {
    const foldLogLoss: number[] = [];
    for (let f = 0; f < folds; f++) {
      const test = rowsByFold[f];
      if (test.length === 0) continue; // nothing to score in this fold
      // Train = all rows whose lead is NOT in fold f.
      const train: PersonPeriodRow[] = [];
      for (let g = 0; g < folds; g++) {
        if (g === f) continue;
        const bucket = rowsByFold[g];
        for (let k = 0; k < bucket.length; k++) train.push(bucket[k]);
      }
      if (train.length === 0) continue; // degenerate; skip this fold
      const model = fitMultinomial(train, { ...fitOpts, l2 });
      const ll = meanLogLoss(model, test);
      if (isFiniteNum(ll)) foldLogLoss.push(ll);
    }

    const meanLL =
      foldLogLoss.length > 0
        ? foldLogLoss.reduce((s, v) => s + v, 0) / foldLogLoss.length
        : NaN;
    perL2.push({ l2, foldLogLoss, meanLogLoss: meanLL });

    if (isFiniteNum(meanLL) && meanLL < bestMeanLogLoss) {
      bestMeanLogLoss = meanLL;
      bestL2 = l2;
    }
  }

  // If NO l2 produced a finite score (e.g. <2 leads), fall back to the first.
  if (!isFiniteNum(bestMeanLogLoss)) {
    bestL2 = grid[0];
    bestMeanLogLoss = NaN;
  }

  return {
    bestL2,
    bestMeanLogLoss,
    perL2,
    folds,
    nLeads,
    assignment,
  };
}
