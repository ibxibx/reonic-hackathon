/**
 * REPRODUCIBLE EVAL AGGREGATOR — one call, all the headline Oracle numbers.
 *
 * WHAT THIS IS: a single deterministic entry point that regenerates every number
 * quoted in ORACLE_EVAL.md from the SAME code paths the live engine uses. It
 * aggregates three independently-built sections into one typed object:
 *
 *   1. SYNTHETIC eval — fit the real fitter on a balanced synthetic corpus and
 *      run the real `runEvalReport` (golden-direction checks + held-out
 *      calibration metrics). Provenance: SYNTHETIC (generated in-process).
 *   2. REAL cross-domain benchmark — `benchmarkRealChurn` on the bundled IBM
 *      Telco Customer Churn fixture (REAL labels, ADJACENT telecom domain).
 *      Provenance: REAL but cross-domain — NOT solar, never flips `calibrated`.
 *   3. HONEST prior-ranking finding — `compareGhostPriorRanking`: does the cited
 *      churn PRIOR improve held-out GHOST ordering against a TRAIN-fit synthetic
 *      model? The honest answer is "no on synthetic" (cold-start aid only).
 *      Provenance: SYNTHETIC eval of an external/proxy prior.
 *
 * HONESTY (read before citing any number):
 *   • Section 1 is SYNTHETIC. The synthetic model is NOT trained on real solar
 *     outcomes; `calibrated` stays false in the live app until real solar labels
 *     exist. Every section here carries an explicit `provenance` label.
 *   • Section 2 is REAL labeled data, but TELECOM churn used as a cross-domain
 *     proxy for the modeling machinery. It is NEVER labeled a solar outcome and
 *     never flips the live `calibrated` flag (it returns calibrated:false).
 *   • Section 3 is a deliberately un-spun negative result: the literature prior
 *     does not improve ranking against a fitted synthetic model — it is a
 *     cold-start grounding aid, which is exactly how the engine uses it.
 *
 * PURITY: deterministic. It fits models in-process from fixed seeds; there is no
 * DB access, no Date.now, no Math.random — every shuffle/split is a seeded
 * mulberry32 (via the underlying eval/calibration/benchmark helpers). Calling it
 * twice with the same options yields byte-identical numbers.
 */
import { MODEL_VERSION } from './contracts';
import type { EvalReport } from './eval';
import { runEvalReport } from './eval';
import { benchmarkRealChurn } from './real-benchmark';
import type { BenchmarkRealChurnResult } from './real-benchmark';
import { compareGhostPriorRanking } from './calibration';
import type { GhostPriorRankingComparison } from './calibration';
import { generateSyntheticCorpus } from './synthetic';
import { fitMultinomial } from './model/fitter';

/** Provenance tag attached to every section so synthetic ≠ real is unambiguous. */
export type ReportProvenance = 'synthetic' | 'real-cross-domain';

/** The seeds / hyperparameters that make every number below reproducible. */
export interface OracleEvalSeeds {
  /** seed for the synthetic corpus generator. */
  syntheticCorpus: number;
  /** number of leads in the synthetic corpus. */
  syntheticLeads: number;
  /** seed for the lead-level calibration / held-out split. */
  syntheticSplit: number;
  /** seed for the real-benchmark by-row train/test split. */
  realBenchmarkSplit: number;
  /** seed for the prior-ranking held-out split. */
  priorRankingSplit: number;
}

/** Section 1 — SYNTHETIC eval (golden directions + held-out calibration). */
export interface SyntheticEvalSection {
  provenance: 'synthetic';
  /** the underlying EvalReport (metrics.sign / metrics.ghost, golden[], notes). */
  report: EvalReport;
  /** convenience: did EVERY golden direction hold? */
  allGoldenPassed: boolean;
  /** headline held-out AUC per target (post-Platt held-out split). */
  signAuc: number;
  ghostAuc: number;
  label: string;
}

/** Section 2 — REAL labeled cross-domain benchmark (telecom churn). */
export interface RealBenchmarkSection {
  provenance: 'real-cross-domain';
  /** the full benchmarkRealChurn result (auc/ece/brier/n/domain/calibrated…). */
  result: BenchmarkRealChurnResult;
  label: string;
}

