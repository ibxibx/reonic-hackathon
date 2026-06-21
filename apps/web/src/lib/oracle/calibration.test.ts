import { describe, it, expect } from 'vitest';
import { mulberry32 } from './synthetic';
import {
  evaluate,
  fitCalibration,
  applyCalibration,
} from './calibration';
import type { CalibrationParams } from './contracts';

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
