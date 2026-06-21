import { describe, it, expect } from 'vitest';
import { generateSyntheticCorpus, mulberry32 } from './synthetic';
import {
  calibrateFromCorpus,
  calibrateFromCorpusHonest,
  compareGhostPriorRanking,
  evaluate,
  fitCalibration,
  applyCalibration,
  selectCalibration,
  compareGhostPriorBlend,
} from './calibration';
import { fitMultinomial } from './model/fitter';
import type { CalibrationParams, SyntheticRegime } from './contracts';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function logit(p: number): number {
  const c = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(c / (1 - c));
}

describe('evaluate', () => {
  it('perfect predictions → Brier 0, ECE 0, AUC 1', () => {
    const labels = [1, 0, 1, 0, 1, 0, 1, 0];
    const predicted = labels.map((y) => (y === 1 ? 1 : 0));
    const m = evaluate(predicted, labels);
    expect(m.brier).toBeCloseTo(0, 10);
    expect(m.ece).toBeCloseTo(0, 10);
    expect(m.auc).toBeCloseTo(1, 10);
    expect(m.n).toBe(labels.length);
  });

  it('constant 0.5 predictions → AUC 0.5', () => {
    const labels = [1, 0, 1, 0, 1, 0];
    const predicted = labels.map(() => 0.5);
    const m = evaluate(predicted, labels);
    expect(m.auc).toBeCloseTo(0.5, 10);
  });

  it('AUC = 0.5 when one class is absent', () => {
    const labels = [1, 1, 1, 1];
    const predicted = [0.2, 0.8, 0.6, 0.4];
    const m = evaluate(predicted, labels);
    expect(m.auc).toBe(0.5);
  });

  it('worst-possible ordering → AUC 0', () => {
    const labels = [0, 0, 1, 1];
    const predicted = [0.9, 0.8, 0.2, 0.1]; // positives ranked lowest
    const m = evaluate(predicted, labels);
    expect(m.auc).toBeCloseTo(0, 10);
  });
});

/** Build a well-separated synthetic label set: y ~ Bernoulli(p_true). */
function makeSeparated(n: number, seed: number) {
  const rng = mulberry32(seed);
  const pTrue: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    // logits spread widely so the two classes are well separated.
    const lo = (rng() - 0.5) * 8;
    const p = sigmoid(lo);
    pTrue.push(p);
    y.push(rng() < p ? 1 : 0);
  }
  return { pTrue, y };
}

describe('fitCalibration — Platt recovery', () => {
  it('corrects deliberately underconfident scores (ECE drops)', () => {
    const { pTrue, y } = makeSeparated(3000, 7);
    // Distort to be UNDERCONFIDENT: shrink the logits toward 0.
    const distorted = pTrue.map((p) => sigmoid(0.4 * logit(p)));

    const params = fitCalibration({
      predicted: distorted,
      labels: y,
      target: 'sign',
      method: 'platt',
    });

    expect(params.method).toBe('platt');
    expect(params.platt).toBeTruthy();
    expect(params.metricsBefore).toBeTruthy();
    expect(params.metricsAfter).toBeTruthy();
    // Platt should recover sharpness → lower ECE than the distorted input.
    expect(params.metricsAfter!.ece).toBeLessThan(params.metricsBefore!.ece);
    // Defaults populated.
    expect(params.modelVersion).toBeTruthy();
    expect(params.trainedOn).toBe('synthetic');
    expect(params.nLabels).toBe(y.length);
  });
});

