import { describe, it, expect } from 'vitest';
import { FEATURE_NAMES, FEATURE_COUNT } from '../contracts';
import type { FittedModel, PeriodOutcome } from '../contracts';
import { fitMultinomial, predictProbabilities } from './fitter';
import { generateSyntheticCorpus } from '../synthetic';
import { cumulativeIncidence, attributeFactors } from './competing-risks';

const IDX = (name: string) => FEATURE_NAMES.indexOf(name as never);

/**
 * Build a hand-specified FittedModel (no fitting). Standardization is identity
 * (mean 0, sd 1) so coefficients act directly on raw covariates — handy for
 * asserting exact attribution arithmetic and for tiny/degenerate-class models.
 */
function makeModel(
  classes: PeriodOutcome[],
  coefficients: number[][],
  width = FEATURE_COUNT
): FittedModel {
  return {
    kind: 'multinomial',
    featureNames: FEATURE_NAMES.slice(0, width),
    classes: classes.slice(),
    coefficients: coefficients.map((r) => r.slice()),
    standardization: {
      mean: Array.from({ length: width }, () => 0),
      sd: Array.from({ length: width }, () => 1),
    },
    l2: 0,
    modelVersion: 'test',
    trainedOn: 'synthetic',
    nRows: 0,
    nLeads: 0,
  };
}

function fitOnCorpus(seed = 7, nLeads = 500) {
  const corpus = generateSyntheticCorpus({ seed, nLeads });
  return fitMultinomial(corpus.rows, { l2: 0.5, lr: 0.4, maxIter: 600 });
}

/** A plausible base raw vector (FEATURE_NAMES order). */
function baseVector(daysSinceLastTouch: number): number[] {
  const x = Array.from({ length: FEATURE_COUNT }, () => 0);
  x[IDX('monthlyBill')] = 300;
  x[IDX('systemSizeKw')] = 9;
  x[IDX('totalCost')] = 26000;
  x[IDX('costPerKw')] = 2900;
  x[IDX('simplePaybackYears')] = 12;
  x[IDX('monthlySavingsRatio')] = 0.6;
  x[IDX('roi25yrRatio')] = 1.2;
  x[IDX('financingAdjustedUpfront')] = 13000;
  x[IDX('personaConfidence')] = 0.7;
  x[IDX('messagesSent')] = 3;
  x[IDX('distinctChannels')] = 2;
  x[IDX('maxSequenceOrder')] = 3;
  x[IDX('daysSinceLastTouch')] = daysSinceLastTouch;
  x[IDX('stepProgressRatio')] = 0.5;
  x[IDX('daysToNextAction')] = 2;
  x[IDX('daysInPipeline')] = 8;
  x[IDX('daysSinceLatestStrategy')] = 6;
  x[IDX('hasStrategy')] = 1;
  return x;
}

