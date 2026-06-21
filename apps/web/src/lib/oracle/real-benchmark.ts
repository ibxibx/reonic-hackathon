/**
 * REAL-LABELED-DATA BENCHMARK — cross-domain validation of the Oracle machinery.
 *
 * WHAT THIS IS: a proof that the SAME fitter (fitMultinomial) + metrics/calibration
 * (evaluate / fitCalibration) that power the live Oracle actually learn signal from
 * a REAL labeled dataset — not just from the synthetic corpus they were tuned on.
 *
 * WHAT THE DATA IS (HONESTY — read this before citing any number):
 *   • The fixture is IBM's "Telco Customer Churn" sample (real, labeled telecom
 *     subscription churn — fictional-but-realistic customers, 7,043 full / 3,000
 *     sampled here). Each customer has a 0/1 churn label and 16 tabular features.
 *   • This is an ADJACENT domain (telecom subscription churn), used here purely as
 *     a cross-domain BENCHMARK of the modeling machinery. It is NOT solar lead data,
 *     it is NEVER used to score a real solar lead, and it does NOT flip the live
 *     `calibrated` flag anywhere. `churn ≈ ghost` is an explicit cross-domain analogy
 *     ("the customer stopped engaging"), not a claim that telco churn == solar ghost.
 *   • Therefore every metric returned here is labeled `domain:'telecom-churn'` and
 *     `calibrated:false` and must be reported as a REAL cross-domain proxy benchmark,
 *     never as a solar outcome.
 *
 * HOW IT REUSES THE EXACT GHOST MACHINERY:
 *   Each telco customer becomes one independent PersonPeriodRow with classes
 *   ["stay","ghost"]: churn=1 → outcome "ghost", churn=0 → outcome "stay". Then
 *   predictProbabilities(model, x).ghost IS the predicted churn probability — the
 *   identical code path the live engine uses for ghostRisk per period.
 *
 * NO LEAKAGE: each customer is one independent row (t=0), so a simple seeded split
 * BY ROW already keeps train and test customers fully disjoint — there are no
 * multi-period rows per subject to leak.
 *
 * PURITY: deterministic. The split is a seeded mulberry32 Fisher–Yates shuffle; the
 * fitter is deterministic; no Date.now / Math.random.
 */
import fx from './fixtures/telco-churn-sample.json';
import { fitMultinomial, predictProbabilities } from './model/fitter';
import { evaluate, fitCalibration, applyCalibration } from './calibration';
import { mulberry32 } from './synthetic';
import type { EvalMetrics, PersonPeriodRow } from './contracts';

/** Shape of the bundled real-churn fixture (resolveJsonModule is ON). */
interface ChurnFixture {
  source: string;
  note: string;
  license: string;
  seed: number;
  n: number;
  fullN: number;
  churnRate: number;
  featureNames: string[];
  rows: number[][];
  labels: number[];
}

const FIXTURE = fx as ChurnFixture;

export interface BenchmarkRealChurnOptions {
  /** seed for the deterministic train/test split (mulberry32). default 7. */
  splitSeed?: number;
  /** fraction of customers held out for the test split. default 0.3. */
  testFraction?: number;
  /** L2 penalty for the fitter (passed straight to fitMultinomial). default 1.0. */
  l2?: number;
}

export interface BenchmarkRealChurnResult {
  /** held-out AUC of predicted churn (p.ghost) vs the 0/1 churn label. */
  auc: number;
  /** held-out Expected Calibration Error of the RAW model probabilities. */
  ece: number;
  /** held-out Brier score of the RAW model probabilities. */
  brier: number;
  /** number of held-out customers scored. */
  n: number;
  /** observed churn base rate of the FULL fixture (~0.257). */
  churnRate: number;
  /** held-out ECE/Brier AFTER a Platt recalibration pass fit on the held-out set. */
  calibratedAfter: { ece: number; brier: number };
  /** full held-out metrics object (RAW), for charts/debugging. */
  metricsRaw: EvalMetrics;
  /** full held-out metrics object after Platt, for charts/debugging. */
  metricsCalibrated: EvalMetrics;
  // ── provenance / honesty (mirrored into the returned object on purpose) ──
  /** ALWAYS 'telecom-churn'. This is a cross-domain proxy, NOT solar. */
  domain: 'telecom-churn';
  /** ALWAYS false. A real-telco benchmark never flips the live solar calibrated flag. */
  calibrated: false;
  source: string;
  notes: string[];
}

/**
 * Map the real telco churn fixture onto the Oracle's ghost machinery and report
 * held-out AUC / ECE / Brier of predicted churn (p.ghost) vs the real label.
 *
 * Pipeline (all deterministic for a fixed seed):
 *   1. customer i → PersonPeriodRow { leadId:"telco-"+i, t:0,
 *      outcome: label===1 ? "ghost" : "stay", x: rows[i], synthetic:false }.
 *   2. seeded mulberry32 shuffle of row indices → disjoint train/test split.
 *   3. fitMultinomial(train, { classes:["stay","ghost"], featureNames, l2 }).
 *   4. predict p.ghost on the held-out test → evaluate() vs labels (RAW metrics).
 *   5. Platt pass: fitCalibration(testPred, testLabels) → re-evaluate (after metrics).
 *
 * Honesty: REAL telecom churn, an adjacent-domain benchmark of the machinery.
 * NOT solar outcomes; returns calibrated:false and never touches the live flag.
 */
