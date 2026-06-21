import { describe, it, expect } from 'vitest';
import { FEATURE_NAMES, FEATURE_COUNT } from '../contracts';
import { fitMultinomial } from './fitter';
import { generateSyntheticCorpus } from '../synthetic';
import { cumulativeIncidence, attributeFactors } from './competing-risks';

const IDX = (name: string) => FEATURE_NAMES.indexOf(name as never);

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