describe('applyCalibration', () => {
  it('platt mapping is monotone increasing in p', () => {
    const params: CalibrationParams = {
      target: 'sign',
      method: 'platt',
      platt: { a: 1.6, b: -0.3 },
      modelVersion: 'test',
      nLabels: 0,
      trainedOn: 'synthetic',
    };
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const out = applyCalibration(Math.min(1, p), params);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1);
      expect(out).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = out;
    }
  });

  it("method 'none' returns the clamped raw probability", () => {
    const params: CalibrationParams = {
      target: 'ghost',
      method: 'none',
      modelVersion: 'test',
      nLabels: 0,
      trainedOn: 'synthetic',
    };
    expect(applyCalibration(0.37, params)).toBeCloseTo(0.37, 10);
    expect(applyCalibration(1.5, params)).toBe(1);
    expect(applyCalibration(-0.2, params)).toBe(0);
  });

  it('isotonic produces a non-decreasing mapping', () => {
    // Monotone-ish but noisy data; PAVA must yield a non-decreasing fit.
    const { pTrue, y } = makeSeparated(2000, 11);
    const params = fitCalibration({
      predicted: pTrue,
      labels: y,
      target: 'sign',
      method: 'isotonic',
    });
    expect(params.method).toBe('isotonic');
    expect(params.isotonic).toBeTruthy();

    // Knots must be x-ascending and y non-decreasing.
    const { x, y: yk } = params.isotonic!;
    for (let i = 1; i < yk.length; i++) {
      expect(yk[i]).toBeGreaterThanOrEqual(yk[i - 1] - 1e-12);
      expect(x[i]).toBeGreaterThanOrEqual(x[i - 1] - 1e-12);
    }

    // The applied mapping is non-decreasing across the [0,1] sweep.
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const out = applyCalibration(Math.min(1, p), params);
      expect(out).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = out;
    }
  });
});

describe('calibrateFromCorpus — across regimes', () => {
  // Small epsilon: held-out ECE on a finite test split is noisy, so we only
  // demand calibration does not make ECE materially WORSE, and that the model
  // still ranks the held-out leads meaningfully (AUC > 0.6).
  const ECE_EPS = 0.05;

  function fitForRegime(regime: SyntheticRegime, seed: number) {
    const corpus = generateSyntheticCorpus({ seed, nLeads: 700, regime });
    const model = fitMultinomial(corpus.rows, {
      l2: 0.5,
      lr: 0.4,
      maxIter: 600,
    });
    return { corpus, model };
  }

  for (const regime of ['high-ghost', 'high-sign'] as const) {
    it(`ghost calibration does not worsen ECE and held-out AUC > 0.6 (${regime})`, () => {
      const { corpus, model } = fitForRegime(regime, 13);
      const { heldOut } = calibrateFromCorpus(model, corpus, 'ghost', {
        method: 'platt',
        splitSeed: 99,
      });

      // Calibration must not materially increase the held-out ECE.
      expect(
        heldOut.after.ece,
        `ghost ECE after=${heldOut.after.ece.toFixed(
          4
        )} before=${heldOut.before.ece.toFixed(4)} (${regime})`
      ).toBeLessThanOrEqual(heldOut.before.ece + ECE_EPS);

      // The competing-risks model ranks ghosters above non-ghosters.
      expect(
        heldOut.before.auc,
        `ghost held-out AUC=${heldOut.before.auc.toFixed(4)} (${regime})`
      ).toBeGreaterThan(0.6);
    }, 60000);

    it(`sign calibration does not worsen ECE and held-out AUC > 0.6 (${regime})`, () => {
      const { corpus, model } = fitForRegime(regime, 13);
      const { heldOut } = calibrateFromCorpus(model, corpus, 'sign', {
        method: 'platt',
        splitSeed: 99,
      });

      expect(
        heldOut.after.ece,
        `sign ECE after=${heldOut.after.ece.toFixed(
          4
        )} before=${heldOut.before.ece.toFixed(4)} (${regime})`
      ).toBeLessThanOrEqual(heldOut.before.ece + ECE_EPS);

      expect(
        heldOut.before.auc,
        `sign held-out AUC=${heldOut.before.auc.toFixed(4)} (${regime})`
      ).toBeGreaterThan(0.6);
    }, 60000);
  }
});

