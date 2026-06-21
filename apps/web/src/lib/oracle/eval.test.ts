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
  backtestPredictions,
} from './eval';
import { mulberry32 } from './synthetic';
import type { BacktestRow } from './eval';
import type { TerminalOutcome } from './contracts';

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

// ─── Backtest harness ────────────────────────────────────────────────────────
//
// Simulate a stored predictions-history vs final status. We GENERATE a
// synthetic-but-realistic set where, per lead, the terminal status is drawn from
// well-calibrated probabilities, so the harness should report low ECE, AUC well
// above 0.5, and exact positive counts.

/**
 * Build n rows where the truth is drawn from the emitted probabilities, so the
 * predictions ARE (in expectation) calibrated. ghost/sign/stay are mutually
 * exclusive; we draw a single multinomial per lead and record its terminal.
 */
function makeBacktestSet(n: number, seed: number): BacktestRow[] {
  const rng = mulberry32(seed);
  const rows: BacktestRow[] = [];
  for (let i = 0; i < n; i++) {
    // Draw plausible emitted probs that sum to < 1 (stay takes the remainder).
    let g = rng() * 0.6; // ghostRisk
    let s = rng() * (1 - g) * 0.8; // signProbability
    if (g + s > 1) {
      const k = 1 / (g + s);
      g *= k;
      s *= k;
    }
    const u = rng();
    let terminal: TerminalOutcome;
    if (u < g) terminal = 'ghost';
    else if (u < g + s) terminal = 'sign';
    else terminal = 'censored';
    rows.push({
      leadId: `bt-${seed}-${i}`,
      predictedGhost: g,
      predictedSign: s,
      terminalStatus: terminal,
    });
  }
  return rows;
}

describe('backtestPredictions', () => {
  it('on a self-calibrated set: low ECE, AUC > 0.5, finite metrics', () => {
    const rows = makeBacktestSet(4000, 21);
    const res = backtestPredictions(rows);

    for (const key of ['sign', 'ghost'] as const) {
      const m = res.metrics[key];
      expect(Number.isFinite(m.brier)).toBe(true);
      expect(Number.isFinite(m.auc)).toBe(true);
      expect(Number.isFinite(m.ece)).toBe(true);
      // Truth drawn from the emitted probs → genuinely calibrated → small ECE,
      // and the probabilities discriminate the outcome.
      expect(m.ece, `${key} ECE=${m.ece.toFixed(4)}`).toBeLessThan(0.05);
      expect(m.auc, `${key} AUC=${m.auc.toFixed(4)}`).toBeGreaterThan(0.6);
    }
  });

  it('counts positives and censored exactly; censored are 0-labels by default', () => {
    const rows: BacktestRow[] = [
      { predictedGhost: 0.9, predictedSign: 0.05, terminalStatus: 'ghost' },
      { predictedGhost: 0.1, predictedSign: 0.85, terminalStatus: 'sign' },
      { predictedGhost: 0.2, predictedSign: 0.2, terminalStatus: 'censored' },
      { predictedGhost: 0.8, predictedSign: 0.1, terminalStatus: 'ghost' },
    ];
    const res = backtestPredictions(rows);
    expect(res.counts.total).toBe(4);
    expect(res.counts.ghost).toBe(2);
    expect(res.counts.sign).toBe(1);
    expect(res.counts.censored).toBe(1);
    expect(res.metrics.ghost.n).toBe(4);
    expect(res.metrics.sign.n).toBe(4);
  });

  it('includeCensored=false drops censored rows from both targets', () => {
    const rows: BacktestRow[] = [
      { predictedGhost: 0.9, predictedSign: 0.05, terminalStatus: 'ghost' },
      { predictedGhost: 0.2, predictedSign: 0.2, terminalStatus: 'censored' },
      { predictedGhost: 0.1, predictedSign: 0.85, terminalStatus: 'sign' },
    ];
    const res = backtestPredictions(rows, { includeCensored: false });
    expect(res.counts.total).toBe(2); // censored dropped
    expect(res.counts.censored).toBe(1); // still reported as observed
    expect(res.metrics.ghost.n).toBe(2);
  });

  it('auto-detects a 0–100 (display-scale) snapshot', () => {
    // Same truth, but probabilities stored on the 0–100 display scale.
    const rows: BacktestRow[] = [
      { predictedGhost: 90, predictedSign: 5, terminalStatus: 'ghost' },
      { predictedGhost: 10, predictedSign: 85, terminalStatus: 'sign' },
      { predictedGhost: 80, predictedSign: 8, terminalStatus: 'ghost' },
      { predictedGhost: 12, predictedSign: 70, terminalStatus: 'sign' },
    ];
    const res = backtestPredictions(rows);
    // Perfectly ordered → AUC 1 for both targets; metrics must be in [0,1].
    expect(res.metrics.ghost.auc).toBeCloseTo(1, 6);
    expect(res.metrics.sign.auc).toBeCloseTo(1, 6);
    expect(res.metrics.ghost.brier).toBeLessThanOrEqual(1);
  });

  it('empty input yields safe zeroed metrics', () => {
    const res = backtestPredictions([]);
    expect(res.counts.total).toBe(0);
    expect(res.metrics.ghost.n).toBe(0);
    expect(res.metrics.sign.auc).toBe(0.5);
  });
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
