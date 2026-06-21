import { describe, it, expect } from 'vitest';
import {
  assembleFeatures,
  featuresToVector,
  leastSquaresSlope,
} from './features';
import { FEATURE_NAMES, FEATURE_COUNT } from './contracts';
import type { FeatureAssemblyInput } from './contracts';

const NOW = Date.parse('2026-06-21T12:00:00.000Z');
const day = (d: number) =>
  new Date(NOW - d * 86_400_000).toISOString();

const idx = (name: string) => FEATURE_NAMES.indexOf(name as never);

// ── Fixture resembling seed lead "Noah": bill 510, ghosted, loan, 13.1kW, $48,600 ──
function noahInput(over: Partial<FeatureAssemblyInput> = {}): FeatureAssemblyInput {
  const lead = {
    id: 'noah',
    monthly_bill: 510,
    roof_type: 'shingle',
    created_at: day(20), // in pipeline 20 days
    status: 'ghosted',
    address: '',
    email: '',
    installer_id: 'i',
    name: 'Noah',
    phone: '',
  } as unknown as FeatureAssemblyInput['lead'];

  const quote = {
    id: 'q',
    lead_id: 'noah',
    system_size_kw: 13.1,
    total_cost: 48_600,
    financing_type: 'loan',
    created_at: day(18),
    notes: null,
  } as unknown as FeatureAssemblyInput['quote'];

  const strategy = {
    id: 's',
    lead_id: 'noah',
    persona_detected: 'investor',
    persona_confidence: 0.82,
    created_at: day(15),
    rationale: '',
    signals: [],
    strategy_summary: '',
  } as unknown as FeatureAssemblyInput['strategy'];

  const messages = [
    {
      id: 'm1',
      lead_id: 'noah',
      channel_type: 'email',
      status: 'sent',
      sequence_order: 1,
      sent_at: day(12),
      created_at: day(12),
      strategy_id: 's',
      content: '',
      subject: null,
      goal: null,
      audio_path: null,
      error_message: null,
      provider_message_id: null,
    },
    {
      id: 'm2',
      lead_id: 'noah',
      channel_type: 'sms',
      status: 'sent',
      sequence_order: 2,
      sent_at: day(8), // latest sent → daysSinceLastTouch ≈ 8
      created_at: day(8),
      strategy_id: 's',
      content: '',
      subject: null,
      goal: null,
      audio_path: null,
      error_message: null,
      provider_message_id: null,
    },
    {
      id: 'm3',
      lead_id: 'noah',
      channel_type: 'call',
      status: 'failed',
      sequence_order: 3,
      sent_at: null,
      created_at: day(7),
      strategy_id: 's',
      content: '',
      subject: null,
      goal: null,
      audio_path: null,
      error_message: 'no answer',
      provider_message_id: null,
    },
    {
      id: 'm4',
      lead_id: 'noah',
      channel_type: 'email',
      status: 'draft',
      sequence_order: 4,
      sent_at: null,
      created_at: day(1),
      strategy_id: 's',
      content: '',
      subject: null,
      goal: null,
      audio_path: null,
      error_message: null,
      provider_message_id: null,
    },
  ] as unknown as FeatureAssemblyInput['messages'];

  const orchestration = {
    id: 'o',
    lead_id: 'noah',
    current_step: 3,
    total_steps: 6,
    status: 'awaiting_reply',
    next_action_at: day(-2), // 2 days in the future
    strategy_id: 's',
    updated_at: day(1),
  } as unknown as FeatureAssemblyInput['orchestration'];

  const priorPredictions = [
    { sign_prob: 40, ghost_risk: 30 },
    { sign_prob: 30, ghost_risk: 45 },
    { sign_prob: 20, ghost_risk: 60 },
  ] as unknown as FeatureAssemblyInput['priorPredictions'];

  return {
    lead,
    quote,
    strategy,
    messages,
    orchestration,
    priorPredictions,
    nowMs: NOW,
    ...over,
  };
}

describe('leastSquaresSlope', () => {
  it('returns 0 for <2 points', () => {
    expect(leastSquaresSlope([])).toBe(0);
    expect(leastSquaresSlope([5])).toBe(0);
  });

  it('recovers a known positive slope', () => {
    expect(leastSquaresSlope([0, 2, 4, 6])).toBeCloseTo(2, 9);
  });

  it('recovers a known negative slope', () => {
    expect(leastSquaresSlope([60, 45, 30])).toBeCloseTo(-15, 9);
  });
});

