import { describe, it, expect } from 'vitest';
import { FEATURE_NAMES, FEATURE_COUNT } from '../contracts';
import type { PersonPeriodRow } from '../contracts';
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
  const x = new Array<number>(FEATURE_COUNT).fill(0);
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
