/**
 * Tests for the reproducible eval AGGREGATOR (`buildOracleEvalReport`).
 *
 * The aggregator regenerates every ORACLE_EVAL.md headline number from one
 * deterministic call. These tests assert:
 *   • the aggregate has all 3 sections, each provenance-labeled;
 *   • every metric is finite;
 *   • the synthetic golden DIRECTIONS pass;
 *   • the REAL cross-domain telco AUC clears 0.75;
 *   • determinism — same seeds → byte-identical numbers;
 *   • honesty — the real section never claims solar, calibrated stays false.
 *
 * Model fits run in-process; generous per-test timeouts cover the GD passes.
 */
import { describe, it, expect } from 'vitest';
import { buildOracleEvalReport } from './report';
import { MODEL_VERSION } from './contracts';

describe('buildOracleEvalReport — reproducible eval aggregator', () => {
  it('aggregates all 3 sections, each provenance-labeled, with finite metrics', () => {
    const r = buildOracleEvalReport();

    expect(r.modelVersion).toBe(MODEL_VERSION);

    // Section 1: SYNTHETIC eval.
    expect(r.syntheticEval.provenance).toBe('synthetic');
    expect(r.syntheticEval.report.golden.length).toBeGreaterThan(0);
    expect(r.syntheticEval.report.regime).toBe('balanced');
    expect(r.syntheticEval.label.length).toBeGreaterThan(0);
    for (const key of ['sign', 'ghost'] as const) {
      const m = r.syntheticEval.report.metrics[key];
      expect(Number.isFinite(m.brier)).toBe(true);
      expect(Number.isFinite(m.auc)).toBe(true);
      expect(Number.isFinite(m.ece)).toBe(true);
      expect(m.n).toBeGreaterThan(0);
    }
    expect(Number.isFinite(r.syntheticEval.signAuc)).toBe(true);
    expect(Number.isFinite(r.syntheticEval.ghostAuc)).toBe(true);

    // Section 2: REAL cross-domain benchmark.
    expect(r.realBenchmark.provenance).toBe('real-cross-domain');
    expect(Number.isFinite(r.realBenchmark.result.auc)).toBe(true);
    expect(Number.isFinite(r.realBenchmark.result.ece)).toBe(true);
    expect(Number.isFinite(r.realBenchmark.result.brier)).toBe(true);
    expect(r.realBenchmark.result.n).toBeGreaterThan(0);
    expect(r.realBenchmark.label.length).toBeGreaterThan(0);

    // Section 3: HONEST prior-ranking finding.
    expect(r.priorRanking.provenance).toBe('synthetic');
    expect(Number.isFinite(r.priorRanking.result.rawAuc)).toBe(true);
    expect(Number.isFinite(r.priorRanking.result.priorAuc)).toBe(true);
    expect(Number.isFinite(r.priorRanking.result.blendedAuc)).toBe(true);
    expect(Number.isFinite(r.priorRanking.result.aucDelta)).toBe(true);
    expect(r.priorRanking.label.length).toBeGreaterThan(0);

    // Headline + notes exist and clearly separate synthetic vs real.
    expect(r.headline.length).toBeGreaterThanOrEqual(4);
    expect(r.notes.length).toBeGreaterThan(0);
    const joined = r.headline.join(' ');
    expect(joined).toMatch(/SYNTHETIC/);
    expect(joined).toMatch(/REAL cross-domain/);
  }, 60000);

  it('synthetic golden DIRECTIONS pass', () => {
    const r = buildOracleEvalReport();
    const goldenDetail = r.syntheticEval.report.golden
      .map((g) => `${g.expectation} :: ${g.detail} (passed=${g.passed})`)
      .join(' | ');
    expect(r.syntheticEval.allGoldenPassed, goldenDetail).toBe(true);
    // Every individual golden case is true.
    for (const g of r.syntheticEval.report.golden) {
      expect(g.passed, `${g.expectation} :: ${g.detail}`).toBe(true);
    }
  }, 60000);

  it('REAL cross-domain telco AUC > 0.75 (machinery learns real signal)', () => {
    const r = buildOracleEvalReport();
    expect(r.realBenchmark.result.auc).toBeGreaterThan(0.75);
    expect(r.realBenchmark.result.auc).toBeLessThanOrEqual(1);
  }, 60000);

  it('is honest: real section is telecom-churn, NOT solar, calibrated=false', () => {
    const r = buildOracleEvalReport();
    expect(r.realBenchmark.result.domain).toBe('telecom-churn');
    expect(r.realBenchmark.result.calibrated).toBe(false);
    expect(r.realBenchmark.label).toMatch(/NOT solar/i);
    // The prior-ranking section is honest too: an external/proxy prior, never
    // fitted solar labels.
    expect(r.priorRanking.result.calibrated).toBe(false);
    // No headline line claims a solar outcome.
    expect(r.headline.join(' ')).not.toMatch(/solar outcome/i);
  }, 60000);

  it('is deterministic: same seeds → byte-identical numbers', () => {
    const a = buildOracleEvalReport();
    const b = buildOracleEvalReport();

    // Synthetic section.
    expect(b.syntheticEval.signAuc).toBe(a.syntheticEval.signAuc);
    expect(b.syntheticEval.ghostAuc).toBe(a.syntheticEval.ghostAuc);
    expect(b.syntheticEval.report.metrics.sign.ece).toBe(
      a.syntheticEval.report.metrics.sign.ece
    );
    expect(b.syntheticEval.report.metrics.ghost.ece).toBe(
      a.syntheticEval.report.metrics.ghost.ece
    );
    expect(b.syntheticEval.report.metrics.ghost.brier).toBe(
      a.syntheticEval.report.metrics.ghost.brier
    );

    // Real benchmark section.
    expect(b.realBenchmark.result.auc).toBe(a.realBenchmark.result.auc);
    expect(b.realBenchmark.result.ece).toBe(a.realBenchmark.result.ece);
    expect(b.realBenchmark.result.brier).toBe(a.realBenchmark.result.brier);
    expect(b.realBenchmark.result.n).toBe(a.realBenchmark.result.n);

    // Prior-ranking section.
    expect(b.priorRanking.result.rawAuc).toBe(a.priorRanking.result.rawAuc);
    expect(b.priorRanking.result.priorAuc).toBe(a.priorRanking.result.priorAuc);
    expect(b.priorRanking.result.blendedAuc).toBe(
      a.priorRanking.result.blendedAuc
    );
    expect(b.priorRanking.result.aucDelta).toBe(a.priorRanking.result.aucDelta);

    // Whole headline reproduces verbatim.
    expect(b.headline).toEqual(a.headline);
  }, 60000);

  it('honors custom seeds (different real split → different held-out AUC)', () => {
    const a = buildOracleEvalReport({ realBenchmarkSplitSeed: 7 });
    const b = buildOracleEvalReport({ realBenchmarkSplitSeed: 99 });
    // Different held-out customers → AUC should differ (guards a frozen constant).
    expect(a.realBenchmark.result.auc).not.toBe(b.realBenchmark.result.auc);
    expect(a.seeds.realBenchmarkSplit).toBe(7);
    expect(b.seeds.realBenchmarkSplit).toBe(99);
  }, 60000);
});
