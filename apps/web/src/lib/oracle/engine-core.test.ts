import { describe, it, expect } from 'vitest';
import {
  decideMode,
  confidenceBand,
  assembleRichPrediction,
  computeModelNumbersAndFactors,
} from './engine-core';
import { fitMultinomial } from './model/fitter';
import { generateSyntheticCorpus } from './synthetic';
import {
  FEATURE_NAMES,
  FEATURE_COUNT,
  MODEL_VERSION,
  BLOCKER_CODES,
} from './contracts';
import type {
  OracleLlmOutput,
  OracleFactor,
  BlockerCode,
} from './contracts';

const IDX = (name: string) => FEATURE_NAMES.indexOf(name as never);

// ── decideMode ──────────────────────────────────────────────────────────────
describe('decideMode', () => {
  it('returns model whenever a usable model is in hand (regardless of labels)', () => {
    expect(decideMode(0, true)).toBe('model');
    expect(decideMode(5, true)).toBe('model');
    expect(decideMode(1000, true)).toBe('model');
  });
  it('returns degraded when no model is available', () => {
    expect(decideMode(0, false)).toBe('degraded');
    expect(decideMode(1000, false)).toBe('degraded');
  });
});

// ── confidenceBand ──────────────────────────────────────────────────────────
describe('confidenceBand', () => {
  it('uses ±8 for a calibrated model', () => {
    const b = confidenceBand(50, 'model', true);
    expect(b.low).toBe(42);
    expect(b.high).toBe(58);
    expect(b.width).toBe(16);
  });

  it('uses ±15 for an uncalibrated model', () => {
    const b = confidenceBand(50, 'model', false);
    expect(b.low).toBe(35);
    expect(b.high).toBe(65);
    expect(b.width).toBe(30);
  });

  it('uses ±22 for degraded mode', () => {
    const b = confidenceBand(50, 'degraded', false);
    expect(b.low).toBe(28);
    expect(b.high).toBe(72);
    expect(b.width).toBe(44);
  });

  it('clamps the low edge at 0', () => {
    const b = confidenceBand(5, 'degraded', false); // 5 - 22 = -17 → 0
    expect(b.low).toBe(0);
    expect(b.high).toBe(27);
    expect(b.width).toBe(27);
  });

  it('clamps the high edge at 100', () => {
    const b = confidenceBand(95, 'degraded', false); // 95 + 22 = 117 → 100
    expect(b.high).toBe(100);
    expect(b.low).toBe(73);
    expect(b.width).toBe(27);
  });

  it('clamps both edges at the extremes (0 and 100)', () => {
    expect(confidenceBand(0, 'model', false).low).toBe(0);
    expect(confidenceBand(100, 'model', false).high).toBe(100);
  });
});

// ── assembleRichPrediction — MODEL mode ─────────────────────────────────────
const fakeModelNumbers = {
  signProbability: 62,
  ghostRisk: 28,
  factors: [
    {
      feature: 'monthlySavingsRatio',
      direction: 'increases' as const,
      weight: 0.9,
      target: 'sign' as const,
      plainText: 'Strong savings increase sign likelihood',
    },
    {
      feature: 'daysSinceLastTouch',
      direction: 'increases' as const,
      weight: 0.5,
      target: 'ghost' as const,
      plainText: 'Going quiet increases ghost likelihood',
    },
  ] satisfies OracleFactor[],
};

const fakeLlm: OracleLlmOutput = {
  signProbability: 10, // should be IGNORED in model mode
  ghostRisk: 90, // should be IGNORED in model mode
  signConfidence: 50,
  ghostConfidence: 50,
  blockerCode: 'P',
  factors: [],
  recommendedAction: 'Call them tomorrow about payback.',
  evidence: 'Strong economics but slow to respond.',
};

describe('assembleRichPrediction — MODEL mode', () => {
  const rich = assembleRichPrediction({
    leadId: 'lead-1',
    mode: 'model',
    calibrated: false,
    modelVersion: MODEL_VERSION,
    horizonDays: 14,
    modelNumbers: fakeModelNumbers,
    llm: fakeLlm,
  });

  it('takes numbers from the model, not the LLM', () => {
    expect(rich.signProbability).toBe(62);
    expect(rich.ghostRisk).toBe(28);
  });

  it('carries the model factors', () => {
    expect(rich.factors).toHaveLength(2);
    expect(rich.factors[0].feature).toBe('monthlySavingsRatio');
  });

  it('takes blockerCode / action / evidence from the LLM', () => {
    expect(rich.blockerCode).toBe('P');
    expect(rich.recommendedAction).toBe('Call them tomorrow about payback.');
    expect(rich.evidence).toBe('Strong economics but slow to respond.');
  });

  it('produces valid uncalibrated-model bands (±15)', () => {
    expect(rich.signConfidence.width).toBe(30);
    expect(rich.ghostConfidence.low).toBe(13); // 28 - 15
    expect(rich.mode).toBe('model');
    expect(rich.calibrated).toBe(false);
    expect(rich.modelVersion).toBe(MODEL_VERSION);
    expect(rich.horizonDays).toBe(14);
  });
});