describe('cumulativeIncidence', () => {
  const model = fitOnCorpus();

  it('returns probabilities in [0,1]', () => {
    const ci = cumulativeIncidence(model, baseVector(4));
    expect(ci.signProbability).toBeGreaterThanOrEqual(0);
    expect(ci.signProbability).toBeLessThanOrEqual(1);
    expect(ci.ghostRisk).toBeGreaterThanOrEqual(0);
    expect(ci.ghostRisk).toBeLessThanOrEqual(1);
    expect(ci.horizonDays).toBe(14);
    expect(Array.isArray(ci.perPeriod)).toBe(true);
    expect(ci.perPeriod!.length).toBe(14);
  });

  it('ghostRisk is monotone increasing in base daysSinceLastTouch', () => {
    const low = cumulativeIncidence(model, baseVector(1));
    const mid = cumulativeIncidence(model, baseVector(10));
    const high = cumulativeIncidence(model, baseVector(25));
    expect(mid.ghostRisk).toBeGreaterThan(low.ghostRisk);
    expect(high.ghostRisk).toBeGreaterThan(mid.ghostRisk);
  });

  it('CIFs increase with horizon', () => {
    const short = cumulativeIncidence(model, baseVector(6), 3);
    const long = cumulativeIncidence(model, baseVector(6), 20);
    expect(long.signProbability).toBeGreaterThan(short.signProbability);
    expect(long.ghostRisk).toBeGreaterThan(short.ghostRisk);
  });

  // Horizon-H sensitivity: sweeping H from 1..30 must never DECREASE either
  // cumulative incidence (more periods can only absorb more mass) and the
  // terminal per-period survival must be NON-INCREASING. Checked at several base
  // states so the property is not an artifact of one favourable vector.
  it('signProbability and ghostRisk are non-decreasing as horizon grows', () => {
    for (const dslt of [1, 6, 14, 25]) {
      const base = baseVector(dslt);
      let prevSign = -1;
      let prevGhost = -1;
      let prevSurvive = Number.POSITIVE_INFINITY;
      for (let H = 1; H <= 30; H++) {
        const ci = cumulativeIncidence(model, base, H);
        expect(
          ci.signProbability,
          `sign dropped at H=${H} dslt=${dslt}`
        ).toBeGreaterThanOrEqual(prevSign - 1e-12);
        expect(
          ci.ghostRisk,
          `ghost dropped at H=${H} dslt=${dslt}`
        ).toBeGreaterThanOrEqual(prevGhost - 1e-12);
        // Terminal survival of horizon H = product of stay probs over H
        // periods, which can only shrink as H grows.
        const pp = ci.perPeriod!;
        const terminalSurvive = pp[pp.length - 1].survive;
        expect(
          terminalSurvive,
          `terminal survive rose at H=${H} dslt=${dslt}`
        ).toBeLessThanOrEqual(prevSurvive + 1e-12);
        prevSign = ci.signProbability;
        prevGhost = ci.ghostRisk;
        prevSurvive = terminalSurvive;
      }
    }
  });

  it('per-period survive is non-increasing and each step in [0,1]', () => {
    const ci = cumulativeIncidence(model, baseVector(6), 14);
    const pp = ci.perPeriod!;
    for (let i = 0; i < pp.length; i++) {
      expect(pp[i].sign).toBeGreaterThanOrEqual(0);
      expect(pp[i].sign).toBeLessThanOrEqual(1);
      expect(pp[i].ghost).toBeGreaterThanOrEqual(0);
      expect(pp[i].ghost).toBeLessThanOrEqual(1);
      expect(pp[i].survive).toBeGreaterThanOrEqual(0);
      expect(pp[i].survive).toBeLessThanOrEqual(1);
      if (i > 0) {
        expect(pp[i].survive).toBeLessThanOrEqual(pp[i - 1].survive + 1e-12);
        // cumulative incidence is also non-decreasing
        expect(pp[i].sign).toBeGreaterThanOrEqual(pp[i - 1].sign - 1e-12);
        expect(pp[i].ghost).toBeGreaterThanOrEqual(pp[i - 1].ghost - 1e-12);
      }
    }
  });

  it('horizon 0 yields zero incidence and full survival baseline', () => {
    const ci = cumulativeIncidence(model, baseVector(6), 0);
    expect(ci.signProbability).toBe(0);
    expect(ci.ghostRisk).toBe(0);
    expect(ci.perPeriod!.length).toBe(0);
  });
});

describe('attributeFactors', () => {
  const model = fitOnCorpus();

  it('returns at most topN signed factors with model feature names', () => {
    const factors = attributeFactors(model, baseVector(20), 'ghost', 4);
    expect(factors.length).toBeLessThanOrEqual(4);
    expect(factors.length).toBeGreaterThan(0);
    for (const f of factors) {
      expect(FEATURE_NAMES).toContain(f.feature as never);
      expect(f.target).toBe('ghost');
      expect(typeof f.weight).toBe('number');
      expect(Number.isFinite(f.weight)).toBe(true);
      expect(f.direction).toBe(f.weight >= 0 ? 'increases' : 'decreases');
      expect(typeof f.plainText).toBe('string');
      expect(f.plainText.length).toBeGreaterThan(0);
    }
  });

  it('ranks by descending |contribution|', () => {
    const factors = attributeFactors(model, baseVector(20), 'sign', 8);
    for (let i = 1; i < factors.length; i++) {
      expect(Math.abs(factors[i - 1].weight)).toBeGreaterThanOrEqual(
        Math.abs(factors[i].weight) - 1e-12
      );
    }
  });

  it('direction sign matches the contribution sign', () => {
    const factors = attributeFactors(model, baseVector(25), 'ghost', 25);
    for (const f of factors) {
      if (f.weight > 0) expect(f.direction).toBe('increases');
      if (f.weight < 0) expect(f.direction).toBe('decreases');
    }
  });
});

// ─── MODEL-CORE DEPTH: conservation, edge horizons, degenerate classes ───────