describe('assembleFeatures — Noah fixture', () => {
  const f = assembleFeatures(noahInput());

  it('carries the structured raw inputs', () => {
    expect(f.leadId).toBe('noah');
    expect(f.monthlyBill).toBe(510);
    expect(f.systemSizeKw).toBe(13.1);
    expect(f.totalCost).toBe(48_600);
    expect(f.financingType).toBe('loan');
    expect(f.roofType).toBe('shingle');
  });

  it('derives economics (loan → 0 upfront, positive costPerKw)', () => {
    expect(f.costPerKw).toBeCloseTo(48_600 / 13.1, 6);
    expect(f.financingAdjustedUpfront).toBe(0); // loan
    expect(f.simplePaybackYears).toBeGreaterThan(0);
  });

  it('reads persona + confidence from strategy', () => {
    expect(f.persona).toBe('investor');
    expect(f.personaConfidence).toBeCloseTo(0.82, 6);
    expect(f.hasStrategy).toBe(true);
    expect(f.hasQuote).toBe(true);
  });

  it('counts engagement by status and distinct channels', () => {
    expect(f.messagesSent).toBe(2);
    expect(f.messagesDraft).toBe(1);
    expect(f.messagesFailed).toBe(1);
    expect(f.distinctChannels).toBe(3); // email, sms, call
    expect(f.maxSequenceOrder).toBe(4);
    expect(f.lastChannel).toBe('sms'); // latest sent_at
  });

  it('computes time-since-last-touch from latest sent message', () => {
    expect(f.daysSinceLastTouch).toBeCloseTo(8, 6);
  });

  it('computes temporal features from injected clock', () => {
    expect(f.daysInPipeline).toBeCloseTo(20, 6);
    expect(f.daysSinceLatestStrategy).toBeCloseTo(15, 6);
  });

  it('reads orchestration step progress and awaiting state', () => {
    expect(f.currentStep).toBe(3);
    expect(f.totalSteps).toBe(6);
    expect(f.stepProgressRatio).toBeCloseTo(0.5, 6);
    expect(f.awaitingReply).toBe(true);
    expect(f.daysToNextAction).toBeCloseTo(2, 6);
  });

  it('computes trend slopes from prior predictions (>=2 snapshots)', () => {
    expect(f.signProbSlope).toBeCloseTo(-10, 6); // 40,30,20
    expect(f.ghostRiskSlope).toBeCloseTo(15, 6); // 30,45,60
  });

  it('is flagged non-synthetic', () => {
    expect(f.synthetic).toBe(false);
  });
});

describe('featuresToVector — Noah fixture', () => {
  const f = assembleFeatures(noahInput());
  const v = featuresToVector(f);

  it('produces exactly FEATURE_COUNT values', () => {
    expect(v).toHaveLength(FEATURE_COUNT);
  });

  it('spot-checks structured slots', () => {
    expect(v[idx('monthlyBill')]).toBe(510);
    expect(v[idx('systemSizeKw')]).toBe(13.1);
    expect(v[idx('totalCost')]).toBe(48_600);
  });

  it('encodes one-hots correctly (loan + investor)', () => {
    expect(v[idx('financingIsCash')]).toBe(0);
    expect(v[idx('financingIsLoan')]).toBe(1);
    expect(v[idx('personaInvestor')]).toBe(1);
    expect(v[idx('personaSkeptic')]).toBe(0);
  });

  it('encodes booleans as 0/1', () => {
    expect(v[idx('awaitingReply')]).toBe(1);
    expect(v[idx('hasStrategy')]).toBe(1);
  });

  it('carries trend slopes into the vector', () => {
    expect(v[idx('signProbSlope')]).toBeCloseTo(-10, 6);
    expect(v[idx('ghostRiskSlope')]).toBeCloseTo(15, 6);
  });
});

describe('assembleFeatures — fallbacks', () => {
  it('no messages → daysSinceLastTouch falls back to daysInPipeline, no channels', () => {
    const f = assembleFeatures(noahInput({ messages: [] }));
    expect(f.messagesSent).toBe(0);
    expect(f.distinctChannels).toBe(0);
    expect(f.lastChannel).toBeNull();
    expect(f.daysSinceLastTouch).toBeCloseTo(f.daysInPipeline, 6);
  });

  it('no strategy → persona null, confidence 0, daysSinceLatestStrategy = pipeline', () => {
    const f = assembleFeatures(noahInput({ strategy: null }));
    expect(f.persona).toBeNull();
    expect(f.personaConfidence).toBe(0);
    expect(f.hasStrategy).toBe(false);
    expect(f.daysSinceLatestStrategy).toBeCloseTo(f.daysInPipeline, 6);
    const v = featuresToVector(f);
    expect(v[idx('hasStrategy')]).toBe(0);
    expect(v[idx('personaInvestor')]).toBe(0);
  });

  it('no quote → economics zero-guarded, hasQuote false', () => {
    const f = assembleFeatures(noahInput({ quote: null }));
    expect(f.systemSizeKw).toBe(0);
    expect(f.costPerKw).toBe(0);
    expect(f.hasQuote).toBe(false);
    expect(Number.isFinite(f.simplePaybackYears)).toBe(true);
  });

  it('no orchestration → stepProgressRatio 0, not awaiting, daysToNextAction 0', () => {
    const f = assembleFeatures(noahInput({ orchestration: null }));
    expect(f.currentStep).toBe(0);
    expect(f.totalSteps).toBe(0);
    expect(f.stepProgressRatio).toBe(0);
    expect(f.awaitingReply).toBe(false);
    expect(f.daysToNextAction).toBe(0);
  });

  it('fewer than 2 prior predictions → slopes are 0', () => {
    const f = assembleFeatures(
      noahInput({
        priorPredictions: [
          { sign_prob: 40, ghost_risk: 30 },
        ] as unknown as FeatureAssemblyInput['priorPredictions'],
      })
    );
    expect(f.signProbSlope).toBe(0);
    expect(f.ghostRiskSlope).toBe(0);
  });
});
