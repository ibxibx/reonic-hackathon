import { describe, it, expect } from 'vitest';
import { fitMultinomial } from './model/fitter';
import { generateSyntheticCorpus } from './synthetic';
import { calibrateFromCorpus } from './calibration';
import { FEATURE_NAMES } from './contracts';
import type { FeatureName, SyntheticCorpus } from './contracts';
import {
  runGoldenCases,
  runEvalReport,
  buildSeedFeatures,
} from './eval';

function fitModel() {
  const corpus = generateSyntheticCorpus({ seed: 7, nLeads: 600 });
  const model = fitMultinomial(corpus.rows, { l2: 0.5, lr: 0.4, maxIter: 600 });
  return { model, corpus };
}

describe('buildSeedFeatures', () => {
  it('builds 5 faithful seed fixtures', () => {
    const seeds = buildSeedFeatures();
    expect(seeds.length).toBe(5);
    const noah = seeds.find((f) => f.leadId.endsWith('004'))!;
    expect(noah.hasStrategy).toBe(false);
    expect(noah.personaConfidence).toBe(0);
    const lukas = seeds.find((f) => f.leadId.endsWith('002'))!;
    expect(lukas.persona).toBe('investor');
    expect(lukas.awaitingReply).toBe(true);
  });
});

describe('runGoldenCases', () => {
  it('the two relative directions hold on a corpus-fit model', () => {
    const { model } = fitModel();
    const golden = runGoldenCases(model, buildSeedFeatures());
    expect(golden.length).toBe(2);
    for (const g of golden) {
      // surface the detail if a direction fails
      expect(g.passed, `${g.expectation} :: ${g.detail}`).toBe(true);
    }
  }, 30000);
});

describe('runEvalReport', () => {
  it('returns finite metrics and a non-empty golden array', () => {
    const { model, corpus } = fitModel();
    const report = runEvalReport(model, corpus);

    expect(report.golden.length).toBeGreaterThan(0);
    expect(report.modelVersion).toBeTruthy();
    expect(report.regime).toBe('balanced');
    expect(report.notes.length).toBeGreaterThan(0);

    for (const key of ['sign', 'ghost'] as const) {
      const m = report.metrics[key];
      expect(Number.isFinite(m.brier)).toBe(true);
      expect(Number.isFinite(m.auc)).toBe(true);
      expect(Number.isFinite(m.ece)).toBe(true);
      expect(m.n).toBeGreaterThan(0);
    }
  }, 30000);
});

// ─── Feature-group ablation ──────────────────────────────────────────────────
//
// Fit three models on the SAME corpus, zeroing out feature GROUPS in the row
// vectors before fitting, and compare held-out AUC. The zeroing is done here in
// the test (production code is never touched). We zero both the person-period
// rows (training signal) and the lead-level snapshot features (scoring input),
// because calibrateFromCorpus scores each lead from corpus.labels[].features.
// A feature that is zero everywhere has zero variance → guarded sd=1 → its
// standardized column is all zeros → it contributes nothing, exactly the
// "drop this group" semantics we want without changing FEATURE_COUNT.

const ECON_KEEP: readonly FeatureName[] = [
  'monthlyBill',
  'systemSizeKw',
  'totalCost',
  'costPerKw',
  'simplePaybackYears',
  'monthlySavingsRatio',
  'roi25yrRatio',
  'financingAdjustedUpfront',
];

const ENGAGEMENT_KEEP: readonly FeatureName[] = [
  'messagesSent',
  'messagesFailed',
  'distinctChannels',
  'maxSequenceOrder',
  'daysSinceLastTouch',
  'stepProgressRatio',
  'daysToNextAction',
  'awaitingReply',
];

/** Indices (in FEATURE_NAMES order) to KEEP; all others get zeroed. */
function keepMask(keep: readonly FeatureName[]): boolean[] {
  const keepSet = new Set<string>(keep);
  return FEATURE_NAMES.map((n) => keepSet.has(n));
}

