import { describe, it, expect } from 'vitest';
import {
  advanceCovariates,
  expandToPersonPeriods,
  type LeadTimeline,
} from './person-period';
import {
  FEATURE_NAMES,
  FEATURE_COUNT,
  TIME_VARYING_FEATURES,
} from './contracts';

function zeroVector(): number[] {
  return new Array(FEATURE_COUNT).fill(0);
}

const idx = (name: string) => FEATURE_NAMES.indexOf(name as never);

describe('advanceCovariates', () => {
  it('applies the exact contract deltas at the right indices', () => {
    const x0 = zeroVector();
    const x3 = advanceCovariates(x0, 3);
    for (const { name, perPeriodDelta } of TIME_VARYING_FEATURES) {
      const i = idx(name);
      expect(x3[i]).toBe(perPeriodDelta * 3);
    }
  });

  it('leaves non-time-varying features unchanged', () => {
    const x0 = zeroVector();
    x0[idx('monthlyBill')] = 510;
    x0[idx('systemSizeKw')] = 13.1;
    const x5 = advanceCovariates(x0, 5);
    expect(x5[idx('monthlyBill')]).toBe(510);
    expect(x5[idx('systemSizeKw')]).toBe(13.1);
  });

  it('does not mutate its input (purity)', () => {
    const x0 = zeroVector();
    const snapshot = x0.slice();
    advanceCovariates(x0, 7);
    expect(x0).toEqual(snapshot);
  });

  it('periods=0 returns an equal but distinct array', () => {
    const x0 = zeroVector();
    x0[idx('daysInPipeline')] = 4;
    const out = advanceCovariates(x0, 0);
    expect(out).toEqual(x0);
    expect(out).not.toBe(x0);
  });

  it('daysToNextAction decreases (delta -1) as the clock advances', () => {
    const x0 = zeroVector();
    x0[idx('daysToNextAction')] = 5;
    const out = advanceCovariates(x0, 4);
    expect(out[idx('daysToNextAction')]).toBe(1);
  });
});

describe('expandToPersonPeriods', () => {
  const baseTimeline = (over: Partial<LeadTimeline>): LeadTimeline => ({
    leadId: 'lead-1',
    x0: zeroVector(),
    terminal: 'censored',
    daysObserved: 5,
    synthetic: true,
    ...over,
  });

  it('emits no rows when daysObserved <= 0', () => {
    expect(expandToPersonPeriods(baseTimeline({ daysObserved: 0 }))).toEqual([]);
    expect(expandToPersonPeriods(baseTimeline({ daysObserved: -3 }))).toEqual(
      []
    );
  });

  it('emits exactly daysObserved rows with sequential t', () => {
    const rows = expandToPersonPeriods(baseTimeline({ daysObserved: 4 }));
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.t)).toEqual([0, 1, 2, 3]);
  });

  it('censored timeline → every period is stay', () => {
    const rows = expandToPersonPeriods(
      baseTimeline({ terminal: 'censored', daysObserved: 3 })
    );
    expect(rows.every((r) => r.outcome === 'stay')).toBe(true);
  });

  it('sign timeline → absorbing outcome only on the final period', () => {
    const rows = expandToPersonPeriods(
      baseTimeline({ terminal: 'sign', daysObserved: 4 })
    );
    expect(rows.slice(0, 3).every((r) => r.outcome === 'stay')).toBe(true);
    expect(rows[3].outcome).toBe('sign');
  });

  it('ghost timeline → absorbing outcome only on the final period', () => {
    const rows = expandToPersonPeriods(
      baseTimeline({ terminal: 'ghost', daysObserved: 2 })
    );
    expect(rows[0].outcome).toBe('stay');
    expect(rows[1].outcome).toBe('ghost');
  });

  it('a single-day sign timeline absorbs immediately', () => {
    const rows = expandToPersonPeriods(
      baseTimeline({ terminal: 'sign', daysObserved: 1 })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('sign');
  });

  it('covariates roll forward with advanceCovariates per period', () => {
    const x0 = zeroVector();
    x0[idx('daysInPipeline')] = 0;
    const rows = expandToPersonPeriods(
      baseTimeline({ x0, terminal: 'censored', daysObserved: 3 })
    );
    expect(rows[0].x[idx('daysInPipeline')]).toBe(0);
    expect(rows[1].x[idx('daysInPipeline')]).toBe(1);
    expect(rows[2].x[idx('daysInPipeline')]).toBe(2);
    // each row has a full-length vector
    expect(rows.every((r) => r.x.length === FEATURE_COUNT)).toBe(true);
  });

  it('propagates leadId and synthetic flag', () => {
    const rows = expandToPersonPeriods(
      baseTimeline({ leadId: 'noah', synthetic: false, daysObserved: 2 })
    );
    expect(rows.every((r) => r.leadId === 'noah')).toBe(true);
    expect(rows.every((r) => r.synthetic === false)).toBe(true);
  });
});
