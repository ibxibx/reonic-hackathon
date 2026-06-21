import { describe, it, expect } from 'vitest';
import type { PeriodOutcome, PersonPeriodRow } from '../contracts';
import { fitMultinomial, predictProbabilities } from './fitter';

// ─── self-contained seeded RNG (no Math.random) ─────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box-Muller using a uniform RNG. */
function nextGaussian(rng: () => number): number {
  let u1 = rng();
  const u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const CLASSES: PeriodOutcome[] = ['stay', 'sign', 'ghost'];

/** Stable softmax over a small logit vector (test-local helper). */
function softmaxLocal(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((s, v) => s + v, 0);
  return exps.map((v) => v / sum);
}

/** Sample a class index from a categorical distribution. */
function sampleCategorical(probs: number[], rng: () => number): number {
  const u = rng();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (u <= acc) return i;
  }
  return probs.length - 1;
}

/**
 * Generate person-period rows from a known multinomial model.
 * trueCoef[c] = [intercept, ...betas] for non-reference class c+1; reference
 * (class 0 = stay) logit fixed at 0. Features are gaussian (already roughly
 * standardized in raw space, so recovered standardized betas ~ true betas).
 */
function genCorpus(
  seed: number,
  nRows: number,
  p: number,
  trueCoef: number[][]
): PersonPeriodRow[] {
  const rng = mulberry32(seed);
  const rows: PersonPeriodRow[] = [];
  for (let r = 0; r < nRows; r++) {
    const x = new Array<number>(p);
    for (let j = 0; j < p; j++) x[j] = nextGaussian(rng);
    const logits = [0];
    for (let c = 0; c < trueCoef.length; c++) {
      let s = trueCoef[c][0];
      for (let j = 0; j < p; j++) s += trueCoef[c][j + 1] * x[j];
      logits.push(s);
    }
    const probs = softmaxLocal(logits);
    const ci = sampleCategorical(probs, rng);
    rows.push({
      leadId: `lead-${r % 200}`,
      t: 0,
      outcome: CLASSES[ci],
      x,
      synthetic: true,
    });
  }
  return rows;
}

describe('fitMultinomial — coefficient recovery', () => {
  it('recovers known standardized betas (signs + correlation)', () => {
    const p = 5;
    // [intercept, b1..b5] for sign and ghost rows.
    const trueCoef = [
      [-0.3, 1.5, -1.0, 0.0, 0.8, -0.5], // sign
      [0.2, -0.7, 1.2, 0.5, 0.0, 1.0], // ghost
    ];
    const rows = genCorpus(7, 6000, p, trueCoef);
    const model = fitMultinomial(rows, {
      l2: 0.01,
      lr: 0.5,
      maxIter: 2000,
      tol: 1e-8,
    });

    expect(model.kind).toBe('multinomial');
    expect(model.classes).toEqual(CLASSES);
    expect(model.coefficients.length).toBe(2);
    expect(model.coefficients[0].length).toBe(p + 1);

    // Compare betas (skip intercepts). Features are ~unit-variance gaussians,
    // so standardized betas should closely track the true raw betas.
    const trueBetas: number[] = [];
    const fitBetas: number[] = [];
    for (let c = 0; c < 2; c++) {
      for (let j = 1; j <= p; j++) {
        trueBetas.push(trueCoef[c][j]);
        fitBetas.push(model.coefficients[c][j]);
      }
    }

    // No NaN/Infinity anywhere.
    for (const v of fitBetas) expect(Number.isFinite(v)).toBe(true);

    // Sign agreement on clearly-nonzero true betas.
    for (let i = 0; i < trueBetas.length; i++) {
      if (Math.abs(trueBetas[i]) >= 0.5) {
        expect(Math.sign(fitBetas[i])).toBe(Math.sign(trueBetas[i]));
      }
    }

    // Pearson correlation between true and fitted betas > 0.9.
    const n = trueBetas.length;
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const mt = mean(trueBetas);
    const mf = mean(fitBetas);
    let cov = 0;
    let vt = 0;
    let vf = 0;
    for (let i = 0; i < n; i++) {
      const dt = trueBetas[i] - mt;
      const df = fitBetas[i] - mf;
      cov += dt * df;
      vt += dt * dt;
      vf += df * df;
    }
    const corr = cov / (Math.sqrt(vt) * Math.sqrt(vf));
    expect(corr).toBeGreaterThan(0.9);
  });
});

