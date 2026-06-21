import { describe, it, expect } from 'vitest';
import { buildOraclePrompt } from './prompts';
import type { Database } from '../database.types';
import type {
  OracleFactor,
  OracleFeatures,
  OraclePromptContext,
} from '../oracle/contracts';

type LeadRow = Database['public']['Tables']['leads']['Row'];
type QuoteRow = Database['public']['Tables']['quotes']['Row'];

const lead: LeadRow = {
  id: 'lead-1',
  installer_id: 'installer-1',
  name: 'Dana Homeowner',
  email: 'dana@example.com',
  phone: '+15555550100',
  address: '12 Solar St, Sunville',
  monthly_bill: 240,
  roof_type: 'shingle',
  status: 'contacted',
  created_at: '2026-06-01T00:00:00.000Z',
};

const quote: QuoteRow = {
  id: 'quote-1',
  lead_id: 'lead-1',
  system_size_kw: 9.5,
  total_cost: 28000,
  financing_type: 'loan',
  notes: 'Wants to compare two installers.',
  created_at: '2026-06-02T00:00:00.000Z',
};

const features: OracleFeatures = {
  leadId: 'lead-1',
  monthlyBill: 240,
  systemSizeKw: 9.5,
  totalCost: 28000,
  financingType: 'loan',
  roofType: 'shingle',
  persona: 'investor',
  personaConfidence: 0.8,
  costPerKw: 2947.37,
  simplePaybackYears: 8.4,
  monthlySavingsRatio: 0.62,
  roi25yrRatio: 2.7,
  financingAdjustedUpfront: 0,
  messagesSent: 3,
  messagesDraft: 0,
  messagesFailed: 0,
  distinctChannels: 2,
  lastChannel: 'email',
  maxSequenceOrder: 3,
  daysSinceLastTouch: 5,
  awaitingReply: true,
  currentStep: 2,
  totalSteps: 5,
  stepProgressRatio: 0.4,
  daysToNextAction: -1,
  daysInPipeline: 19,
  daysSinceLatestStrategy: 12,
  signProbSlope: 0.6,
  ghostRiskSlope: -0.2,
  hasQuote: true,
  hasStrategy: true,
  synthetic: false,
};

const factors: OracleFactor[] = [
  {
    feature: 'monthlySavingsRatio',
    direction: 'increases',
    weight: 0.42,
    target: 'sign',
    plainText: 'High monthly savings ratio favors signing.',
  },
  {
    feature: 'daysSinceLastTouch',
    direction: 'increases',
    weight: 0.3,
    target: 'ghost',
    plainText: 'A widening gap since last touch raises ghost risk.',
  },
];

const engagementSummary =
  'ENGAGEMENT_SUMMARY_MARKER: 3 messages sent across email and SMS; last touch 5 days ago; awaiting reply.';

function baseCtx(
  overrides: Partial<OraclePromptContext> = {}
): OraclePromptContext {
  return {
    lead,
    quote,
    strategy: null,
    features,
    factors,
    modelNumbers: null,
    mode: 'degraded',
    engagementSummary,
    ...overrides,
  };
}

describe('buildOraclePrompt', () => {
  it('includes the supplied engagement summary text', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).toContain('ENGAGEMENT_SUMMARY_MARKER');
  });

  it('does NOT contain the removed blindfold phrase', () => {
    const modelOut = buildOraclePrompt(
      baseCtx({
        mode: 'model',
        modelNumbers: { signProbability: 64, ghostRisk: 22 },
      })
    );
    const degradedOut = buildOraclePrompt(baseCtx());
    expect(modelOut.toLowerCase()).not.toContain('no interaction records');
    expect(degradedOut.toLowerCase()).not.toContain('no interaction records');
  });

  it('mentions a supplied factor feature', () => {
    const out = buildOraclePrompt(
      baseCtx({
        mode: 'model',
        modelNumbers: { signProbability: 64, ghostRisk: 22 },
      })
    );
    expect(out).toContain('monthlySavingsRatio');
  });

  it('differs between model and degraded mode', () => {
    const modelOut = buildOraclePrompt(
      baseCtx({
        mode: 'model',
        modelNumbers: { signProbability: 64, ghostRisk: 22 },
      })
    );
    const degradedOut = buildOraclePrompt(baseCtx());
    expect(modelOut).not.toEqual(degradedOut);
    // model mode locks the numbers; degraded mode asks the LLM to estimate
    expect(modelOut).toContain('MODEL-COMPUTED');
    expect(degradedOut).toContain('YOU ESTIMATE');
  });

  it('ties the recommended action to the orchestration step', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).toContain('Step 2 of 5');
  });
});

