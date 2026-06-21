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