describe('cumulativeIncidence — CIF partition invariant', () => {
  const model = fitOnCorpus();

  // The defining conservation law of competing risks: at EVERY period the mass
  // absorbed into sign + absorbed into ghost + still-surviving must equal 1.
  // The accumulators are signCIF += S*p.sign, ghostCIF += S*p.ghost, S *= p.stay
  // with p.sign+p.ghost+p.stay = 1, so sign+ghost+survive telescopes to 1.
  it('sign + ghost + survive ≈ 1 at every period across base states', () => {
    for (const dslt of [0, 3, 10, 25]) {
      const ci = cumulativeIncidence(model, baseVector(dslt), 20);
      for (const step of ci.perPeriod!) {
        const total = step.sign + step.ghost + step.survive;
        expect(
          total,
          `partition broke at t=${step.t} dslt=${dslt}`
        ).toBeCloseTo(1, 9);
      }
    }
  });

  it('terminal totals reconcile: signProbability + ghostRisk + final survive ≈ 1', () => {
    const ci = cumulativeIncidence(model, baseVector(8), 14);
    const finalSurvive = ci.perPeriod![ci.perPeriod!.length - 1].survive;
    expect(ci.signProbability + ci.ghostRisk + finalSurvive).toBeCloseTo(1, 9);
  });

  it('partition holds exactly for a hand-specified balanced model', () => {
    // Two non-reference classes with intercept-only logits (no covariate
    // dependence) → constant per-period hazards; partition is purely arithmetic.
    const m = makeModel(
      ['stay', 'sign', 'ghost'],
      [
        [-1.0, ...Array.from({ length: FEATURE_COUNT }, () => 0)], // sign logit
        [-1.2, ...Array.from({ length: FEATURE_COUNT }, () => 0)], // ghost logit
      ]
    );
    const base = Array.from({ length: FEATURE_COUNT }, () => 0);
    const ci = cumulativeIncidence(m, base, 12);
    for (const step of ci.perPeriod!) {
      expect(step.sign + step.ghost + step.survive).toBeCloseTo(1, 12);
    }
    // Per-period probabilities are constant here, so each step's incremental
    // sign mass = survive_{t-1} * pSign — verify the very first step exactly.
    const p = predictProbabilities(m, base);
    expect(ci.perPeriod![0].sign).toBeCloseTo(p.sign, 12);
    expect(ci.perPeriod![0].ghost).toBeCloseTo(p.ghost, 12);
    expect(ci.perPeriod![0].survive).toBeCloseTo(p.stay, 12);
  });
});

describe('cumulativeIncidence — horizon edge cases', () => {
  const model = fitOnCorpus();

  it('negative horizon is treated as 0 (no incidence, empty perPeriod)', () => {
    const ci = cumulativeIncidence(model, baseVector(6), -5);
    expect(ci.signProbability).toBe(0);
    expect(ci.ghostRisk).toBe(0);
    expect(ci.horizonDays).toBe(0);
    expect(ci.perPeriod).toEqual([]);
  });

  it('non-finite horizon is treated as 0', () => {
    const ci = cumulativeIncidence(model, baseVector(6), Number.NaN);
    expect(ci.signProbability).toBe(0);
    expect(ci.ghostRisk).toBe(0);
    expect(ci.horizonDays).toBe(0);
  });

  it('fractional horizon floors to whole periods', () => {
    const a = cumulativeIncidence(model, baseVector(6), 5.9);
    const b = cumulativeIncidence(model, baseVector(6), 5);
    expect(a.horizonDays).toBe(5);
    expect(a.perPeriod!.length).toBe(5);
    expect(a.signProbability).toBeCloseTo(b.signProbability, 12);
    expect(a.ghostRisk).toBeCloseTo(b.ghostRisk, 12);
  });

  it('default horizon equals DEFAULT_HORIZON_DAYS (14)', () => {
    const ci = cumulativeIncidence(model, baseVector(6));
    expect(ci.horizonDays).toBe(14);
    expect(ci.perPeriod!.length).toBe(14);
  });
});

describe('cumulativeIncidence — degenerate (2-class) model', () => {
  // A stay/sign-only model: ghost is not a competing risk at all, so ghostRisk
  // must be exactly 0 and sign + survive must partition to 1.
  const m = makeModel(
    ['stay', 'sign'],
    [[-0.8, ...Array.from({ length: FEATURE_COUNT }, () => 0)]]
  );
  const base = Array.from({ length: FEATURE_COUNT }, () => 0);

  it('ghostRisk is identically 0 with no ghost class', () => {
    const ci = cumulativeIncidence(m, base, 10);
    expect(ci.ghostRisk).toBe(0);
    for (const step of ci.perPeriod!) expect(step.ghost).toBe(0);
  });

  it('sign + survive partition to 1 each period', () => {
    const ci = cumulativeIncidence(m, base, 10);
    for (const step of ci.perPeriod!) {
      expect(step.sign + step.survive).toBeCloseTo(1, 12);
    }
  });

  it('signProbability is still positive and bounded', () => {
    const ci = cumulativeIncidence(m, base, 10);
    expect(ci.signProbability).toBeGreaterThan(0);
    expect(ci.signProbability).toBeLessThanOrEqual(1);
  });
});