const modelCtxOverride = {
  mode: 'model' as const,
  modelNumbers: { signProbability: 64, ghostRisk: 22 },
};

describe('buildOraclePrompt — hallucination guards', () => {
  it('ALWAYS contains the no-invention instruction (model mode)', () => {
    const out = buildOraclePrompt(baseCtx(modelCtxOverride));
    expect(out).toContain('Use only the supplied data.');
    expect(out).toContain('NEVER invent');
  });

  it('ALWAYS contains the no-invention instruction (degraded mode)', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).toContain('Use only the supplied data.');
    expect(out).toContain('NEVER invent');
  });

  it('forbids claiming unsent/unanswered messages in both modes', () => {
    const expected =
      'Do not claim a message was opened, ignored, or answered unless it appears in the outreach summary';
    expect(buildOraclePrompt(baseCtx(modelCtxOverride))).toContain(expected);
    expect(buildOraclePrompt(baseCtx())).toContain(expected);
  });

  it('never contains the removed "no interaction records" blindfold (both modes)', () => {
    expect(
      buildOraclePrompt(baseCtx(modelCtxOverride)).toLowerCase()
    ).not.toContain('no interaction records');
    expect(buildOraclePrompt(baseCtx()).toLowerCase()).not.toContain(
      'no interaction records'
    );
  });
});

describe('buildOraclePrompt — model mode', () => {
  it('states the probabilities are model-computed and must not change', () => {
    const out = buildOraclePrompt(baseCtx(modelCtxOverride));
    expect(out).toContain('MODEL-COMPUTED');
    expect(out).toContain('do not change');
    expect(out).toContain('Echo them EXACTLY');
  });

  it('locks each supplied model number into the prompt verbatim', () => {
    const out = buildOraclePrompt(baseCtx(modelCtxOverride));
    expect(out).toContain('signProbability: 64 (use this exact integer)');
    expect(out).toContain('ghostRisk: 22 (use this exact integer)');
  });

  it('lists every supplied factor feature for the model to narrate', () => {
    const out = buildOraclePrompt(baseCtx(modelCtxOverride));
    for (const f of factors) {
      expect(out, `factor ${f.feature} not listed`).toContain(f.feature);
    }
    // and instructs the model to echo (not invent) them
    expect(out).toContain('MUST echo these supplied factors');
    expect(out).toContain('do not introduce new factors');
  });

  it('does NOT ask the model to estimate probabilities in model mode', () => {
    const out = buildOraclePrompt(baseCtx(modelCtxOverride));
    expect(out).not.toContain('YOU ESTIMATE');
  });
});

describe('buildOraclePrompt — degraded mode', () => {
  it('asks the model to estimate the probabilities', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).toContain('YOU ESTIMATE');
    expect(out).toContain('YOU estimate them from the facts');
  });

  it('does NOT lock model numbers in degraded mode', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).not.toContain('MODEL-COMPUTED');
    expect(out).not.toContain('use this exact integer');
  });
});

