/**
 * Tests for the REAL-labeled telco-churn benchmark.
 *
 * These prove the Oracle fitter + calibration machinery learns genuine signal on
 * a REAL labeled dataset (IBM telco churn — an ADJACENT domain used as a
 * cross-domain proxy, NOT solar outcomes). Headline assertion: held-out AUC > 0.75.
 */
import { describe, it, expect } from 'vitest';
import {
  benchmarkRealChurn,
  realChurnDrivers,
  realChurnBaseRateSkill,
} from './real-benchmark';
import fx from './fixtures/telco-churn-sample.json';

describe('benchmarkRealChurn — REAL telco churn (cross-domain proxy)', () => {
  it('learns real signal: held-out AUC > 0.75', () => {
    const r = benchmarkRealChurn();
    // Real telco churn is well-known to be learnable; a sane multinomial logit
    // on 16 tabular features clears 0.75 AUC on a held-out split with room to spare.
    expect(r.auc).toBeGreaterThan(0.75);
    expect(r.auc).toBeLessThanOrEqual(1);
  });

  it('ECE and Brier are finite and reasonable on held-out data', () => {
    const r = benchmarkRealChurn();
    expect(Number.isFinite(r.ece)).toBe(true);
    expect(Number.isFinite(r.brier)).toBe(true);
    // A reasonably calibrated binary model: ECE small, Brier well under the
    // uninformative 0.25 baseline (p=0.5 everywhere).
    expect(r.ece).toBeGreaterThanOrEqual(0);
    expect(r.ece).toBeLessThan(0.15);
    expect(r.brier).toBeGreaterThan(0);
    expect(r.brier).toBeLessThan(0.25);
  });

  it('Platt recalibration does not worsen held-out ECE beyond epsilon', () => {
    const r = benchmarkRealChurn();
    expect(Number.isFinite(r.calibratedAfter.ece)).toBe(true);
    expect(Number.isFinite(r.calibratedAfter.brier)).toBe(true);
    // Platt is a 1-D logistic refit on the same held-out set; it should not blow
    // up ECE. Allow a small epsilon for optimization noise.
    const EPS = 0.01;
    expect(r.calibratedAfter.ece).toBeLessThanOrEqual(r.ece + EPS);
  });

  it('reported churnRate matches the fixture (~0.257)', () => {
    const r = benchmarkRealChurn();
    expect(r.churnRate).toBeCloseTo(fx.churnRate, 3);
    expect(r.churnRate).toBeCloseTo(0.257, 2);
  });

  it('held-out n reflects the test fraction (~30% of 3000)', () => {
    const r = benchmarkRealChurn();
    expect(r.n).toBeGreaterThan(0);
    expect(r.n).toBe(Math.floor(fx.rows.length * 0.3));
    expect(r.metricsRaw.n).toBe(r.n);
  });

  it('is honest: domain=telecom-churn, calibrated=false (never flips solar flag)', () => {
    const r = benchmarkRealChurn();
    expect(r.domain).toBe('telecom-churn');
    expect(r.calibrated).toBe(false);
    expect(r.source.toLowerCase()).toContain('telco');
    expect(r.notes.join(' ')).toMatch(/NOT solar/i);
  });

  it('is deterministic: same seed → identical metrics', () => {
    const a = benchmarkRealChurn({ splitSeed: 7 });
    const b = benchmarkRealChurn({ splitSeed: 7 });
    expect(b.auc).toBe(a.auc);
    expect(b.ece).toBe(a.ece);
    expect(b.brier).toBe(a.brier);
    expect(b.n).toBe(a.n);
    expect(b.calibratedAfter.ece).toBe(a.calibratedAfter.ece);
    expect(b.calibratedAfter.brier).toBe(a.calibratedAfter.brier);
  });

  it('different seeds still clear the AUC bar (robust, not seed-lucky)', () => {
    const seeds = [1, 42, 2024];
    for (const splitSeed of seeds) {
      const r = benchmarkRealChurn({ splitSeed });
      expect(r.auc).toBeGreaterThan(0.75);
    }
  });

  it('different split seeds generally give different held-out metrics', () => {
    const a = benchmarkRealChurn({ splitSeed: 7 });
    const b = benchmarkRealChurn({ splitSeed: 99 });
    // Different held-out customers → AUC should differ (guards against a constant).
    expect(a.auc).not.toBe(b.auc);
  });
});

