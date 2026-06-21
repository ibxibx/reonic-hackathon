import { describe, it, expect } from 'vitest';
import { oracleSchema } from './schemas';
import { BLOCKER_CODES } from '../oracle/contracts';
import type { OracleLlmOutput } from '../oracle/contracts';

/** Build a single valid factor (the schema's factors[] element shape). */
function factor(plainText = 'A grounded one-sentence driver narration.') {
  return {
    feature: 'monthlySavingsRatio',
    direction: 'increases' as const,
    weight: 0.42,
    plainText,
  };
}

// A valid OracleLlmOutput-shaped sample. Typed as OracleLlmOutput to assert at
// compile time that the contract shape parses through the schema.
const validSample: OracleLlmOutput = {
  signProbability: 62,
  ghostRisk: 28,
  signConfidence: 70,
  ghostConfidence: 55,
  blockerCode: 'F',
  factors: [
    {
      feature: 'monthlySavingsRatio',
      direction: 'increases',
      weight: 0.42,
      plainText: 'Strong monthly savings relative to the bill push toward a sign.',
    },
    {
      feature: 'daysSinceLastTouch',
      direction: 'increases',
      weight: 0.31,
      plainText: 'A long gap since the last touch raises ghost risk.',
    },
  ],
  recommendedAction:
    'Call within 2 days to walk through loan terms and reassure on affordability.',
  evidence:
    'Economics are favorable with a short payback, but financing is the open question and the gap since last touch is widening.',
};

describe('oracleSchema', () => {
  it('parses a valid OracleLlmOutput-shaped sample', () => {
    const parsed = oracleSchema.parse(validSample);
    expect(parsed.signProbability).toBe(62);
    expect(parsed.blockerCode).toBe('F');
    expect(parsed.factors).toHaveLength(2);
    expect(parsed.factors[0].direction).toBe('increases');
  });

  it('rejects an invalid blockerCode', () => {
    const bad = { ...validSample, blockerCode: 'ZZ' };
    const result = oracleSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range probability', () => {
    const bad = { ...validSample, signProbability: 140 };
    const result = oracleSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer probability', () => {
    const bad = { ...validSample, ghostRisk: 28.5 };
    const result = oracleSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const bad: Record<string, unknown> = { ...validSample };
    delete bad.recommendedAction;
    const result = oracleSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects more than 8 factors', () => {
    const tooMany = {
      ...validSample,
      factors: Array.from({ length: 9 }, () => ({
        feature: 'systemSizeKw',
        direction: 'increases' as const,
        weight: 0.1,
        plainText: 'driver',
      })),
    };
    const result = oracleSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });
});

describe('oracleSchema — probability boundaries', () => {
  it('accepts probabilities at the exact lower bound 0', () => {
    const ok = { ...validSample, signProbability: 0, ghostRisk: 0 };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts probabilities at the exact upper bound 100', () => {
    const ok = { ...validSample, signProbability: 100, ghostRisk: 100 };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects signProbability just above the bound (101)', () => {
    const bad = { ...validSample, signProbability: 101 };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects ghostRisk just below the bound (-1)', () => {
    const bad = { ...validSample, ghostRisk: -1 };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-integer signProbability', () => {
    const bad = { ...validSample, signProbability: 50.5 };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('oracleSchema — confidence boundaries', () => {
  it('accepts signConfidence/ghostConfidence at the lower bound 0', () => {
    const ok = { ...validSample, signConfidence: 0, ghostConfidence: 0 };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts signConfidence/ghostConfidence at the upper bound 100', () => {
    const ok = { ...validSample, signConfidence: 100, ghostConfidence: 100 };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects signConfidence above the bound (100.01)', () => {
    const bad = { ...validSample, signConfidence: 100.01 };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects ghostConfidence below the bound (-0.01)', () => {
    const bad = { ...validSample, ghostConfidence: -0.01 };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('oracleSchema — factors length boundaries', () => {
  it('accepts an empty factors array (degraded-mode floor)', () => {
    const ok = { ...validSample, factors: [] };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts exactly 8 factors (max boundary)', () => {
    const ok = {
      ...validSample,
      factors: Array.from({ length: 8 }, () => factor()),
    };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects 9 factors (one over the max boundary)', () => {
    const bad = {
      ...validSample,
      factors: Array.from({ length: 9 }, () => factor()),
    };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('oracleSchema — blockerCode coverage', () => {
  it('accepts every frozen contract blockerCode', () => {
    for (const code of BLOCKER_CODES) {
      const ok = { ...validSample, blockerCode: code };
      expect(
        oracleSchema.safeParse(ok).success,
        `schema rejected valid blockerCode ${code}`
      ).toBe(true);
    }
  });

  it('rejects an unknown blockerCode', () => {
    const bad = { ...validSample, blockerCode: 'XX' };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('oracleSchema — recommendedAction length boundaries', () => {
  it('accepts recommendedAction at exactly the min length (20)', () => {
    const ok = { ...validSample, recommendedAction: 'a'.repeat(20) };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects recommendedAction one char below min (19)', () => {
    const bad = { ...validSample, recommendedAction: 'a'.repeat(19) };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts recommendedAction at exactly the max length (500)', () => {
    const ok = { ...validSample, recommendedAction: 'a'.repeat(500) };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects recommendedAction one char above max (501)', () => {
    const bad = { ...validSample, recommendedAction: 'a'.repeat(501) };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('oracleSchema — evidence length boundaries', () => {
  it('accepts evidence at exactly the min length (40)', () => {
    const ok = { ...validSample, evidence: 'a'.repeat(40) };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects evidence one char below min (39)', () => {
    const bad = { ...validSample, evidence: 'a'.repeat(39) };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts evidence at exactly the max length (1200)', () => {
    const ok = { ...validSample, evidence: 'a'.repeat(1200) };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects evidence one char above max (1201)', () => {
    const bad = { ...validSample, evidence: 'a'.repeat(1201) };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('oracleSchema — factor plainText length boundaries', () => {
  it('accepts factor plainText at exactly the min length (1)', () => {
    const ok = { ...validSample, factors: [factor('x')] };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects empty factor plainText (below min)', () => {
    const bad = { ...validSample, factors: [factor('')] };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts factor plainText at exactly the max length (300)', () => {
    const ok = { ...validSample, factors: [factor('a'.repeat(300))] };
    expect(oracleSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects factor plainText one char above max (301)', () => {
    const bad = { ...validSample, factors: [factor('a'.repeat(301))] };
    expect(oracleSchema.safeParse(bad).success).toBe(false);
  });
});