describe('buildOraclePrompt — ghost engagement-decay framing', () => {
  // Default features have daysSinceLastTouch=5 and a ghost-targeted factor, so
  // the default ctx triggers the ghost framing in both modes.
  const HEADER = 'Ghost (going-quiet) framing — directional only';
  const DECAY_PHRASE = 'Re-engagement odds fall sharply the longer a lead stays quiet';

  it('includes the honest engagement-decay framing when a lead is quiet (degraded)', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).toContain(HEADER);
    expect(out).toContain(DECAY_PHRASE);
  });

  it('includes the framing in model mode too', () => {
    const out = buildOraclePrompt(baseCtx(modelCtxOverride));
    expect(out).toContain(HEADER);
    expect(out).toContain(DECAY_PHRASE);
  });

  it('triggers on a rising ghost trend even when not yet quiet', () => {
    const out = buildOraclePrompt(
      baseCtx({
        features: { ...features, daysSinceLastTouch: 0, ghostRiskSlope: 0.3 },
        factors: [], // remove the ghost factor so only the trend can trip it
      })
    );
    expect(out).toContain(HEADER);
  });

  it('triggers when a supplied factor targets ghost (model mode)', () => {
    const out = buildOraclePrompt(
      baseCtx({
        ...modelCtxOverride,
        // no silence, no rising trend — only the ghost-targeted factor remains
        features: { ...features, daysSinceLastTouch: 0, ghostRiskSlope: 0 },
      })
    );
    expect(out).toContain(HEADER);
  });

  it('OMITS the framing when there is no ghost signal at all', () => {
    const out = buildOraclePrompt(
      baseCtx({
        features: {
          ...features,
          daysSinceLastTouch: 0,
          ghostRiskSlope: 0,
        },
        factors: [
          {
            feature: 'monthlySavingsRatio',
            direction: 'increases',
            weight: 0.42,
            target: 'sign',
            plainText: 'High savings favor signing.',
          },
        ],
      })
    );
    expect(out).not.toContain(HEADER);
    expect(out).not.toContain(DECAY_PHRASE);
  });

  it('does NOT trip on NaN ghost signals (degenerate input is safe)', () => {
    const out = buildOraclePrompt(
      baseCtx({
        features: {
          ...features,
          daysSinceLastTouch: Number.NaN,
          ghostRiskSlope: Number.NaN,
        },
        factors: [], // and no ghost factor
      })
    );
    expect(out).not.toContain(HEADER);
  });

  it('injects NO fabricated numbers, percentages, or rates into the framing block', () => {
    const out = buildOraclePrompt(baseCtx());
    // Isolate exactly the framing block (header → next "## " section).
    const start = out.indexOf(`## ${HEADER}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = out.slice(start + 3); // skip the leading "## "
    const nextSection = rest.indexOf('\n## ');
    const block = nextSection >= 0 ? rest.slice(0, nextSection) : rest;
    // No digits and no percent signs anywhere in the framing block — it must
    // never assert a concrete decay rate, half-life value, or percentage.
    expect(block).not.toMatch(/[0-9]/);
    expect(block).not.toContain('%');
    // It must explicitly disavow being a fact about this homeowner.
    expect(block).toContain('NOT a fact about THIS homeowner');
    expect(block.toLowerCase()).toContain('do not state any specific');
  });

  it('keeps the global no-invention rules intact alongside the framing', () => {
    const out = buildOraclePrompt(baseCtx());
    expect(out).toContain(HEADER); // framing present
    expect(out).toContain('Use only the supplied data.');
    expect(out).toContain('NEVER invent');
    expect(out).toContain(
      'Do not claim a message was opened, ignored, or answered unless it appears in the outreach summary'
    );
  });
});

describe('buildOraclePrompt — degenerate inputs render cleanly', () => {
  it('renders without "undefined" when engagement summary is empty', () => {
    const out = buildOraclePrompt(baseCtx({ engagementSummary: '' }));
    expect(out).not.toContain('undefined');
  });

  it('renders without "undefined" with no quote, no strategy, no factors', () => {
    const out = buildOraclePrompt(
      baseCtx({
        quote: null,
        strategy: null,
        factors: [],
        engagementSummary: '',
      })
    );
    expect(out).not.toContain('undefined');
    expect(out).toContain('No quote on file for this lead.');
  });

  it('renders model mode without "undefined" when no factors are supplied', () => {
    const out = buildOraclePrompt(
      baseCtx({ ...modelCtxOverride, factors: [] })
    );
    expect(out).not.toContain('undefined');
    expect(out).toContain('none supplied');
  });
});
