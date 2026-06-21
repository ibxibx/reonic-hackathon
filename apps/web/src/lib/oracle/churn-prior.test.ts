import { describe, it, expect } from 'vitest';
import {
  CHURN_DATA,
  REENGAGEMENT_HALF_LIFE_DAYS,
  reengagementOddsMultiplier,
  churnGhostPrior,
  blendWithPrior,
} from './churn-prior';

describe('churn-prior — cited real-world constants', () => {
  it('matches the published figures', () => {
    expect(CHURN_DATA.telcoBaseChurn).toBeCloseTo(0.265, 3);
    expect(CHURN_DATA.telcoMonthToMonthChurn).toBeCloseTo(0.474, 3);
    expect(CHURN_DATA.telcoTwoYearChurn).toBeCloseTo(0.028, 3);
    expect(CHURN_DATA.touchesForMostConversions).toBe(6);
    expect(CHURN_DATA.dealsNeeding5PlusTouches).toBeCloseTo(0.8, 3);
  });
});

describe('reengagementOddsMultiplier', () => {
  it('is 1 at zero days and halves every half-life', () => {
    expect(reengagementOddsMultiplier(0)).toBe(1);
    expect(reengagementOddsMultiplier(REENGAGEMENT_HALF_LIFE_DAYS)).toBeCloseTo(0.5, 6);
    expect(reengagementOddsMultiplier(2 * REENGAGEMENT_HALF_LIFE_DAYS)).toBeCloseTo(0.25, 6);
  });
  it('is monotone decreasing and bounded (0,1]', () => {
    let prev = Infinity;
    for (let d = 0; d <= 30; d++) {
      const m = reengagementOddsMultiplier(d);
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });
  it('treats negative/non-finite as 0 days', () => {
    expect(reengagementOddsMultiplier(-5)).toBe(1);
    expect(reengagementOddsMultiplier(NaN)).toBe(1);
  });
});

describe('churnGhostPrior', () => {
  const base = { financingType: 'loan', currentStep: 0, totalSteps: 0 };

  it('rises monotonically with days since last touch', () => {
    let prev = -1;
    for (const d of [0, 1, 3, 7, 14, 30]) {
      const p = churnGhostPrior({ ...base, daysSinceTouch: d });
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('low-commitment financing (lease/PPA) > committed (cash/loan)', () => {
    const lease = churnGhostPrior({ ...base, financingType: 'lease', daysSinceTouch: 5 });
    const cash = churnGhostPrior({ ...base, financingType: 'cash', daysSinceTouch: 5 });
    expect(lease).toBeGreaterThan(cash);
  });

  it('an active sequence (engagement relief) lowers the prior', () => {
    const disengaged = churnGhostPrior({ financingType: 'loan', daysSinceTouch: 7, currentStep: 0, totalSteps: 5 });
    const engaged = churnGhostPrior({ financingType: 'loan', daysSinceTouch: 7, currentStep: 5, totalSteps: 5 });
    expect(engaged).toBeLessThan(disengaged);
  });

  it('stays within [0,1] for extreme inputs', () => {
    const hi = churnGhostPrior({ financingType: 'ppa', daysSinceTouch: 1000, currentStep: 0, totalSteps: 0 });
    const lo = churnGhostPrior({ financingType: 'cash', daysSinceTouch: 0, currentStep: 10, totalSteps: 10 });
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeGreaterThanOrEqual(0);
  });
});

describe('blendWithPrior', () => {
  it('weight 0 = model, weight 1 = prior, 0.5 = midpoint', () => {
    expect(blendWithPrior(0.2, 0.8, 0)).toBeCloseTo(0.2, 6);
    expect(blendWithPrior(0.2, 0.8, 1)).toBeCloseTo(0.8, 6);
    expect(blendWithPrior(0.2, 0.8, 0.5)).toBeCloseTo(0.5, 6);
  });
  it('clamps weight and output to [0,1]', () => {
    expect(blendWithPrior(2, -1, 5)).toBeGreaterThanOrEqual(0);
    expect(blendWithPrior(2, 2, 0.5)).toBeLessThanOrEqual(1);
  });
});
