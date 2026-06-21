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
  const names = new Array<string>(width);
  for (let i = 0; i < width; i++) names[i] = `f${i}`;
  return names;
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
  const mean = new Array<number>(width).fill(0);
  const sd = new Array<number>(width).fill(1);
  if (n === 0) return { mean, sd };

  for (let r = 0; r < n; r++) {
    const x = rows[r].x;
    for (let j = 0; j < width; j++) {
      const v = j < x.length ? x[j] : 0;
      mean[j] += isFiniteNum(v) ? v : 0;
    }
  }
  for (let j = 0; j < width; j++) mean[j] /= n;

  const varAcc = new Array<number>(width).fill(0);
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
  const z = new Array<number>(width);
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
  const logits = new Array<number>(nClasses);
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
  const Z: number[][] = new Array(n);
  const y: number[] = new Array(n);
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
  const coefficients: number[][] = new Array(nParamRows);
  for (let c = 0; c < nParamRows; c++) {
    coefficients[c] = new Array<number>(width + 1).fill(0);
  }

  if (usable > 0 && nParamRows > 0) {
    let prevLoss = Infinity;
    for (let iter = 0; iter < maxIter; iter++) {
      // Gradient accumulators, same shape as coefficients.
      const grad: number[][] = new Array(nParamRows);
      for (let c = 0; c < nParamRows; c++) {
        grad[c] = new Array<number>(width + 1).fill(0);
      }
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