describe('assembleRichPrediction — MODEL mode, no LLM (deterministic fallback)', () => {
  const rich = assembleRichPrediction({
    leadId: 'lead-2',
    mode: 'model',
    calibrated: false,
    modelVersion: MODEL_VERSION,
    horizonDays: 14,
    modelNumbers: {
      signProbability: 30,
      ghostRisk: 70,
      factors: [
        {
          feature: 'daysSinceLastTouch',
          direction: 'increases',
          weight: 0.8,
          target: 'ghost',
          plainText: 'Going quiet increases ghost likelihood',
        },
      ],
    },
    llm: null,
  });

  it('still uses model numbers and derives a blocker deterministically', () => {
    expect(rich.signProbability).toBe(30);
    expect(rich.ghostRisk).toBe(70);
    // ghost-dominant + daysSinceLastTouch → Timing
    expect(rich.blockerCode).toBe('Ti');
    expect(rich.recommendedAction.length).toBeGreaterThan(0);
    expect(rich.evidence.length).toBeGreaterThan(0);
  });
});

// ── assembleRichPrediction — DEGRADED mode ──────────────────────────────────
describe('assembleRichPrediction — DEGRADED mode, llm=null', () => {
  const rich = assembleRichPrediction({
    leadId: 'lead-3',
    mode: 'degraded',
    calibrated: false,
    modelVersion: MODEL_VERSION,
    horizonDays: 14,
    modelNumbers: null,
    llm: null,
  });

  it('falls back to neutral 45/45 numbers', () => {
    expect(rich.signProbability).toBe(45);
    expect(rich.ghostRisk).toBe(45);
  });

  it('is degraded + uncalibrated with valid wide bands (±22)', () => {
    expect(rich.mode).toBe('degraded');
    expect(rich.calibrated).toBe(false);
    expect(rich.signConfidence.width).toBe(44);
    expect(rich.ghostConfidence.low).toBe(23);
    expect(rich.ghostConfidence.high).toBe(67);
  });

  it('has empty factors and a non-empty blocker/action/evidence', () => {
    expect(rich.factors).toEqual([]);
    expect(rich.blockerCode).toBe('OK'); // no factors → OK
    expect(rich.recommendedAction.length).toBeGreaterThan(0);
    expect(rich.evidence.length).toBeGreaterThan(0);
  });
});

describe('assembleRichPrediction — DEGRADED mode, llm present (factor mapping)', () => {
  const llm: OracleLlmOutput = {
    signProbability: 33,
    ghostRisk: 71,
    signConfidence: 40,
    ghostConfidence: 40,
    blockerCode: 'Ti',
    factors: [
      {
        feature: 'daysSinceLastTouch',
        direction: 'increases',
        weight: 0.7,
        plainText: 'No contact in 9 days raises ghost risk.',
      },
      {
        feature: 'monthlySavingsRatio',
        direction: 'increases',
        weight: 0.4,
        plainText: 'Decent savings keep them interested.',
      },
    ],
    recommendedAction: 'Text them today.',
    evidence: 'They went quiet after the quote.',
  };

  const rich = assembleRichPrediction({
    leadId: 'lead-4',
    mode: 'degraded',
    calibrated: false,
    modelVersion: MODEL_VERSION,
    horizonDays: 14,
    modelNumbers: null,
    llm,
  });

  it('takes numbers from the LLM in degraded mode', () => {
    expect(rich.signProbability).toBe(33);
    expect(rich.ghostRisk).toBe(71);
  });

  it('maps llm factors into OracleFactor[] with inferred targets', () => {
    expect(rich.factors).toHaveLength(2);
    const dslt = rich.factors.find((f) => f.feature === 'daysSinceLastTouch');
    const sav = rich.factors.find((f) => f.feature === 'monthlySavingsRatio');
    expect(dslt?.target).toBe('ghost'); // ghost-leaning feature
    expect(sav?.target).toBe('sign');
    expect(dslt?.plainText).toContain('9 days');
  });

  it('carries the llm blocker/action/evidence', () => {
    expect(rich.blockerCode).toBe('Ti');
    expect(rich.recommendedAction).toBe('Text them today.');
  });
});

