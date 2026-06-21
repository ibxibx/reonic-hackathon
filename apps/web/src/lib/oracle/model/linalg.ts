/**
 * A2 — Linear algebra helpers for the logistic/multinomial fitter.
 * Vector/matrix primitives (dot, matvec, transpose) plus numerically-stable
 * logSumExp / softmax used by fitter.ts.
 *
 * Pure, dependency-free, numerically guarded. No Date.now / Math.random.
 */

/** Dot product of two equal-length vectors. */
export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += a[i] * b[i];
  }
  return s;
}

/** Element-wise sum a + b. */
export function addVec(a: number[], b: number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = a[i] + b[i];
  }
  return out;
}

/** Element-wise difference a - b. */
export function subVec(a: number[], b: number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = a[i] - b[i];
  }
  return out;
}

/** Scalar multiple s * v. */
export function scaleVec(v: number[], s: number): number[] {
  const n = v.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = v[i] * s;
  }
  return out;
}

/** Zero vector of length n. */
export function zeros(n: number): number[] {
  const out = new Array<number>(Math.max(0, n));
  for (let i = 0; i < out.length; i++) {
    out[i] = 0;
  }
  return out;
}

/**
 * Matrix-vector product. `m` is row-major (m.length rows, each m[i].length cols);
 * returns a vector of length m.length where out[i] = dot(m[i], v).
 */
export function matVecMul(m: number[][], v: number[]): number[] {
  const rows = m.length;
  const out = new Array<number>(rows);
  for (let i = 0; i < rows; i++) {
    out[i] = dot(m[i], v);
  }
  return out;
}

/** Transpose of a (possibly ragged-guarded) row-major matrix. */
export function transpose(m: number[][]): number[][] {
  const rows = m.length;
  if (rows === 0) return [];
  let cols = 0;
  for (let i = 0; i < rows; i++) {
    if (m[i].length > cols) cols = m[i].length;
  }
  const out: number[][] = new Array(cols);
  for (let j = 0; j < cols; j++) {
    const col = new Array<number>(rows);
    for (let i = 0; i < rows; i++) {
      col[i] = j < m[i].length ? m[i][j] : 0;
    }
    out[j] = col;
  }
  return out;
}

/**
 * Numerically-stable log-sum-exp: log(sum_i exp(logits[i])).
 * Subtracts the max before exponentiating to avoid overflow. Returns -Infinity
 * for an empty input; otherwise always finite when inputs are finite.
 */
export function logSumExp(logits: number[]): number {
  const n = logits.length;
  if (n === 0) return -Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = logits[i];
    if (v > max) max = v;
  }
  // All -Infinity (or empty handled above): sum is 0 -> log 0 = -Infinity.
  if (max === -Infinity) return -Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.exp(logits[i] - max);
  }
  return max + Math.log(sum);
}

/**
 * Numerically-stable softmax. Subtracts the max logit before exponentiating;
 * normalizes to sum 1. Guards against a zero/non-finite denominator by falling
 * back to a uniform distribution.
 */
export function softmax(logits: number[]): number[] {
  const n = logits.length;
  if (n === 0) return [];
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = logits[i];
    if (v > max) max = v;
  }
  const out = new Array<number>(n);
  if (!Number.isFinite(max)) {
    // All -Infinity or NaN: degrade gracefully to uniform.
    const u = 1 / n;
    for (let i = 0; i < n; i++) out[i] = u;
    return out;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(logits[i] - max);
    out[i] = e;
    sum += e;
  }
  if (!(sum > 0) || !Number.isFinite(sum)) {
    const u = 1 / n;
    for (let i = 0; i < n; i++) out[i] = u;
    return out;
  }
  for (let i = 0; i < n; i++) {
    out[i] = out[i] / sum;
  }
  return out;
}