/** Section 3 — HONEST prior-ranking finding (does the prior help ordering?). */
export interface PriorRankingSection {
  /** the prior is evaluated on a SYNTHETIC held-out split of a fitted model. */
  provenance: 'synthetic';
  result: GhostPriorRankingComparison;
  /** convenience: did blending the prior IMPROVE held-out ghost ordering? */
  priorHelpsRanking: boolean;
  label: string;
}

/** The single aggregated, typed, reproducible Oracle eval report. */
export interface OracleEvalReport {
  modelVersion: string;
  seeds: OracleEvalSeeds;
  syntheticEval: SyntheticEvalSection;
  realBenchmark: RealBenchmarkSection;
  priorRanking: PriorRankingSection;
  /** flat, human-readable headline lines (synthetic vs real clearly marked). */
  headline: string[];
  notes: string[];
}

export interface BuildOracleEvalReportOptions {
  /** synthetic corpus seed (default 7 — matches ORACLE_EVAL.md). */
  syntheticSeed?: number;
  /** synthetic corpus size (default 600). */
  syntheticLeads?: number;
  /** lead-level calibration split seed (default 1234 — calibration default). */
  syntheticSplitSeed?: number;
  /** real-benchmark by-row split seed (default 7 — benchmark default). */
  realBenchmarkSplitSeed?: number;
  /** prior-ranking held-out split seed (default 1234). */
  priorRankingSplitSeed?: number;
  /** prior pull for the ranking blend (default 0.5). */
  priorWeight?: number;
}

const DEFAULTS = {
  syntheticSeed: 7,
  syntheticLeads: 600,
  syntheticSplitSeed: 1234,
  realBenchmarkSplitSeed: 7,
  priorRankingSplitSeed: 1234,
  priorWeight: 0.5,
} as const;

/**
 * Fit hyperparameters for the synthetic base model. These mirror the lane's
 * established eval fit ({l2:0.5, lr:0.4, maxIter:600}) so the aggregated numbers
 * match the standalone eval suite and ORACLE_EVAL.md.
 */
const SYNTHETIC_FIT = { l2: 0.5, lr: 0.4, maxIter: 600 } as const;

const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : 'NaN');
const pct = (v: number): string =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'NaN';

/**
 * Build the full reproducible Oracle eval report in one deterministic call.
 *
 * Aggregates the synthetic eval, the real cross-domain benchmark, and the honest
 * prior-ranking finding into one typed object. Pure-ish: fits models in-process
 * from fixed seeds (no DB, no Date.now / Math.random). Same options → byte-
 * identical numbers.
 */