// ── computeModelNumbersAndFactors — real synthetic-trained model ─────────────
describe('computeModelNumbersAndFactors', () => {
  const corpus = generateSyntheticCorpus({ seed: 7, nLeads: 400 });
  const model = fitMultinomial(corpus.rows, { l2: 0.5, lr: 0.4, maxIter: 400 });

  function baseVector(daysSinceLastTouch: number): number[] {
    const x = Array.from({ length: FEATURE_COUNT }, () => 0);
    x[IDX('monthlyBill')] = 300;
    x[IDX('systemSizeKw')] = 9;
    x[IDX('totalCost')] = 26000;
    x[IDX('costPerKw')] = 2900;
    x[IDX('simplePaybackYears')] = 12;
    x[IDX('monthlySavingsRatio')] = 0.6;
    x[IDX('roi25yrRatio')] = 1.2;
    x[IDX('financingAdjustedUpfront')] = 13000;
    x[IDX('personaConfidence')] = 0.7;
    x[IDX('messagesSent')] = 3;
    x[IDX('distinctChannels')] = 2;
    x[IDX('maxSequenceOrder')] = 3;
    x[IDX('daysSinceLastTouch')] = daysSinceLastTouch;
    x[IDX('stepProgressRatio')] = 0.5;
    x[IDX('daysToNextAction')] = 2;
    x[IDX('daysInPipeline')] = 8;
    x[IDX('daysSinceLatestStrategy')] = 6;
    x[IDX('hasStrategy')] = 1;
    return x;
  }

  it('returns 0–100 int numbers and ≤6 factors', () => {
    const out = computeModelNumbersAndFactors(model, baseVector(8), 14);
    expect(Number.isInteger(out.signProbability)).toBe(true);
    expect(Number.isInteger(out.ghostRisk)).toBe(true);
    expect(out.signProbability).toBeGreaterThanOrEqual(0);
    expect(out.signProbability).toBeLessThanOrEqual(100);
    expect(out.ghostRisk).toBeGreaterThanOrEqual(0);
    expect(out.ghostRisk).toBeLessThanOrEqual(100);
    expect(out.factors.length).toBeGreaterThan(0);
    expect(out.factors.length).toBeLessThanOrEqual(6);
  });

  it('ghost number rises with days since last touch', () => {
    const lo = computeModelNumbersAndFactors(model, baseVector(1), 14);
    const hi = computeModelNumbersAndFactors(model, baseVector(25), 14);
    expect(hi.ghostRisk).toBeGreaterThanOrEqual(lo.ghostRisk);
  });
});

// ─── HARDENING: assembleRichPrediction extremes & degradation ────────────────

const isBlockerCode = (c: unknown): c is BlockerCode =>
  typeof c === 'string' && (BLOCKER_CODES as readonly string[]).includes(c);

/** Build a minimal AssembleRichArgs payload for terse, focused edge tests. */
function assembleModel(
  modelNumbers: {
    signProbability: number;
    ghostRisk: number;
    factors: OracleFactor[];
  } | null,
  llm: OracleLlmOutput | null,
  calibrated = false
) {
  return assembleRichPrediction({
    leadId: 'edge',
    mode: 'model',
    calibrated,
    modelVersion: MODEL_VERSION,
    horizonDays: 14,
    modelNumbers,
    llm,
  });
}

describe('assembleRichPrediction — model numbers at the extremes', () => {
  const factors: OracleFactor[] = [
    {
      feature: 'monthlySavingsRatio',
      direction: 'increases',
      weight: 1,
      target: 'sign',
      plainText: 'Strong savings increase sign likelihood',
    },
  ];

  it('handles 0 / 0 without escaping [0,100] and with a finite band', () => {
    const rich = assembleModel(
      { signProbability: 0, ghostRisk: 0, factors },
      null
    );
    expect(rich.signProbability).toBe(0);
    expect(rich.ghostRisk).toBe(0);
    expect(rich.signConfidence.low).toBe(0); // 0 - 15 clamped
    expect(rich.signConfidence.high).toBe(15);
    expect(rich.ghostConfidence.low).toBe(0);
  });

  it('handles 100 / 100 without escaping [0,100]', () => {
    const rich = assembleModel(
      { signProbability: 100, ghostRisk: 100, factors },
      null
    );
    expect(rich.signProbability).toBe(100);
    expect(rich.ghostRisk).toBe(100);
    expect(rich.signConfidence.high).toBe(100); // 100 + 15 clamped
    expect(rich.signConfidence.low).toBe(85);
    expect(rich.ghostConfidence.high).toBe(100);
  });

  it('clamps out-of-range model numbers (calibrated band ±8)', () => {
    const rich = assembleModel(
      { signProbability: 250, ghostRisk: -40, factors },
      null,
      true
    );
    expect(rich.signProbability).toBe(100);
    expect(rich.ghostRisk).toBe(0);
    expect(rich.signConfidence.high).toBe(100);
    expect(rich.ghostConfidence.high).toBe(8); // 0 + 8
  });

  it('scrubs non-finite model numbers to 0', () => {
    const rich = assembleModel(
      { signProbability: Number.NaN, ghostRisk: Infinity, factors },
      null
    );
    expect(rich.signProbability).toBe(0);
    expect(rich.ghostRisk).toBe(0);
  });
});