describe('predictProbabilities', () => {
  it('returns a valid distribution over outcomes', () => {
    const p = 4;
    const trueCoef = [
      [0.0, 1.0, -0.5, 0.0, 0.6],
      [0.0, -0.4, 0.9, 0.3, 0.0],
    ];
    const rows = genCorpus(11, 4000, p, trueCoef);
    const model = fitMultinomial(rows, { l2: 0.1, lr: 0.4, maxIter: 800 });

    const probs = predictProbabilities(model, [0.5, -0.2, 1.0, 0.0]);
    const keys: PeriodOutcome[] = ['stay', 'sign', 'ghost'];
    let sum = 0;
    for (const k of keys) {
      expect(probs[k]).toBeGreaterThanOrEqual(0);
      expect(probs[k]).toBeLessThanOrEqual(1);
      expect(Number.isFinite(probs[k])).toBe(true);
      sum += probs[k];
    }
    expect(sum).toBeCloseTo(1, 10);
  });

  it('is monotone in a positive-beta feature for sign', () => {
    const p = 3;
    // Feature 0 strongly increases sign, nothing else.
    const trueCoef = [
      [0.0, 2.0, 0.0, 0.0], // sign: +beta on feature 0
      [0.0, 0.0, 0.0, 0.0], // ghost: flat
    ];
    const rows = genCorpus(23, 6000, p, trueCoef);
    const model = fitMultinomial(rows, { l2: 0.01, lr: 0.5, maxIter: 1500 });

    const lo = predictProbabilities(model, [-2, 0, 0]).sign;
    const mid = predictProbabilities(model, [0, 0, 0]).sign;
    const hi = predictProbabilities(model, [2, 0, 0]).sign;
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });
});

describe('numerical stability', () => {
  it('produces finite coefficients with extreme values + high L2', () => {
    const p = 4;
    const rng = mulberry32(99);
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 1500; r++) {
      const x = [
        (rng() - 0.5) * 1e8, // huge scale
        nextGaussian(rng) * 1e-7, // tiny scale
        rng() < 0.5 ? 0 : 1, // binary
        nextGaussian(rng),
      ];
      const ci = r % 3; // deterministic mix of all classes
      rows.push({
        leadId: `lead-${r % 50}`,
        t: 0,
        outcome: CLASSES[ci],
        x,
        synthetic: true,
      });
    }
    const model = fitMultinomial(rows, { l2: 100, lr: 0.5, maxIter: 400 });
    for (const row of model.coefficients) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
    // standardization guarded (no zero sd)
    for (const s of model.standardization.sd) {
      expect(s).toBeGreaterThan(0);
      expect(Number.isFinite(s)).toBe(true);
    }
    const probs = predictProbabilities(model, [1e8, 1e-7, 1, 0.5]);
    let sum = 0;
    for (const k of ['stay', 'sign', 'ghost'] as PeriodOutcome[]) {
      expect(Number.isFinite(probs[k])).toBe(true);
      sum += probs[k];
    }
    expect(sum).toBeCloseTo(1, 10);
  });

  it('handles a constant feature (sd guarded to 1)', () => {
    const p = 3;
    const rng = mulberry32(5);
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 600; r++) {
      const x = [7, nextGaussian(rng), nextGaussian(rng)]; // feature 0 constant
      rows.push({
        leadId: `c-${r}`,
        t: 0,
        outcome: CLASSES[r % 3],
        x,
        synthetic: true,
      });
    }
    const model = fitMultinomial(rows, { l2: 1, lr: 0.2, maxIter: 200 });
    expect(model.standardization.sd[0]).toBe(1);
    for (const row of model.coefficients) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('convergence', () => {
  it('training log-loss decreases over iterations', () => {
    const p = 4;
    const trueCoef = [
      [0.1, 1.0, -0.8, 0.5, 0.0],
      [-0.2, -0.5, 0.7, 0.0, 0.9],
    ];
    const rows = genCorpus(42, 4000, p, trueCoef);

    const logLoss = (model: ReturnType<typeof fitMultinomial>): number => {
      let loss = 0;
      for (const row of rows) {
        const probs = predictProbabilities(model, row.x);
        const p = probs[row.outcome];
        loss += -Math.log(p > 1e-15 ? p : 1e-15);
      }
      return loss / rows.length;
    };

    const early = fitMultinomial(rows, { l2: 0.01, lr: 0.3, maxIter: 5, tol: 0 });
    const late = fitMultinomial(rows, {
      l2: 0.01,
      lr: 0.3,
      maxIter: 600,
      tol: 1e-9,
    });

    const lossEarly = logLoss(early);
    const lossLate = logLoss(late);
    expect(Number.isFinite(lossEarly)).toBe(true);
    expect(Number.isFinite(lossLate)).toBe(true);
    expect(lossLate).toBeLessThan(lossEarly);
  });
});

describe('feature-name resolution', () => {
  it('uses generated f-names when width != FEATURE_COUNT', () => {
    const rows = genCorpus(3, 300, 4, [
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
    ]);
    const model = fitMultinomial(rows);
    expect(model.featureNames).toEqual(['f0', 'f1', 'f2', 'f3']);
  });

  it('honors explicit featureNames', () => {
    const rows = genCorpus(3, 300, 3, [
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ]);
    const model = fitMultinomial(rows, {
      featureNames: ['a', 'b', 'c'],
    });
    expect(model.featureNames).toEqual(['a', 'b', 'c']);
    expect(model.nLeads).toBeGreaterThan(0);
    expect(model.nRows).toBe(300);
  });
});