describe('realChurnDrivers — learned REAL telco-churn STRUCTURE (not just a score)', () => {
  it('returns one standardized ghost driver per fixture feature, sorted by |weight|', () => {
    const r = realChurnDrivers();
    expect(r.drivers.length).toBe(fx.featureNames.length);
    // Exactly the fixture features, no extras / dupes.
    const got = r.drivers.map((d) => d.feature).sort();
    expect(got).toEqual([...fx.featureNames].sort());
    // Sorted by descending |weight|.
    for (let i = 1; i < r.drivers.length; i++) {
      expect(Math.abs(r.drivers[i - 1].weight)).toBeGreaterThanOrEqual(
        Math.abs(r.drivers[i].weight)
      );
    }
    // byFeature is a faithful index of drivers.
    for (const d of r.drivers) {
      expect(r.byFeature[d.feature]).toEqual(d);
    }
    // Fit on the full fixture (all rows), not a split.
    expect(r.nRows).toBe(fx.rows.length);
  });

  it('direction label agrees with the sign of each weight', () => {
    const r = realChurnDrivers();
    for (const d of r.drivers) {
      if (d.weight > 0) expect(d.direction).toBe('increases');
      else if (d.weight < 0) expect(d.direction).toBe('decreases');
      else expect(d.direction).toBe('flat');
    }
  });

  it('recovers textbook Telco-churn DIRECTIONS (month-to-month↑, two-year↓, tenure↓, fiber↑, e-check↑)', () => {
    const r = realChurnDrivers();
    // Ghost(=churn) coefficient signs match the canonical, well-established Telco
    // churn drivers. If any of these flips, that is a real finding to report — do
    // NOT weaken the assertion to make it pass.
    expect(r.byFeature['contractMonthToMonth'].weight).toBeGreaterThan(0);
    expect(r.byFeature['contractTwoYear'].weight).toBeLessThan(0);
    expect(r.byFeature['tenure'].weight).toBeLessThan(0);
    expect(r.byFeature['fiber'].weight).toBeGreaterThan(0);
    expect(r.byFeature['electronicCheck'].weight).toBeGreaterThan(0);
  });

  it('tenure is among the strongest learned drivers (textbook #1 churn signal)', () => {
    const r = realChurnDrivers();
    const top3 = r.drivers.slice(0, 3).map((d) => d.feature);
    expect(top3).toContain('tenure');
  });

  it('is honest about provenance: telecom-churn proxy, calibrated=false', () => {
    const r = realChurnDrivers();
    expect(r.domain).toBe('telecom-churn');
    expect(r.calibrated).toBe(false);
    expect(r.source.toLowerCase()).toContain('telco');
    expect(r.notes.join(' ')).toMatch(/NOT solar/i);
    expect(r.churnRate).toBeCloseTo(0.257, 2);
  });

  it('is deterministic: identical drivers across calls', () => {
    const a = realChurnDrivers();
    const b = realChurnDrivers();
    expect(b.drivers).toEqual(a.drivers);
  });
});

describe('realChurnBaseRateSkill — beats the constant base-rate predictor', () => {
  it('Brier Skill Score > 0 (model carries info beyond the base rate)', () => {
    const r = realChurnBaseRateSkill();
    expect(Number.isFinite(r.brierSkillScore)).toBe(true);
    expect(r.brierSkillScore).toBeGreaterThan(0);
    // Equivalent statement: model Brier strictly below the base-rate Brier.
    expect(r.brierModel).toBeLessThan(r.brierBaseRate);
  });

  it('the reference forecaster is the train base rate (~0.257) and BSS = 1 − ratio', () => {
    const r = realChurnBaseRateSkill();
    expect(r.baseRate).toBeGreaterThan(0.2);
    expect(r.baseRate).toBeLessThan(0.32);
    expect(r.brierSkillScore).toBeCloseTo(1 - r.brierModel / r.brierBaseRate, 9);
    expect(r.n).toBe(Math.floor(fx.rows.length * 0.3));
  });

  it('skill is robust across seeds (not seed-lucky)', () => {
    for (const splitSeed of [1, 42, 2024]) {
      const r = realChurnBaseRateSkill({ splitSeed });
      expect(r.brierSkillScore).toBeGreaterThan(0);
    }
  });

  it('is honest about provenance: telecom-churn proxy, calibrated=false', () => {
    const r = realChurnBaseRateSkill();
    expect(r.domain).toBe('telecom-churn');
    expect(r.calibrated).toBe(false);
    expect(r.source.toLowerCase()).toContain('telco');
    expect(r.notes.join(' ')).toMatch(/NOT solar/i);
  });

  it('is deterministic: same seed → identical skill numbers', () => {
    const a = realChurnBaseRateSkill({ splitSeed: 7 });
    const b = realChurnBaseRateSkill({ splitSeed: 7 });
    expect(b.brierModel).toBe(a.brierModel);
    expect(b.brierBaseRate).toBe(a.brierBaseRate);
    expect(b.brierSkillScore).toBe(a.brierSkillScore);
  });
});