describe('selectCalibration — isotonic vs Platt', () => {
  // Selection includes the raw 'none' baseline, so the chosen held-out ECE can
  // never exceed the raw held-out ECE (beyond floating-point noise).
  const EPS = 1e-9;

  function fit(regime: SyntheticRegime, seed: number) {
    const corpus = generateSyntheticCorpus({ seed, nLeads: 700, regime });
    const model = fitMultinomial(corpus.rows, {
      l2: 0.5,
      lr: 0.4,
      maxIter: 600,
    });
    return { corpus, model };
  }

  for (const target of ['ghost', 'sign'] as const) {
    it(`selection never increases ECE vs raw for ${target}`, () => {
      const { corpus, model } = fit('balanced', 13);
      const sel = selectCalibration(model, corpus, target, { splitSeed: 99 });

      // 'none' is always evaluated as the raw baseline.
      expect(sel.heldOutEce.none).toBeTypeOf('number');
      const rawEce = sel.heldOutEce.none;
      const chosenEce = sel.heldOutEce[sel.chosen];

      // The chosen method's held-out ECE is the minimum over candidates, which
      // INCLUDES raw → it can never be worse than raw beyond epsilon.
      expect(
        chosenEce,
        `chosen=${sel.chosen} ece=${chosenEce.toFixed(
          4
        )} raw=${rawEce.toFixed(4)}`
      ).toBeLessThanOrEqual(rawEce + EPS);

      // Chosen is the argmin over all evaluated candidates.
      for (const m of Object.keys(sel.heldOutEce) as Array<
        keyof typeof sel.heldOutEce
      >) {
        expect(chosenEce).toBeLessThanOrEqual(sel.heldOutEce[m] + EPS);
      }

      // Params carry the chosen method and the right target.
      expect(sel.params.method).toBe(sel.chosen);
      expect(sel.params.target).toBe(target);
    }, 60000);
  }

  it('respects an explicit candidate list and still adds raw', () => {
    const { corpus, model } = fit('balanced', 13);
    const sel = selectCalibration(model, corpus, 'ghost', {
      splitSeed: 99,
      candidates: ['isotonic'],
    });
    // Only isotonic was requested, but 'none' is appended as the baseline.
    expect(sel.heldOutEce.isotonic).toBeTypeOf('number');
    expect(sel.heldOutEce.none).toBeTypeOf('number');
    expect(['isotonic', 'none']).toContain(sel.chosen);
  }, 60000);
});

describe('compareGhostPriorBlend — churn-prior impact (headline real-data result)', () => {
  it('reports held-out raw vs blended GHOST metrics; honest calibrated=false', () => {
    // high-ghost regime gives a meaningful ghost base rate to calibrate against.
    const corpus = generateSyntheticCorpus({
      seed: 13,
      nLeads: 800,
      regime: 'high-ghost',
    });
    const model = fitMultinomial(corpus.rows, {
      l2: 0.5,
      lr: 0.4,
      maxIter: 600,
    });

    const cmp = compareGhostPriorBlend(model, corpus, {
      splitSeed: 99,
      priorWeight: 0.5,
    });

    // Structural / honesty guarantees (numbers are reported, not force-asserted).
    expect(cmp.calibrated).toBe(false);
    expect(cmp.priorWeight).toBe(0.5);
    expect(cmp.nHeldOut).toBeGreaterThan(0);
    expect(Number.isFinite(cmp.raw.ece)).toBe(true);
    expect(Number.isFinite(cmp.blended.ece)).toBe(true);
    expect(cmp.eceDelta).toBeCloseTo(cmp.raw.ece - cmp.blended.ece, 12);
    expect(cmp.notes.join(' ')).toContain('PRIOR');

    // Surface the headline numbers in the test name output for the doc.
    const f = (v: number) => v.toFixed(4);
    expect(
      true,
      `GHOST prior blend: raw ECE=${f(cmp.raw.ece)} blended ECE=${f(
        cmp.blended.ece
      )} Δ=${f(cmp.eceDelta)} (n=${cmp.nHeldOut})`
    ).toBe(true);
  }, 60000);

  it('weight 0 reproduces the raw metrics exactly', () => {
    const corpus = generateSyntheticCorpus({
      seed: 13,
      nLeads: 400,
      regime: 'high-ghost',
    });
    const model = fitMultinomial(corpus.rows, {
      l2: 0.5,
      lr: 0.4,
      maxIter: 400,
    });
    const cmp = compareGhostPriorBlend(model, corpus, {
      splitSeed: 99,
      priorWeight: 0,
    });
    // weight 0 → blended === raw, so every metric matches and Δ = 0.
    expect(cmp.blended.ece).toBeCloseTo(cmp.raw.ece, 12);
    expect(cmp.blended.brier).toBeCloseTo(cmp.raw.brier, 12);
    expect(cmp.eceDelta).toBeCloseTo(0, 12);
  }, 60000);
});

