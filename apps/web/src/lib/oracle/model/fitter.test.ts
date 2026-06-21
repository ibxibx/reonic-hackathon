import { describe, it, expect } from 'vitest';
import type { PeriodOutcome, PersonPeriodRow } from '../contracts';
import { FEATURE_COUNT } from '../contracts';
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