/** Zero every covariate not in `keep`, in both rows and label snapshots. */
function ablate(
  corpus: SyntheticCorpus,
  keep: readonly FeatureName[] | 'all'
): SyntheticCorpus {
  if (keep === 'all') {
    return {
      ...corpus,
      rows: corpus.rows.map((r) => ({ ...r, x: r.x.slice() })),
      labels: corpus.labels.map((l) => ({ ...l, features: l.features.slice() })),
    };
  }
  const mask = keepMask(keep);
  const zero = (v: number[]) => v.map((val, j) => (mask[j] ? val : 0));
  return {
    ...corpus,
    rows: corpus.rows.map((r) => ({ ...r, x: zero(r.x) })),
    labels: corpus.labels.map((l) => ({ ...l, features: zero(l.features) })),
  };
}

/** Held-out (raw, pre-calibration) AUC for a target on an ablated corpus. */
function heldOutAuc(
  corpus: SyntheticCorpus,
  keep: readonly FeatureName[] | 'all',
  target: 'sign' | 'ghost'
): number {
  const ab = ablate(corpus, keep);
  // Modest n / iterations: enough to make the ranking robust while keeping the
  // 6-fit ablation light so it does not starve sibling test workers.
  const model = fitMultinomial(ab.rows, { l2: 0.5, lr: 0.4, maxIter: 300 });
  const { heldOut } = calibrateFromCorpus(model, ab, target, {
    method: 'platt',
    splitSeed: 99,
  });
  return heldOut.before.auc;
}

describe('feature-group ablation', () => {
  // Held-out AUC is noisy on a finite split; allow a small epsilon when
  // asserting full >= each subset.
  const AUC_EPS = 0.03;

  it('full model AUC >= each single-group model (ghost and sign)', () => {
    const corpus = generateSyntheticCorpus({ seed: 7, nLeads: 350 });

    // Fit each ablated model ONCE, reuse for both targets (calibrateFrom
    // corpus is cheap; the GD fit dominates), keeping runtime bounded.
    const results: Record<string, { ghost: number; sign: number }> = {
      economics: {
        ghost: heldOutAuc(corpus, ECON_KEEP, 'ghost'),
        sign: heldOutAuc(corpus, ECON_KEEP, 'sign'),
      },
      engagement: {
        ghost: heldOutAuc(corpus, ENGAGEMENT_KEEP, 'ghost'),
        sign: heldOutAuc(corpus, ENGAGEMENT_KEEP, 'sign'),
      },
      full: {
        ghost: heldOutAuc(corpus, 'all', 'ghost'),
        sign: heldOutAuc(corpus, 'all', 'sign'),
      },
    };

    // Surface the numbers (these are reported in ablationOrMetrics for the doc).
    const fmt = (v: number) => v.toFixed(4);
    const summary =
      `ABLATION held-out AUC (seed=7, n=350): ` +
      `ghost{econ=${fmt(results.economics.ghost)} ` +
      `engage=${fmt(results.engagement.ghost)} ` +
      `full=${fmt(results.full.ghost)}} ` +
      `sign{econ=${fmt(results.economics.sign)} ` +
      `engage=${fmt(results.engagement.sign)} ` +
      `full=${fmt(results.full.sign)}}`;

    for (const target of ['ghost', 'sign'] as const) {
      expect(
        results.full[target],
        `${summary} :: full >= economics (${target})`
      ).toBeGreaterThanOrEqual(results.economics[target] - AUC_EPS);
      expect(
        results.full[target],
        `${summary} :: full >= engagement (${target})`
      ).toBeGreaterThanOrEqual(results.engagement[target] - AUC_EPS);
    }

    // Sanity: the full model genuinely discriminates both outcomes.
    expect(results.full.ghost).toBeGreaterThan(0.6);
    expect(results.full.sign).toBeGreaterThan(0.6);
  }, 120000);
});