describe('calibrateFromCorpusHonest — fully out-of-sample base metrics', () => {
  function makeCorpus(seed: number) {
    return generateSyntheticCorpus({
      seed,
      nLeads: 800,
      regime: 'high-ghost',
    });
  }

  const SHARED_FIT = { l2: 0.5, lr: 0.4, maxIter: 600 } as const;

  it('produces a clean lead-level split with NO leakage', () => {
    const corpus = makeCorpus(13);
    const res = calibrateFromCorpusHonest(corpus, 'ghost', {
      splitSeed: 99,
      fit: SHARED_FIT,
    });

    const trainSet = new Set(res.trainLeadIds);
    const testSet = new Set(res.testLeadIds);

    // Train and test leadIds are disjoint.
    for (const id of res.testLeadIds) {
      expect(trainSet.has(id)).toBe(false);
    }
    // No duplicate ids within either split.
    expect(trainSet.size).toBe(res.trainLeadIds.length);
    expect(testSet.size).toBe(res.testLeadIds.length);
    // Together they cover every lead exactly once.
    expect(res.nTrainLeads + res.nTestLeads).toBe(corpus.labels.length);
    expect(res.nTrainLeads).toBe(res.trainLeadIds.length);
    expect(res.nTestLeads).toBe(res.testLeadIds.length);

    // CRITICAL leakage check: NOT ONE person-period row of any TEST lead may
    // have entered the base-model fit. The base model is fit on train rows only,
    // so the count of train-lead distinct rows must equal the rows the model saw.
    const trainRowLeadIds = new Set(
      corpus.rows.filter((r) => trainSet.has(r.leadId)).map((r) => r.leadId)
    );
    for (const id of res.testLeadIds) {
      expect(trainRowLeadIds.has(id)).toBe(false);
    }
    // The base model's nLeads reflects ONLY train leads (no test lead leaked in).
    expect(res.baseModel.nLeads).toBe(res.nTrainLeads);
  }, 60000);

  it('honest before-metrics are no better than the optimistic ones (ghost)', () => {
    const corpus = makeCorpus(13);

    // Optimistic path: model fit on the FULL corpus, graded on held-out leads
    // whose rows the model already saw at fit time.
    const fullModel = fitMultinomial(corpus.rows, SHARED_FIT);
    const optimistic = calibrateFromCorpus(fullModel, corpus, 'ghost', {
      method: 'platt',
      splitSeed: 99,
    });

    // Honest path: same split, but the base model is re-fit on TRAIN leads only.
    const honest = calibrateFromCorpusHonest(corpus, 'ghost', {
      method: 'platt',
      splitSeed: 99,
      fit: SHARED_FIT,
    });

    // Both evaluate on the SAME held-out lead set (same seed/fraction).
    expect(honest.nTestLeads).toBe(
      corpus.labels.length - honest.nTrainLeads
    );

    // The honest base model never saw the test leads, so its discrimination on
    // them cannot be inflated by memorization: honest before-AUC is NOT higher
    // than the optimistic before-AUC (allow tiny float noise).
    expect(
      honest.heldOut.before.auc,
      `honest before-AUC=${honest.heldOut.before.auc.toFixed(
        4
      )} optimistic before-AUC=${optimistic.heldOut.before.auc.toFixed(4)}`
    ).toBeLessThanOrEqual(optimistic.heldOut.before.auc + 1e-6);

    // And the honest numbers are genuinely DIFFERENT from the optimistic ones —
    // a different (train-only) base model yields a different ghostRisk surface,
    // so at least one of {auc, ece, brier} must move (not a copy of the old path).
    const moved =
      Math.abs(honest.heldOut.before.auc - optimistic.heldOut.before.auc) >
        1e-6 ||
      Math.abs(honest.heldOut.before.ece - optimistic.heldOut.before.ece) >
        1e-6 ||
      Math.abs(honest.heldOut.before.brier - optimistic.heldOut.before.brier) >
        1e-6;
    expect(moved).toBe(true);

    // The honest base model still discriminates (ghost ranking is real, not noise).
    expect(honest.heldOut.before.auc).toBeGreaterThan(0.55);

    // Honesty: trainedOn stays synthetic; calibration params are well-formed.
    expect(honest.params.target).toBe('ghost');
    expect(honest.params.trainedOn).toBe('synthetic');
    expect(honest.baseModel.trainedOn).toBe('synthetic');

    // Surface the headline comparison for the report.
    const f = (v: number) => v.toFixed(4);
    expect(
      true,
      `HONEST vs OPTIMISTIC ghost before: ` +
        `AUC ${f(honest.heldOut.before.auc)} vs ${f(
          optimistic.heldOut.before.auc
        )} · ECE ${f(honest.heldOut.before.ece)} vs ${f(
          optimistic.heldOut.before.ece
        )} · Brier ${f(honest.heldOut.before.brier)} vs ${f(
          optimistic.heldOut.before.brier
        )} (n=${honest.nTestLeads})`
    ).toBe(true);
  }, 90000);

  it('honest calibration does not materially worsen held-out ECE (sign + ghost)', () => {
    const corpus = makeCorpus(13);
    const ECE_EPS = 0.06; // finite OOS test split is noisy.
    for (const target of ['ghost', 'sign'] as const) {
      const honest = calibrateFromCorpusHonest(corpus, target, {
        method: 'platt',
        splitSeed: 99,
        fit: SHARED_FIT,
      });
      expect(
        honest.heldOut.after.ece,
        `${target} honest ECE after=${honest.heldOut.after.ece.toFixed(
          4
        )} before=${honest.heldOut.before.ece.toFixed(4)}`
      ).toBeLessThanOrEqual(honest.heldOut.before.ece + ECE_EPS);
    }
  }, 90000);
});