describe('attributeFactors — class-row selection & contribution arithmetic', () => {
  // Identity standardization (mean 0, sd 1) → contribution_j = beta_j * xRaw_j,
  // so we can assert the EXACT attribution and confirm the right coef row is
  // chosen for each target. Distinct, recognizable betas per class.
  const SIGN_BETA = 2; // applied to feature index 0 (monthlyBill slot)
  const GHOST_BETA = -3; // applied to feature index 1 (systemSizeKw slot)
  const signRow = [0, ...FEATURE_NAMES.map((_, j) => (j === 0 ? SIGN_BETA : 0))];
  const ghostRow = [0, ...FEATURE_NAMES.map((_, j) => (j === 1 ? GHOST_BETA : 0))];
  const m = makeModel(['stay', 'sign', 'ghost'], [signRow, ghostRow]);

  function rawWith(idx0: number, idx1: number): number[] {
    const x = Array.from({ length: FEATURE_COUNT }, () => 0);
    x[0] = idx0;
    x[1] = idx1;
    return x;
  }

  it('sign target reads coefficients row 0 (sign), not the ghost row', () => {
    const factors = attributeFactors(m, rawWith(5, 7), 'sign', 25);
    // Only feature 0 has a non-zero sign beta → only that factor is non-zero.
    const nonZero = factors.filter((f) => f.weight !== 0);
    expect(nonZero.length).toBe(1);
    expect(nonZero[0].feature).toBe(FEATURE_NAMES[0]);
    // contribution = beta(2) * z(5) = 10, increasing sign.
    expect(nonZero[0].weight).toBeCloseTo(SIGN_BETA * 5, 12);
    expect(nonZero[0].direction).toBe('increases');
    expect(nonZero[0].target).toBe('sign');
  });

  it('ghost target reads coefficients row 1 (ghost) with the right sign', () => {
    const factors = attributeFactors(m, rawWith(5, 7), 'ghost', 25);
    const nonZero = factors.filter((f) => f.weight !== 0);
    expect(nonZero.length).toBe(1);
    expect(nonZero[0].feature).toBe(FEATURE_NAMES[1]);
    // contribution = beta(-3) * z(7) = -21, decreasing ghost.
    expect(nonZero[0].weight).toBeCloseTo(GHOST_BETA * 7, 12);
    expect(nonZero[0].direction).toBe('decreases');
    expect(nonZero[0].target).toBe('ghost');
  });

  it('the top factor matches the highest-|weight| feature', () => {
    const factors = attributeFactors(m, rawWith(1, 10), 'ghost', 25);
    // ghost only weights feature 1: |(-3)*10| = 30; feature 0 has 0 weight.
    expect(factors[0].feature).toBe(FEATURE_NAMES[1]);
    expect(Math.abs(factors[0].weight)).toBeCloseTo(30, 12);
  });
});

describe('attributeFactors — topN handling & absent targets', () => {
  const model = fitOnCorpus();

  it('caps output at topN and never exceeds the feature count', () => {
    const three = attributeFactors(model, baseVector(12), 'sign', 3);
    expect(three.length).toBe(3);
    const huge = attributeFactors(model, baseVector(12), 'sign', 999);
    expect(huge.length).toBeLessThanOrEqual(FEATURE_COUNT);
    expect(huge.length).toBe(FEATURE_COUNT);
  });

  it('topN <= 0 or non-finite returns all factors', () => {
    const all = attributeFactors(model, baseVector(12), 'sign', FEATURE_COUNT);
    const zero = attributeFactors(model, baseVector(12), 'sign', 0);
    const neg = attributeFactors(model, baseVector(12), 'sign', -4);
    const nan = attributeFactors(model, baseVector(12), 'sign', Number.NaN);
    expect(zero.length).toBe(all.length);
    expect(neg.length).toBe(all.length);
    expect(nan.length).toBe(all.length);
  });

  it('topN floors a fractional request', () => {
    const f = attributeFactors(model, baseVector(12), 'sign', 4.9);
    expect(f.length).toBe(4);
  });

  it('returns [] when the requested target is not a model class', () => {
    // stay/sign-only model has no ghost row → asking for ghost yields nothing.
    const twoClass = makeModel(
      ['stay', 'sign'],
      [[0, ...FEATURE_NAMES.map(() => 0)]]
    );
    expect(attributeFactors(twoClass, baseVector(12), 'ghost', 5)).toEqual([]);
  });

  it('every factor carries a non-empty deterministic plainText for both targets', () => {
    for (const target of ['sign', 'ghost'] as const) {
      const factors = attributeFactors(model, baseVector(18), target, 6);
      for (const f of factors) {
        expect(typeof f.plainText).toBe('string');
        expect(f.plainText.length).toBeGreaterThan(0);
        expect(f.plainText.toLowerCase()).toContain(target);
      }
    }
  });
});
