import { describe, it, expect } from 'vitest';
import { fitMultinomial } from './model/fitter';
import { generateSyntheticCorpus } from './synthetic';
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
  });
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
  });
});