describe('assembleRichPrediction — degraded llm out-of-range numbers (clamped ints)', () => {
  const degradedLlm = (sign: number, ghost: number): OracleLlmOutput => ({
    signProbability: sign,
    ghostRisk: ghost,
    signConfidence: 40,
    ghostConfidence: 40,
    blockerCode: 'Ti',
    factors: [],
    recommendedAction: 'Reach out.',
    evidence: 'Quiet lately.',
  });

  it('clamps a degraded LLM that returns >100 / <0 to [0,100] ints', () => {
    const rich = assembleRichPrediction({
      leadId: 'deg-clamp',
      mode: 'degraded',
      calibrated: false,
      modelVersion: MODEL_VERSION,
      horizonDays: 14,
      modelNumbers: null,
      llm: degradedLlm(180, -25),
    });
    expect(rich.signProbability).toBe(100);
    expect(rich.ghostRisk).toBe(0);
    expect(Number.isInteger(rich.signProbability)).toBe(true);
    expect(Number.isInteger(rich.ghostRisk)).toBe(true);
  });

  it('rounds + clamps a fractional degraded LLM value to an int', () => {
    const rich = assembleRichPrediction({
      leadId: 'deg-round',
      mode: 'degraded',
      calibrated: false,
      modelVersion: MODEL_VERSION,
      horizonDays: 14,
      modelNumbers: null,
      llm: degradedLlm(62.7, 28.4),
    });
    expect(rich.signProbability).toBe(63);
    expect(rich.ghostRisk).toBe(28);
  });

  it('scrubs non-finite degraded LLM numbers to 0', () => {
    const rich = assembleRichPrediction({
      leadId: 'deg-nan',
      mode: 'degraded',
      calibrated: false,
      modelVersion: MODEL_VERSION,
      horizonDays: 14,
      modelNumbers: null,
      llm: degradedLlm(Number.NaN, Number.POSITIVE_INFINITY),
    });
    expect(rich.signProbability).toBe(0);
    expect(rich.ghostRisk).toBe(0);
  });
});

describe('assembleRichPrediction — degraded llm with an invalid blockerCode', () => {
  it('falls back to a valid deterministic blocker when the LLM code is junk', () => {
    const rich = assembleRichPrediction({
      leadId: 'deg-badcode',
      mode: 'degraded',
      calibrated: false,
      modelVersion: MODEL_VERSION,
      horizonDays: 14,
      modelNumbers: null,
      llm: {
        signProbability: 40,
        ghostRisk: 60,
        signConfidence: 40,
        ghostConfidence: 40,
        // intentionally NOT in BLOCKER_CODES
        blockerCode: 'NONSENSE' as unknown as BlockerCode,
        factors: [
          {
            feature: 'daysSinceLastTouch',
            direction: 'increases',
            weight: 0.8,
            plainText: 'Gone quiet.',
          },
        ],
        recommendedAction: 'Ping them.',
        evidence: 'Silence after the quote.',
      },
    });
    expect(isBlockerCode(rich.blockerCode)).toBe(true);
    // ghost-leaning daysSinceLastTouch → Timing
    expect(rich.blockerCode).toBe('Ti');
    // action/evidence still come from the (otherwise valid) LLM
    expect(rich.recommendedAction).toBe('Ping them.');
  });

  it('falls back to a deterministic action when the LLM action is blank', () => {
    const rich = assembleRichPrediction({
      leadId: 'deg-blankaction',
      mode: 'degraded',
      calibrated: false,
      modelVersion: MODEL_VERSION,
      horizonDays: 14,
      modelNumbers: null,
      llm: {
        signProbability: 40,
        ghostRisk: 60,
        signConfidence: 40,
        ghostConfidence: 40,
        blockerCode: 'P',
        factors: [],
        recommendedAction: '   ', // whitespace-only → fall back
        evidence: '   ', // whitespace-only → fall back
      },
    });
    expect(rich.blockerCode).toBe('P');
    expect(rich.recommendedAction.trim().length).toBeGreaterThan(0);
    expect(rich.evidence.trim().length).toBeGreaterThan(0);
  });
});