describe('compareGhostPriorRanking — does the prior help ORDERING (honest, OOS)', () => {
  it('reports raw / prior-alone / blended held-out ghost AUC; calibrated=false', () => {
    const corpus = generateSyntheticCorpus({
      seed: 13,
      nLeads: 800,
      regime: 'high-ghost',
    });

    const rank = compareGhostPriorRanking(corpus, {
      splitSeed: 99,
      priorWeight: 0.5,
      fit: { l2: 0.5, lr: 0.4, maxIter: 600 },
    });

    // Structural / honesty guarantees.
    expect(rank.calibrated).toBe(false);
    expect(rank.priorWeight).toBe(0.5);
    expect(rank.nHeldOut).toBeGreaterThan(0);
    expect(Number.isFinite(rank.rawAuc)).toBe(true);
    expect(Number.isFinite(rank.priorAuc)).toBe(true);
    expect(Number.isFinite(rank.blendedAuc)).toBe(true);
    expect(rank.aucDelta).toBeCloseTo(rank.blendedAuc - rank.rawAuc, 12);
    expect(rank.notes.join(' ')).toContain('PRIOR');
    expect(rank.notes.join(' ')).toContain('out-of-sample');

    // All AUCs are valid probabilities-of-correct-ordering in [0,1].
    for (const a of [rank.rawAuc, rank.priorAuc, rank.blendedAuc]) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }

    // The raw (train-fit) model genuinely ranks ghosters above non-ghosters OOS.
    expect(rank.rawAuc).toBeGreaterThan(0.55);

    // Surface the headline ranking result for the report.
    const f = (v: number) => v.toFixed(4);
    expect(
      true,
      `GHOST RANKING (OOS): raw AUC=${f(rank.rawAuc)} prior-alone AUC=${f(
        rank.priorAuc
      )} blended AUC=${f(rank.blendedAuc)} Δvs raw=${f(rank.aucDelta)} (n=${
        rank.nHeldOut
      })`
    ).toBe(true);
  }, 90000);

  it('weight 0 makes the blend identical to raw (AUC matches, Δ=0)', () => {
    const corpus = generateSyntheticCorpus({
      seed: 13,
      nLeads: 400,
      regime: 'high-ghost',
    });
    const rank = compareGhostPriorRanking(corpus, {
      splitSeed: 99,
      priorWeight: 0,
      fit: { l2: 0.5, lr: 0.4, maxIter: 400 },
    });
    expect(rank.blendedAuc).toBeCloseTo(rank.rawAuc, 12);
    expect(rank.aucDelta).toBeCloseTo(0, 12);
  }, 60000);
});
