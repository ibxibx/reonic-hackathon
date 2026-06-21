import { describe, it, expect } from 'vitest';
import {
  dot,
  addVec,
  subVec,
  scaleVec,
  zeros,
  matVecMul,
  transpose,
  logSumExp,
  softmax,
} from './linalg';

describe('linalg primitives', () => {
  it('dot computes the inner product', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(dot([], [])).toBe(0);
  });

  it('dot truncates to the shorter length', () => {
    expect(dot([1, 2, 3], [10, 10])).toBe(30);
  });

  it('addVec / subVec are element-wise', () => {
    expect(addVec([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(subVec([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
  });

  it('scaleVec multiplies by a scalar', () => {
    expect(scaleVec([1, -2, 3], 2)).toEqual([2, -4, 6]);
    expect(scaleVec([1, 2], 0)).toEqual([0, 0]);
  });

  it('zeros builds a zero vector', () => {
    expect(zeros(3)).toEqual([0, 0, 0]);
    expect(zeros(0)).toEqual([]);
    expect(zeros(-2)).toEqual([]);
  });

  it('matVecMul multiplies row-major matrix by vector', () => {
    const m = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    expect(matVecMul(m, [1, 1])).toEqual([3, 7, 11]);
    expect(matVecMul(m, [1, 0])).toEqual([1, 3, 5]);
  });

  it('transpose flips rows/cols', () => {
    expect(
      transpose([
        [1, 2, 3],
        [4, 5, 6],
      ])
    ).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
    expect(transpose([])).toEqual([]);
  });
});

describe('logSumExp', () => {
  it('matches the naive computation on moderate inputs', () => {
    const logits = [0.5, -1.2, 2.0, 0.0];
    const naive = Math.log(logits.reduce((s, v) => s + Math.exp(v), 0));
    expect(logSumExp(logits)).toBeCloseTo(naive, 12);
  });

  it('is stable under large inputs (no overflow)', () => {
    const big = [1000, 1001, 1002];
    const lse = logSumExp(big);
    expect(Number.isFinite(lse)).toBe(true);
    // log(e^1000+e^1001+e^1002) = 1002 + log(e^-2+e^-1+1)
    const expected = 1002 + Math.log(Math.exp(-2) + Math.exp(-1) + 1);
    expect(lse).toBeCloseTo(expected, 9);
  });

  it('handles empty and all -Infinity', () => {
    expect(logSumExp([])).toBe(-Infinity);
    expect(logSumExp([-Infinity, -Infinity])).toBe(-Infinity);
  });
});

describe('softmax', () => {
  it('produces a probability distribution summing to 1', () => {
    const p = softmax([1, 2, 3]);
    const sum = p.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 12);
    for (const v of p) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // monotone in logits
    expect(p[0]).toBeLessThan(p[1]);
    expect(p[1]).toBeLessThan(p[2]);
  });

  it('is stable under extreme logits (no NaN)', () => {
    const p = softmax([1e6, -1e6, 0]);
    const sum = p.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 12);
    for (const v of p) expect(Number.isFinite(v)).toBe(true);
    // first entry should dominate
    expect(p[0]).toBeGreaterThan(0.99);
  });

  it('uniform when all logits equal', () => {
    const p = softmax([5, 5, 5, 5]);
    for (const v of p) expect(v).toBeCloseTo(0.25, 12);
  });

  it('degrades to uniform on non-finite inputs', () => {
    const p = softmax([-Infinity, -Infinity]);
    expect(p).toEqual([0.5, 0.5]);
  });

  it('handles empty input', () => {
    expect(softmax([])).toEqual([]);
  });
});

// ─── MODEL-CORE DEPTH: additional property / edge coverage ───────────────────

describe('linalg vector ops — ragged & degenerate inputs', () => {
  it('dot mixes signs correctly', () => {
    // 1*-1 + -2*-1 + 3*1 = -1 + 2 + 3 = 4
    expect(dot([1, -2, 3], [-1, -1, 1])).toBe(4);
  });

  it('dot is symmetric and zero-annihilating', () => {
    expect(dot([3, 4], [4, 3])).toBe(dot([4, 3], [3, 4]));
    expect(dot([0, 0, 0], [9, 9, 9])).toBe(0);
    expect(dot([1, 2, 3], [])).toBe(0); // empty operand truncates to 0 terms
  });

  it('addVec / subVec truncate to the shorter operand', () => {
    expect(addVec([1, 2, 3, 4], [10, 20])).toEqual([11, 22]);
    expect(subVec([10, 20], [1, 2, 3, 4])).toEqual([9, 18]);
    expect(addVec([], [1, 2])).toEqual([]);
    expect(subVec([1, 2], [])).toEqual([]);
  });

  it('addVec then subVec round-trips on equal lengths', () => {
    const a = [3, -7, 11];
    const b = [1, 2, -4];
    expect(subVec(addVec(a, b), b)).toEqual(a);
  });

  it('scaleVec handles negative scalar and empty vector', () => {
    expect(scaleVec([1, -2, 3], -1)).toEqual([-1, 2, -3]);
    expect(scaleVec([], 5)).toEqual([]);
  });
});

describe('matVecMul — shapes & ragged guards', () => {
  it('empty matrix yields empty result', () => {
    expect(matVecMul([], [1, 2, 3])).toEqual([]);
  });

  it('single-row matrix is a single dot product', () => {
    expect(matVecMul([[2, 3, 4]], [1, 1, 1])).toEqual([9]);
  });

  it('ragged rows truncate per-row via dot (no throw, no NaN)', () => {
    const m = [
      [1, 2, 3],
      [4, 5], // shorter row → dot truncates against v
      [6],
    ];
    const out = matVecMul(m, [1, 1, 1]);
    expect(out).toEqual([6, 9, 6]);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it('a wider vector than the row simply ignores the extra entries', () => {
    expect(matVecMul([[1, 1]], [10, 20, 999])).toEqual([30]);
  });
});

describe('transpose — ragged / degenerate shapes', () => {
  it('pads ragged rows with 0 to a full rectangle', () => {
    // widest row has 3 cols → output is 3 rows × 2 cols, missing cells 0.
    expect(
      transpose([
        [1, 2, 3],
        [4],
      ])
    ).toEqual([
      [1, 4],
      [2, 0],
      [3, 0],
    ]);
  });

  it('single-row matrix becomes a column', () => {
    expect(transpose([[7, 8, 9]])).toEqual([[7], [8], [9]]);
  });

  it('single-column matrix becomes a row', () => {
    expect(transpose([[1], [2], [3]])).toEqual([[1, 2, 3]]);
  });

  it('double transpose recovers a rectangular matrix', () => {
    const m = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    expect(transpose(transpose(m))).toEqual(m);
  });

  it('a matrix of empty rows transposes to an empty matrix', () => {
    expect(transpose([[], [], []])).toEqual([]);
  });
});

describe('logSumExp — additional invariants', () => {
  it('single element equals that element', () => {
    expect(logSumExp([3.7])).toBeCloseTo(3.7, 12);
    expect(logSumExp([-50])).toBeCloseTo(-50, 12);
  });

  it('ignores a lone -Infinity among finite logits', () => {
    const withInf = logSumExp([-Infinity, 0, 1]);
    const without = logSumExp([0, 1]);
    expect(withInf).toBeCloseTo(without, 12);
  });

  it('is invariant to permutation of inputs', () => {
    const a = logSumExp([0.1, 2.3, -4.0, 5.5]);
    const b = logSumExp([5.5, -4.0, 0.1, 2.3]);
    expect(a).toBeCloseTo(b, 12);
  });

  it('shift identity: logSumExp(x + c) = logSumExp(x) + c', () => {
    const x = [0.2, -1.1, 3.4];
    const c = 7.5;
    const shifted = logSumExp(x.map((v) => v + c));
    expect(shifted).toBeCloseTo(logSumExp(x) + c, 9);
  });

  it('stays finite for very negative (underflow-prone) logits', () => {
    const lse = logSumExp([-1000, -1001, -1002]);
    expect(Number.isFinite(lse)).toBe(true);
    // dominated by the largest (-1000) plus a small positive correction.
    expect(lse).toBeGreaterThan(-1000);
    expect(lse).toBeLessThan(-999);
  });
});

describe('softmax — additional invariants', () => {
  it('single element collapses to [1]', () => {
    expect(softmax([42])).toEqual([1]);
    expect(softmax([-9])).toEqual([1]);
  });

  it('is shift-invariant: softmax(x) == softmax(x + c)', () => {
    const x = [0.3, -1.2, 2.1, 0.0];
    const c = 13.7;
    const a = softmax(x);
    const b = softmax(x.map((v) => v + c));
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 12);
  });

  it('relates to logSumExp: p_i = exp(x_i - logSumExp(x))', () => {
    const x = [0.5, -1.0, 2.0];
    const lse = logSumExp(x);
    const p = softmax(x);
    for (let i = 0; i < x.length; i++) {
      expect(p[i]).toBeCloseTo(Math.exp(x[i] - lse), 12);
    }
  });

  it('drives a lone -Infinity logit to exactly 0 while others stay normalized', () => {
    const p = softmax([-Infinity, 0, 0]);
    expect(p[0]).toBe(0);
    expect(p[1]).toBeCloseTo(0.5, 12);
    expect(p[2]).toBeCloseTo(0.5, 12);
    expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
  });

  it('order of outputs follows order of inputs (argmax preserved)', () => {
    const p = softmax([2, 9, 2, -3]);
    let argmax = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[argmax]) argmax = i;
    expect(argmax).toBe(1);
  });
});
