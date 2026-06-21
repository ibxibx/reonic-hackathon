/**
 * Tests for the REAL-labeled telco-churn benchmark.
 *
 * These prove the Oracle fitter + calibration machinery learns genuine signal on
 * a REAL labeled dataset (IBM telco churn — an ADJACENT domain used as a
 * cross-domain proxy, NOT solar outcomes). Headline assertion: held-out AUC > 0.75.
 */
import { describe, it, expect } from 'vitest';
import { benchmarkRealChurn } from './real-benchmark';
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