// ── confidenceBand never escapes [0,100] across the full domain ──────────────
describe('confidenceBand stays within [0,100] for every mode/value', () => {
  const modes = ['model', 'degraded'] as const;
  const cals = [true, false];
  it('low/high/width are bounded for sampled inputs incl. out-of-range', () => {
    for (const mode of modes) {
      for (const calibrated of cals) {
        for (const v of [-50, 0, 1, 49, 50, 99, 100, 150, Number.NaN]) {
          const b = confidenceBand(v, mode, calibrated);
          expect(b.low).toBeGreaterThanOrEqual(0);
          expect(b.low).toBeLessThanOrEqual(100);
          expect(b.high).toBeGreaterThanOrEqual(0);
          expect(b.high).toBeLessThanOrEqual(100);
          expect(b.high).toBeGreaterThanOrEqual(b.low);
          expect(b.width).toBe(b.high - b.low);
        }
      }
    }
  });
});

// ── deterministic blocker fallback: valid code reflecting the dominant factor ─
describe('deterministic blocker fallback (model mode, llm=null)', () => {
  function modelWith(topFeature: string, target: 'sign' | 'ghost') {
    return assembleModel(
      {
        signProbability: target === 'sign' ? 70 : 30,
        ghostRisk: target === 'ghost' ? 70 : 30,
        factors: [
          {
            feature: topFeature,
            direction: 'increases',
            weight: 0.9,
            target,
            plainText: `${topFeature} drives ${target}`,
          },
        ],
      },
      null
    );
  }

  it('always yields a valid BlockerCode for every top feature', () => {
    for (const f of FEATURE_NAMES) {
      for (const target of ['sign', 'ghost'] as const) {
        const rich = modelWith(f, target);
        expect(isBlockerCode(rich.blockerCode)).toBe(true);
      }
    }
  });

  it('economics drivers → Price (P)', () => {
    expect(modelWith('simplePaybackYears', 'sign').blockerCode).toBe('P');
    expect(modelWith('roi25yrRatio', 'sign').blockerCode).toBe('P');
    expect(modelWith('costPerKw', 'sign').blockerCode).toBe('P');
  });

  it('financing drivers → Financing (F)', () => {
    expect(modelWith('financingAdjustedUpfront', 'sign').blockerCode).toBe('F');
    expect(modelWith('financingIsLoan', 'sign').blockerCode).toBe('F');
  });

  it('technical drivers → Technical (Te)', () => {
    expect(modelWith('systemSizeKw', 'sign').blockerCode).toBe('Te');
  });

  it('engagement/silence + ghost dominance → Timing (Ti)', () => {
    expect(modelWith('daysSinceLastTouch', 'ghost').blockerCode).toBe('Ti');
    expect(modelWith('awaitingReply', 'ghost').blockerCode).toBe('Ti');
  });

  it('persona-confidence driver → Trust (T)', () => {
    expect(modelWith('personaSkeptic', 'sign').blockerCode).toBe('T');
  });

  it('no factors at all → OK', () => {
    const rich = assembleModel(
      { signProbability: 50, ghostRisk: 50, factors: [] },
      null
    );
    expect(rich.blockerCode).toBe('OK');
  });
});

// ── decideMode is exhaustive over (labels × hasModel) ────────────────────────
describe('decideMode exhaustive', () => {
  it('is model iff a model is present, for any label count', () => {
    for (const labels of [0, 1, 29, 30, 31, 1000]) {
      expect(decideMode(labels, true)).toBe('model');
      expect(decideMode(labels, false)).toBe('degraded');
    }
  });
});

// ── factors default to [] when modelNumbers omits the array ──────────────────
describe('assembleRichPrediction — model mode missing factors array', () => {
  it('defaults to [] (never throws) and derives OK', () => {
    const rich = assembleModel(
      {
        signProbability: 50,
        ghostRisk: 50,
        // @ts-expect-error intentionally omit factors to test the guard
        factors: undefined,
      },
      null
    );
    expect(rich.factors).toEqual([]);
    expect(rich.blockerCode).toBe('OK');
  });
});