export function buildOracleEvalReport(
  opts?: BuildOracleEvalReportOptions
): OracleEvalReport {
  const syntheticSeed = opts?.syntheticSeed ?? DEFAULTS.syntheticSeed;
  const syntheticLeads = opts?.syntheticLeads ?? DEFAULTS.syntheticLeads;
  const syntheticSplitSeed =
    opts?.syntheticSplitSeed ?? DEFAULTS.syntheticSplitSeed;
  const realBenchmarkSplitSeed =
    opts?.realBenchmarkSplitSeed ?? DEFAULTS.realBenchmarkSplitSeed;
  const priorRankingSplitSeed =
    opts?.priorRankingSplitSeed ?? DEFAULTS.priorRankingSplitSeed;
  const priorWeight = opts?.priorWeight ?? DEFAULTS.priorWeight;

  const seeds: OracleEvalSeeds = {
    syntheticCorpus: syntheticSeed,
    syntheticLeads,
    syntheticSplit: syntheticSplitSeed,
    realBenchmarkSplit: realBenchmarkSplitSeed,
    priorRankingSplit: priorRankingSplitSeed,
  };

  // ── Section 1: SYNTHETIC eval (golden directions + held-out calibration) ──
  // Balanced corpus → the regime where both sign and ghost have meaningful mass.
  const corpus = generateSyntheticCorpus({
    seed: syntheticSeed,
    nLeads: syntheticLeads,
    regime: 'balanced',
  });
  const model = fitMultinomial(corpus.rows, {
    ...SYNTHETIC_FIT,
    modelVersion: MODEL_VERSION,
    trainedOn: 'synthetic',
  });
  const evalReport = runEvalReport(model, corpus);
  const allGoldenPassed = evalReport.golden.every((g) => g.passed);

  const syntheticEval: SyntheticEvalSection = {
    provenance: 'synthetic',
    report: evalReport,
    allGoldenPassed,
    signAuc: evalReport.metrics.sign.auc,
    ghostAuc: evalReport.metrics.ghost.auc,
    label:
      'SYNTHETIC corpus (generated in-process; NOT real solar outcomes). ' +
      'Held-out lead-level split, Platt-recalibrated. calibrated stays false.',
  };

  // ── Section 2: REAL labeled cross-domain benchmark (telecom churn) ──
  const benchmark = benchmarkRealChurn({ splitSeed: realBenchmarkSplitSeed });
  const realBenchmark: RealBenchmarkSection = {
    provenance: 'real-cross-domain',
    result: benchmark,
    label:
      'REAL labeled data — IBM Telco Customer Churn (ADJACENT telecom domain ' +
      'used as a cross-domain proxy for the machinery). NOT solar; ' +
      'domain=telecom-churn, calibrated=false (never flips the live solar flag).',
  };

  // ── Section 3: HONEST prior-ranking finding (out-of-sample, TRAIN-fit) ──
  const ranking = compareGhostPriorRanking(corpus, {
    splitSeed: priorRankingSplitSeed,
    priorWeight,
  });
  const priorRanking: PriorRankingSection = {
    provenance: 'synthetic',
    result: ranking,
    priorHelpsRanking: ranking.aucDelta > 0,
    label:
      'SYNTHETIC held-out RANKING of the cited churn PRIOR vs a TRAIN-fit ' +
      'synthetic model. Honest negative: the external prior is a COLD-START ' +
      'grounding aid, not a synthetic-model improver. calibrated=false.',
  };

  // ── Flat headline lines (synthetic vs real explicitly marked everywhere) ──
  const headline: string[] = [
    `model_version=${MODEL_VERSION}`,
    `[SYNTHETIC] golden directions: ${
      allGoldenPassed ? 'ALL PASS' : 'FAIL'
    } (${evalReport.golden.length} checks).`,
    `[SYNTHETIC] held-out AUC: sign=${fmt(syntheticEval.signAuc)} ghost=${fmt(
      syntheticEval.ghostAuc
    )}; held-out ECE(after Platt): sign=${fmt(
      evalReport.metrics.sign.ece
    )} ghost=${fmt(evalReport.metrics.ghost.ece)}.`,
    `[REAL cross-domain · telecom churn, NOT solar] held-out AUC=${fmt(
      benchmark.auc
    )} ECE=${fmt(benchmark.ece)} Brier=${fmt(benchmark.brier)} (n=${
      benchmark.n
    }, base rate=${pct(benchmark.churnRate)}); calibrated=${benchmark.calibrated}.`,
    `[SYNTHETIC honest finding] prior-alone ghost AUC=${fmt(
      ranking.priorAuc
    )}, raw model AUC=${fmt(ranking.rawAuc)}, blended AUC=${fmt(
      ranking.blendedAuc
    )} (Δvs raw=${fmt(ranking.aucDelta)} → prior ${
      priorRanking.priorHelpsRanking ? 'helps' : 'does NOT help'
    } ordering on synthetic; cold-start aid only).`,
  ];

  const notes: string[] = [
    'Reproducible: one deterministic call regenerates all three sections from ' +
      'fixed seeds (no DB, no Date.now / Math.random).',
    `seeds: syntheticCorpus=${syntheticSeed} (n=${syntheticLeads}), ` +
      `syntheticSplit=${syntheticSplitSeed}, realBenchmarkSplit=${realBenchmarkSplitSeed}, ` +
      `priorRankingSplit=${priorRankingSplitSeed}, priorWeight=${priorWeight}.`,
    'Provenance is labeled on EVERY section: synthetic (sections 1 & 3) vs ' +
      'real-cross-domain telecom churn (section 2). No section claims solar outcomes.',
    ...evalReport.notes.map((n) => `[synthetic] ${n}`),
    ...benchmark.notes.map((n) => `[real-cross-domain] ${n}`),
    ...ranking.notes.map((n) => `[synthetic-prior] ${n}`),
  ];

  return {
    modelVersion: MODEL_VERSION,
    seeds,
    syntheticEval,
    realBenchmark,
    priorRanking,
    headline,
    notes,
  };
}
