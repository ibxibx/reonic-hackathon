import { describe, it, expect } from 'vitest';
import type {
  FittedModel,
  PeriodOutcome,
  PersonPeriodRow,
  Standardization,
} from '../contracts';
import { FEATURE_COUNT } from '../contracts';
import {
  crossValidateL2,
  fitMultinomial,
  predictProbabilities,
} from './fitter';

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
    const x = Array.from({ length: p }, () => 0);
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
  // Heavy GD fit (6000 rows x 2000 iters): give it headroom so it never trips
  // the 5s default under parallel full-suite CPU contention. Additive timeout
  // only — assertions/behavior unchanged.
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
  }, 30000);
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
  }, 30000);

  // Heavy fit (6000 rows x 1500 iters): timeout headroom under parallel load.
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
  }, 30000);
});

describe('numerical stability', () => {
  it('produces finite coefficients with extreme values + high L2', () => {
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
  // Two full fits (4000 rows; 600-iter late fit): headroom for the 5s default
  // under parallel full-suite contention. Additive timeout only.
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
  }, 30000);
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

// ─── HARDENING (A2) ─────────────────────────────────────────────────────────

/** L2 norm of all betas (skips the per-class intercept at index 0). */
function betaL2Norm(model: ReturnType<typeof fitMultinomial>): number {
  let acc = 0;
  for (const row of model.coefficients) {
    for (let j = 1; j < row.length; j++) acc += row[j] * row[j];
  }
  return Math.sqrt(acc);
}

describe('hardening — regularization sweep', () => {
  it(
    'increasing L2 monotonically shrinks the L2 norm of fitted betas',
    () => {
      const p = 4;
      // Clear signal, but a MODEST sample so the L2 term has real leverage over
      // the data term across the sweep (heavy L2 must genuinely pull betas down).
      const trueCoef = [
        [-0.2, 1.5, -1.0, 0.8, 0.0], // sign
        [0.1, -0.7, 1.2, 0.0, 0.9], // ghost
      ];
      const rows = genCorpus(101, 600, p, trueCoef);

      // Same optimizer budget; only L2 varies. Wide, well-separated grid spanning
      // light -> very heavy so the trend toward 0 is unambiguous.
      const l2Grid = [0.01, 1, 10, 100, 1000];
      const norms = l2Grid.map((l2) =>
        betaL2Norm(
          fitMultinomial(rows, { l2, lr: 0.5, maxIter: 400, tol: 1e-9 })
        )
      );

      // Every norm is finite.
      for (const v of norms) expect(Number.isFinite(v)).toBe(true);

      // Strictly decreasing across the grid (heavier penalty -> smaller betas).
      for (let i = 1; i < norms.length; i++) {
        expect(norms[i]).toBeLessThan(norms[i - 1]);
      }

      // Trend points toward 0: the heaviest penalty collapses the betas to a
      // small fraction of the lightly-penalized norm (genuine shrinkage).
      expect(norms[norms.length - 1]).toBeLessThan(norms[0] * 0.2);
      expect(norms[norms.length - 1]).toBeGreaterThanOrEqual(0);
    },
    30000
  );
});

describe('hardening — distribution property (random standardized inputs)', () => {
  it('predictProbabilities returns a 3-key distribution summing to 1', () => {
    const p = 6;
    const trueCoef = [
      [0.1, 0.9, -0.5, 0.3, 0.0, 0.4, -0.2],
      [-0.1, -0.4, 0.8, 0.0, 0.5, -0.3, 0.6],
    ];
    const rows = genCorpus(202, 4000, p, trueCoef);
    const model = fitMultinomial(rows, { l2: 0.2, lr: 0.4, maxIter: 600 });

    const rng = mulberry32(7777);
    const keys: PeriodOutcome[] = ['stay', 'sign', 'ghost'];
    for (let trial = 0; trial < 400; trial++) {
      // Random standardized-ish inputs spanning a wide range.
      const x = Array.from({ length: p }, () => nextGaussian(rng) * 3);
      const probs = predictProbabilities(model, x);

      // Exactly the three outcome keys, all present.
      expect(Object.keys(probs).sort()).toEqual(
        ['ghost', 'sign', 'stay'].sort()
      );

      let sum = 0;
      for (const k of keys) {
        expect(Number.isFinite(probs[k])).toBe(true);
        expect(probs[k]).toBeGreaterThanOrEqual(0);
        expect(probs[k]).toBeLessThanOrEqual(1);
        sum += probs[k];
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('hardening — degenerate label distributions', () => {
  it('all-one-class rows degrade gracefully (no NaN)', () => {
    const p = 4;
    const rng = mulberry32(31);
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 800; r++) {
      const x = Array.from({ length: p }, () => nextGaussian(rng));
      rows.push({
        leadId: `one-${r % 40}`,
        t: 0,
        outcome: 'stay', // every single row is the reference class
        x,
        synthetic: true,
      });
    }
    const model = fitMultinomial(rows, { l2: 1, lr: 0.3, maxIter: 300 });

    // No NaN/Infinity anywhere in the coefficients.
    for (const row of model.coefficients) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }

    // Probabilities remain a valid distribution; reference class dominates.
    const probs = predictProbabilities(model, [0.5, -1, 0.2, 0.8]);
    let sum = 0;
    for (const k of ['stay', 'sign', 'ghost'] as PeriodOutcome[]) {
      expect(Number.isFinite(probs[k])).toBe(true);
      sum += probs[k];
    }
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    expect(probs.stay).toBeGreaterThan(probs.sign);
    expect(probs.stay).toBeGreaterThan(probs.ghost);
  });

  it('a single non-reference class present (no `sign` rows) stays finite', () => {
    const p = 3;
    const rng = mulberry32(63);
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 700; r++) {
      const x = Array.from({ length: p }, () => nextGaussian(rng));
      // Only stay + ghost ever occur; `sign` class is never observed.
      rows.push({
        leadId: `two-${r % 35}`,
        t: 0,
        outcome: r % 2 === 0 ? 'stay' : 'ghost',
        x,
        synthetic: true,
      });
    }
    const model = fitMultinomial(rows, { l2: 0.5, lr: 0.3, maxIter: 300 });
    for (const row of model.coefficients) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
    const probs = predictProbabilities(model, [1, -1, 0.5]);
    let sum = 0;
    for (const k of ['stay', 'sign', 'ghost'] as PeriodOutcome[]) {
      expect(Number.isFinite(probs[k])).toBe(true);
      sum += probs[k];
    }
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });
});

describe('hardening — numerical robustness of inputs', () => {
  it('scrubs NaN/Infinity in training rows (finite model + finite probs)', () => {
    const rng = mulberry32(8);
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 1200; r++) {
      const x = [
        nextGaussian(rng),
        // Sprinkle non-finite garbage into otherwise-usable rows.
        r % 7 === 0 ? Number.NaN : nextGaussian(rng),
        r % 11 === 0 ? Number.POSITIVE_INFINITY : nextGaussian(rng),
        r % 13 === 0 ? Number.NEGATIVE_INFINITY : nextGaussian(rng),
      ];
      rows.push({
        leadId: `nan-${r % 60}`,
        t: 0,
        outcome: CLASSES[r % 3],
        x,
        synthetic: true,
      });
    }
    const model = fitMultinomial(rows, { l2: 1, lr: 0.3, maxIter: 250 });

    // Standardization is finite & guarded.
    for (const m of model.standardization.mean) {
      expect(Number.isFinite(m)).toBe(true);
    }
    for (const s of model.standardization.sd) {
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
    // Coefficients finite.
    for (const row of model.coefficients) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }

    // Even a non-finite INFERENCE vector yields a valid distribution.
    const probs = predictProbabilities(model, [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0.5,
    ]);
    let sum = 0;
    for (const k of ['stay', 'sign', 'ghost'] as PeriodOutcome[]) {
      expect(Number.isFinite(probs[k])).toBe(true);
      sum += probs[k];
    }
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it('guards a near-constant feature (sd -> 1, no blow-up)', () => {
    const rng = mulberry32(404);
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 900; r++) {
      const x = [
        // Near-constant: tiny jitter well below the 1e-9 sd guard threshold.
        3 + (rng() - 0.5) * 1e-12,
        nextGaussian(rng),
        nextGaussian(rng),
      ];
      rows.push({
        leadId: `nc-${r % 45}`,
        t: 0,
        outcome: CLASSES[r % 3],
        x,
        synthetic: true,
      });
    }
    const model = fitMultinomial(rows, { l2: 1, lr: 0.3, maxIter: 250 });
    // Near-constant column's sd is guarded to exactly 1.
    expect(model.standardization.sd[0]).toBe(1);
    for (const row of model.coefficients) {
      for (const v of row) expect(Number.isFinite(v)).toBe(true);
    }
    const probs = predictProbabilities(model, [3, 0.2, -0.4]);
    let sum = 0;
    for (const k of ['stay', 'sign', 'ghost'] as PeriodOutcome[]) {
      expect(Number.isFinite(probs[k])).toBe(true);
      sum += probs[k];
    }
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });
});

describe('hardening — feature-width property', () => {
  it('width != FEATURE_COUNT yields f0..fN names and width+1 params/class', () => {
    // Sweep several widths, all deliberately != FEATURE_COUNT.
    for (const width of [1, 2, 7, FEATURE_COUNT + 3]) {
      // Build a trueCoef matrix [intercept, ...width betas] for sign & ghost.
      const signRow = [0, ...Array.from({ length: width }, () => 0)];
      const ghostRow = [0, ...Array.from({ length: width }, () => 0)];
      if (width >= 1) {
        signRow[1] = 1.2; // give some signal so the fit actually runs
        ghostRow[1] = -0.9;
      }
      const rows = genCorpus(900 + width, 600, width, [signRow, ghostRow]);
      const model = fitMultinomial(rows);

      // Generated f-names, exactly width of them.
      expect(model.featureNames).toEqual(
        Array.from({ length: width }, (_, i) => `f${i}`)
      );

      // One coefficient row per non-reference class (sign, ghost) = 2.
      expect(model.coefficients.length).toBe(2);
      for (const row of model.coefficients) {
        // width betas + 1 intercept.
        expect(row.length).toBe(width + 1);
        for (const v of row) expect(Number.isFinite(v)).toBe(true);
      }

      // predictProbabilities works at the model's width.
      const probs = predictProbabilities(
        model,
        Array.from({ length: width }, () => 0.3)
      );
      let sum = 0;
      for (const k of ['stay', 'sign', 'ghost'] as PeriodOutcome[]) {
        sum += probs[k];
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('at width == FEATURE_COUNT, canonical names are used (not f-names)', () => {
    const width = FEATURE_COUNT;
    const signRow = [0, ...Array.from({ length: width }, (_, i) =>
      i === 0 ? 1 : 0
    )];
    const ghostRow = [0, ...Array.from({ length: width }, () => 0)];
    const rows = genCorpus(555, 400, width, [signRow, ghostRow]);
    const model = fitMultinomial(rows);
    expect(model.featureNames.length).toBe(FEATURE_COUNT);
    // Canonical first name, and not the generated 'f0'.
    expect(model.featureNames[0]).not.toBe('f0');
    expect(model.coefficients[0].length).toBe(FEATURE_COUNT + 1);
  });
});

// ─── A2 CV: lead-aware k-fold cross-validation ──────────────────────────────

/**
 * Multi-period corpus: each lead contributes `periodsPerLead` consecutive rows
 * (t = 0..k-1). Rows of one lead MUST never split across a CV fold boundary, so
 * this is the right shape to prove no within-lead period leakage.
 */
function genMultiPeriodCorpus(
  seed: number,
  nLeads: number,
  periodsPerLead: number,
  p: number,
  trueCoef: number[][]
): PersonPeriodRow[] {
  const rng = mulberry32(seed);
  const rows: PersonPeriodRow[] = [];
  for (let l = 0; l < nLeads; l++) {
    const leadId = `lead-${l}`;
    for (let t = 0; t < periodsPerLead; t++) {
      const x = Array.from({ length: p }, () => nextGaussian(rng));
      const logits = [0];
      for (let c = 0; c < trueCoef.length; c++) {
        let s = trueCoef[c][0];
        for (let j = 0; j < p; j++) s += trueCoef[c][j + 1] * x[j];
        logits.push(s);
      }
      const ci = sampleCategorical(softmaxLocal(logits), rng);
      rows.push({ leadId, t, outcome: CLASSES[ci], x, synthetic: true });
    }
  }
  return rows;
}

describe('crossValidateL2 — lead-aware k-fold', () => {
  it('picks a sensible l2 and never leaks leads across folds', () => {
    const p = 4;
    const trueCoef = [
      [-0.2, 1.4, -1.0, 0.7, 0.0], // sign
      [0.1, -0.6, 1.1, 0.0, 0.8], // ghost
    ];
    // 60 leads x 6 periods = 360 rows; clear signal, modest size.
    const rows = genMultiPeriodCorpus(2024, 60, 6, p, trueCoef);

    // Grid spans far-too-light (overfits) → reasonable → far-too-heavy
    // (collapses betas, underfits). The interior value should win.
    const l2Grid = [1e-4, 0.1, 1, 1000];
    const res = crossValidateL2(rows, {
      l2Grid,
      folds: 5,
      seed: 7,
      fit: { lr: 0.4, maxIter: 300, tol: 1e-8 },
    });

    // Reports the requested fold count and the right lead population.
    expect(res.folds).toBe(5);
    expect(res.nLeads).toBe(60);

    // Every grid point was scored and every mean is finite.
    expect(res.perL2.length).toBe(l2Grid.length);
    for (const d of res.perL2) {
      expect(Number.isFinite(d.meanLogLoss)).toBe(true);
      expect(d.foldLogLoss.length).toBe(5);
      for (const v of d.foldLogLoss) expect(Number.isFinite(v)).toBe(true);
    }

    // The chosen l2 is on the grid and is the argmin of mean held-out log-loss.
    expect(l2Grid).toContain(res.bestL2);
    const minMean = Math.min(...res.perL2.map((d) => d.meanLogLoss));
    expect(res.bestMeanLogLoss).toBeCloseTo(minMean, 12);
    const chosen = res.perL2.find((d) => d.l2 === res.bestL2);
    expect(chosen?.meanLogLoss).toBeCloseTo(minMean, 12);

    // SENSIBLE: the winner is NOT the absurd extremes (under/over-regularized).
    expect(res.bestL2).not.toBe(1e-4);
    expect(res.bestL2).not.toBe(1000);

    // The heaviest penalty must score strictly worse than the winner (it
    // collapses real signal), proving CV is actually discriminating.
    const heavy = res.perL2.find((d) => d.l2 === 1000);
    expect(heavy!.meanLogLoss).toBeGreaterThan(res.bestMeanLogLoss);

    // NO LEAD LEAKAGE: rebuild the exact fold buckets from the returned
    // assignment and assert each lead lives in exactly one fold, and that a
    // lead's rows are wholly inside its fold (never split train/test).
    const assignment = res.assignment;
    const distinctLeads = new Set(rows.map((r) => r.leadId));
    expect(Object.keys(assignment).length).toBe(distinctLeads.size);

    const foldOfLead = new Map<string, number>();
    for (const [lead, fold] of Object.entries(assignment)) {
      expect(fold).toBeGreaterThanOrEqual(0);
      expect(fold).toBeLessThan(res.folds);
      foldOfLead.set(lead, fold);
    }
    // Each fold's row-set and its complement share NO leadId.
    for (let f = 0; f < res.folds; f++) {
      const testLeads = new Set<string>();
      const trainLeads = new Set<string>();
      for (const r of rows) {
        if (foldOfLead.get(r.leadId) === f) testLeads.add(r.leadId);
        else trainLeads.add(r.leadId);
      }
      for (const lead of testLeads) {
        expect(trainLeads.has(lead)).toBe(false);
      }
    }

    // Every fold is non-empty (folds <= #leads) so CV used all the data.
    const foldSizes = Array.from({ length: res.folds }, () => 0);
    for (const lead of distinctLeads) foldSizes[foldOfLead.get(lead)!]++;
    for (const s of foldSizes) expect(s).toBeGreaterThan(0);
  }, 30000);

  it('is deterministic for a fixed (rows, folds, seed)', () => {
    const rows = genMultiPeriodCorpus(99, 40, 5, 3, [
      [0, 1.0, -0.5, 0.3],
      [0, -0.4, 0.8, 0.0],
    ]);
    const opts = {
      l2Grid: [0.1, 1, 10],
      folds: 4,
      seed: 13,
      fit: { lr: 0.3, maxIter: 150 },
    };
    const a = crossValidateL2(rows, opts);
    const b = crossValidateL2(rows, opts);
    expect(a.bestL2).toBe(b.bestL2);
    expect(a.assignment).toEqual(b.assignment);
    expect(a.perL2.map((d) => d.meanLogLoss)).toEqual(
      b.perL2.map((d) => d.meanLogLoss)
    );
  });

  it('clamps folds to the lead count and degrades on an empty grid', () => {
    // Only 3 distinct leads but 10 folds requested → clamp to 3.
    const rows = genMultiPeriodCorpus(5, 3, 8, 2, [
      [0, 0.8, -0.3],
      [0, -0.2, 0.6],
    ]);
    const res = crossValidateL2(rows, { l2Grid: [], folds: 10, seed: 1 });
    expect(res.folds).toBeLessThanOrEqual(3);
    expect(res.folds).toBeGreaterThanOrEqual(2);
    // Empty grid falls back to the default single candidate.
    expect(res.perL2.length).toBe(1);
    expect(typeof res.bestL2).toBe('number');
  });
});

// ─── A2 property: analytic gradient vs finite differences ───────────────────

const GRAD_CLASSES: PeriodOutcome[] = ['stay', 'sign', 'ghost'];

/**
 * Build a FittedModel wrapper around arbitrary coefficients with an IDENTITY
 * standardization (mean 0, sd 1), so predictProbabilities consumes raw x as the
 * standardized z the math is written in. Lets us evaluate the exact loss surface
 * the fitter optimizes at any coefficient point.
 */
function modelFromCoef(coef: number[][], width: number): FittedModel {
  const standardization: Standardization = {
    mean: Array.from({ length: width }, () => 0),
    sd: Array.from({ length: width }, () => 1),
  };
  return {
    kind: 'multinomial',
    featureNames: Array.from({ length: width }, (_, i) => `f${i}`),
    classes: GRAD_CLASSES.slice(),
    coefficients: coef.map((r) => r.slice()),
    standardization,
    l2: 0,
    modelVersion: 'test',
    trainedOn: 'synthetic',
    nRows: 0,
    nLeads: 0,
  };
}

/** Average NLL of `rows` under `coef` (no L2), via predictProbabilities. */
function nllAt(coef: number[][], width: number, rows: PersonPeriodRow[]): number {
  const model = modelFromCoef(coef, width);
  let loss = 0;
  for (const row of rows) {
    const probs = predictProbabilities(model, row.x);
    const p = probs[row.outcome];
    loss += -Math.log(p > 1e-15 ? p : 1e-15);
  }
  return loss / rows.length;
}

/**
 * Analytic gradient of the average NLL wrt the non-reference coefficient rows,
 * EXACTLY the (p_c - 1[y==c]) * z formula fitMultinomial implements (intercept
 * uses z=1). Returned in the same [class-1][0=intercept, ...betas] shape.
 */
function analyticGrad(
  coef: number[][],
  width: number,
  rows: PersonPeriodRow[]
): number[][] {
  const model = modelFromCoef(coef, width);
  const nParamRows = coef.length;
  const grad = coef.map((r) => r.map(() => 0));
  const classIndex = new Map<string, number>();
  GRAD_CLASSES.forEach((c, i) => classIndex.set(c, i));
  for (const row of rows) {
    const probs = predictProbabilities(model, row.x);
    const yr = classIndex.get(row.outcome)!;
    for (let c = 1; c <= nParamRows; c++) {
      const err = probs[GRAD_CLASSES[c]] - (yr === c ? 1 : 0);
      grad[c - 1][0] += err; // intercept (z = 1)
      for (let j = 0; j < width; j++) grad[c - 1][j + 1] += err * row.x[j];
    }
  }
  for (const g of grad) for (let j = 0; j < g.length; j++) g[j] /= rows.length;
  return grad;
}

describe('A2 property — gradient correctness (finite differences)', () => {
  it('analytic NLL gradient matches central finite differences on a tiny problem', () => {
    const width = 3;
    const rng = mulberry32(2718);
    // Small, fixed dataset spanning all three classes.
    const rows: PersonPeriodRow[] = [];
    for (let r = 0; r < 40; r++) {
      const x = Array.from({ length: width }, () => nextGaussian(rng));
      rows.push({
        leadId: `g-${r}`,
        t: 0,
        outcome: GRAD_CLASSES[r % 3],
        x,
        synthetic: true,
      });
    }

    // An arbitrary (non-optimal) coefficient point so the gradient is nonzero.
    const coef = [
      [0.2, 0.5, -0.3, 0.1], // sign
      [-0.1, 0.4, 0.2, -0.6], // ghost
    ];

    const g = analyticGrad(coef, width, rows);
    const h = 1e-5;
    let maxAbsGrad = 0;
    for (let c = 0; c < coef.length; c++) {
      for (let j = 0; j < coef[c].length; j++) {
        const plus = coef.map((r) => r.slice());
        const minus = coef.map((r) => r.slice());
        plus[c][j] += h;
        minus[c][j] -= h;
        const fd = (nllAt(plus, width, rows) - nllAt(minus, width, rows)) / (2 * h);
        // Tight agreement: central differences are O(h^2) accurate.
        expect(Math.abs(g[c][j] - fd)).toBeLessThan(1e-6);
        maxAbsGrad = Math.max(maxAbsGrad, Math.abs(g[c][j]));
      }
    }
    // The chosen point is genuinely off-optimum (nonzero gradient), so the test
    // is meaningful rather than trivially comparing two ~zero vectors.
    expect(maxAbsGrad).toBeGreaterThan(1e-3);
  });

  it('gradient vanishes (≈0) at a well-converged fit', () => {
    const p = 3;
    const trueCoef = [
      [0.1, 1.2, -0.8, 0.4],
      [-0.2, -0.5, 0.9, 0.0],
    ];
    const rows = genCorpus(321, 4000, p, trueCoef);
    const model = fitMultinomial(rows, { l2: 0, lr: 0.5, maxIter: 3000, tol: 1e-12 });
    // At the (unregularized) optimum the data-term gradient must be near zero.
    const g = analyticGrad(
      model.coefficients,
      p,
      // Re-standardize rows the way the model sees them so the identity-std
      // wrapper in analyticGrad matches: feed standardized features.
      rows.map((r) => ({
        ...r,
        x: r.x.map(
          (v, j) =>
            (v - model.standardization.mean[j]) / model.standardization.sd[j]
        ),
      }))
    );
    let maxAbs = 0;
    for (const row of g) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeLessThan(5e-3);
  }, 30000);
});

// ─── A2 property — monotone calibration under temperature ───────────────────

/**
 * Temperature-scale the logits of a 2-class softmax. We model the per-period
 * binary case sign-vs-stay: prob = sigmoid(logit / T). Lower T sharpens,
 * higher T flattens toward 0.5. Calibration via temperature is MONOTONE: it
 * never reorders examples and pulls probabilities monotonically toward 0.5 as T
 * grows. We assert both properties using the fitter's own probabilities as the
 * raw scores.
 */
describe('A2 property — monotone calibration under temperature', () => {
  it('temperature scaling is order-preserving and shrinks toward 0.5 as T grows', () => {
    const p = 4;
    const trueCoef = [
      [0.0, 1.3, -0.7, 0.5, 0.0], // sign
      [0.0, -0.5, 0.9, 0.0, 0.6], // ghost
    ];
    const rows = genCorpus(8888, 4000, p, trueCoef);
    const model = fitMultinomial(rows, { l2: 0.1, lr: 0.4, maxIter: 600 });

    // Raw per-example sign probabilities over a spread of inputs.
    const rng = mulberry32(4242);
    const rawSign: number[] = [];
    for (let i = 0; i < 200; i++) {
      const x = Array.from({ length: p }, () => nextGaussian(rng) * 2);
      rawSign.push(predictProbabilities(model, x).sign);
    }

    // Map probability → logit, temperature-scale, map back via sigmoid.
    const logit = (q: number) => {
      const c = Math.min(1 - 1e-12, Math.max(1e-12, q));
      return Math.log(c / (1 - c));
    };
    const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
    const temper = (q: number, T: number) => sigmoid(logit(q) / T);

    // 1) ORDER PRESERVATION: for any temperature, ranking is unchanged.
    for (const T of [0.5, 1, 2, 5]) {
      for (let i = 0; i < rawSign.length; i++) {
        for (let k = i + 1; k < rawSign.length; k++) {
          const aRaw = rawSign[i];
          const bRaw = rawSign[k];
          const aCal = temper(aRaw, T);
          const bCal = temper(bRaw, T);
          if (aRaw < bRaw) {
            expect(aCal).toBeLessThanOrEqual(bCal + 1e-12);
          } else if (aRaw > bRaw) {
            expect(aCal).toBeGreaterThanOrEqual(bCal - 1e-12);
          }
        }
      }
    }

    // 2) MONOTONE SHRINKAGE: raising T moves each prob monotonically toward 0.5
    // (|p - 0.5| is non-increasing in T).
    const temps = [0.5, 1, 2, 4, 8, 16];
    for (const q of rawSign) {
      let prevDist = Infinity;
      for (const T of temps) {
        const dist = Math.abs(temper(q, T) - 0.5);
        expect(dist).toBeLessThanOrEqual(prevDist + 1e-9);
        prevDist = dist;
      }
      // In the limit of large T the probability approaches 0.5.
      expect(Math.abs(temper(q, 1e6) - 0.5)).toBeLessThan(1e-3);
    }
  }, 30000);
});