export function benchmarkRealChurn(
  opts?: BenchmarkRealChurnOptions
): BenchmarkRealChurnResult {
  const splitSeed = opts?.splitSeed ?? 7;
  const testFraction = clampFraction(opts?.testFraction ?? 0.3);
  const l2 = opts?.l2 ?? 1.0;

  const featureNames = FIXTURE.featureNames;
  const labels = FIXTURE.labels;
  const rows = FIXTURE.rows;
  const nAll = Math.min(rows.length, labels.length);

  // 1. Each REAL customer → one independent person-period row (t=0). churn=1
  //    maps to "ghost" so predictProbabilities(...).ghost == predicted churn.
  const allRows: PersonPeriodRow[] = [];
  for (let i = 0; i < nAll; i++) {
    allRows.push({
      leadId: `telco-${i}`,
      t: 0,
      outcome: labels[i] === 1 ? 'ghost' : 'stay',
      x: rows[i],
      synthetic: false, // REAL labels (telecom domain), not generated data
    });
  }

  // 2. Seeded Fisher–Yates shuffle of ROW indices → disjoint train/test. One row
  //    per customer means a by-row split has zero cross-subject leakage.
  const order = Array.from({ length: nAll }, (_, i) => i);
  const rng = mulberry32(splitSeed);
  for (let i = nAll - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const nTest = Math.max(1, Math.min(nAll - 1, Math.floor(nAll * testFraction)));
  const testIdx = order.slice(0, nTest);
  const trainIdx = order.slice(nTest);

  const trainRows = trainIdx.map((i) => allRows[i]);
  const testRows = testIdx.map((i) => allRows[i]);

  // 3. Fit the SAME multinomial fitter the live engine uses, classes ["stay","ghost"].
  const model = fitMultinomial(trainRows, {
    classes: ['stay', 'ghost'],
    featureNames,
    l2,
    trainedOn: 'real', // honest: these ARE real (telecom) labels, not synthetic
  });

  // 4. Predict p.ghost (= churn probability) on the held-out customers.
  const testPred: number[] = [];
  const testY: number[] = [];
  for (let k = 0; k < testRows.length; k++) {
    const row = testRows[k];
    const p = predictProbabilities(model, row.x).ghost;
    testPred.push(p);
    testY.push(row.outcome === 'ghost' ? 1 : 0);
  }

  const metricsRaw = evaluate(testPred, testY);

  // 5. Platt recalibration pass on the held-out predictions vs labels. fitCalibration
  //    reports before/after on the same set, so calibratedAfter never collapses ECE
  //    beyond a tiny epsilon (Platt is a 1-D logistic; it cannot wildly worsen ECE).
  const platt = fitCalibration({
    predicted: testPred,
    labels: testY,
    target: 'ghost',
    method: 'platt',
    modelVersion: model.modelVersion,
    nLabels: testY.length,
    trainedOn: 'real',
  });
  const calibratedPred = testPred.map((p) => applyCalibration(p, platt));
  const metricsCalibrated = evaluate(calibratedPred, testY);

  // Observed base rate on the FULL fixture (the headline churn rate, ~0.257).
  let churnSum = 0;
  for (let i = 0; i < nAll; i++) churnSum += labels[i] === 1 ? 1 : 0;
  const churnRate = nAll > 0 ? churnSum / nAll : 0;

  const fmt = (v: number): string => v.toFixed(4);
  const notes: string[] = [
    `REAL telecom-churn benchmark (cross-domain proxy, NOT solar): held-out n=${testRows.length}.`,
    `held-out AUC=${fmt(metricsRaw.auc)}, ECE=${fmt(metricsRaw.ece)}, Brier=${fmt(
      metricsRaw.brier
    )}.`,
    `Platt: ECE ${fmt(metricsRaw.ece)} → ${fmt(
      metricsCalibrated.ece
    )}, Brier ${fmt(metricsRaw.brier)} → ${fmt(metricsCalibrated.brier)}.`,
    `full-fixture churn base rate=${fmt(churnRate)}.`,
    'This validates the Oracle fitter+calibration machinery on REAL labeled data ' +
      'from an ADJACENT domain (telecom subscription churn). It does NOT measure ' +
      'solar outcomes and does NOT flip the live calibrated flag (calibrated=false).',
  ];

  return {
    auc: metricsRaw.auc,
    ece: metricsRaw.ece,
    brier: metricsRaw.brier,
    n: testRows.length,
    churnRate,
    calibratedAfter: {
      ece: metricsCalibrated.ece,
      brier: metricsCalibrated.brier,
    },
    metricsRaw,
    metricsCalibrated,
    domain: 'telecom-churn',
    calibrated: false,
    source: FIXTURE.source,
    notes,
  };
}

function clampFraction(v: number): number {
  if (!Number.isFinite(v)) return 0.3;
  if (v < 0.05) return 0.05;
  if (v > 0.95) return 0.95;
  return v;
}
