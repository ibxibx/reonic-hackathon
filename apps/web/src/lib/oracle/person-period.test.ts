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
import { mulberry32 } from './synthetic';

function zeroVector(): number[] {
  return Array.from({ length: FEATURE_COUNT }, () => 0);
}

const idx = (name: string) => FEATURE_NAMES.indexOf(name as never);

/** Deterministic random RAW vector of length FEATURE_COUNT in [-50, 50). */
function randomVector(rng: () => number): number[] {
  return Array.from({ length: FEATURE_COUNT }, () => rng() * 100 - 50);
}

const TIME_VARYING_NAMES = new Set<string>(
  TIME_VARYING_FEATURES.map((f) => f.name)
);
/** Indices NOT touched by advanceCovariates — must be copied verbatim. */
const STATIC_INDICES = FEATURE_NAMES.map((_, i) => i).filter(
  (i) => !TIME_VARYING_NAMES.has(FEATURE_NAMES[i])
);

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

// ─── advanceCovariates: algebraic properties ────────────────────────────────
describe('advanceCovariates — algebraic properties', () => {
  const rng = mulberry32(0xc0ffee);

  it('is additive over periods: advance(x, a+b) == advance(advance(x, a), b)', () => {
    for (let trial = 0; trial < 25; trial++) {
      const x = randomVector(rng);
      const a = Math.floor(rng() * 30);
      const b = Math.floor(rng() * 30);
      const direct = advanceCovariates(x, a + b);
      const composed = advanceCovariates(advanceCovariates(x, a), b);
      direct.forEach((v, i) => expect(composed[i]).toBeCloseTo(v, 9));
    }
  });

  it('is linear in periods: each time-varying slot == base + delta*periods', () => {
    for (let trial = 0; trial < 25; trial++) {
      const x = randomVector(rng);
      const periods = Math.floor(rng() * 60);
      const out = advanceCovariates(x, periods);
      for (const { name, perPeriodDelta } of TIME_VARYING_FEATURES) {
        const i = idx(name);
        expect(out[i]).toBeCloseTo(x[i] + perPeriodDelta * periods, 6);
      }
    }
  });

  it('leaves every static slot byte-identical', () => {
    for (let trial = 0; trial < 25; trial++) {
      const x = randomVector(rng);
      const out = advanceCovariates(x, Math.floor(rng() * 40));
      for (const i of STATIC_INDICES) expect(out[i]).toBe(x[i]);
    }
  });

  it('negative periods invert positive periods exactly', () => {
    const x = randomVector(rng);
    const forward = advanceCovariates(x, 9);
    const back = advanceCovariates(forward, -9);
    back.forEach((v, i) => expect(v).toBeCloseTo(x[i], 9));
  });

  it('returns a fresh array of the same length, never the input', () => {
    const x = randomVector(rng);
    const out = advanceCovariates(x, 3);
    expect(out).not.toBe(x);
    expect(out).toHaveLength(x.length);
  });

  it('preserves vectors longer/shorter than FEATURE_COUNT (defensive index guard)', () => {
    // Shorter than every time-varying index → nothing to advance, copy verbatim.
    const short = [1, 2];
    expect(advanceCovariates(short, 5)).toEqual([1, 2]);
    // Longer than FEATURE_COUNT → trailing extras copied unchanged.
    const long = [...zeroVector(), 7, 8, 9];
    const out = advanceCovariates(long, 2);
    expect(out.slice(FEATURE_COUNT)).toEqual([7, 8, 9]);
  });
});

// ─── expandToPersonPeriods ⇄ advanceCovariates round-trip ───────────────────
describe('expandToPersonPeriods — round-trips with advanceCovariates', () => {
  const rng = mulberry32(0x5eed);

  it('row t covariates exactly equal advanceCovariates(x0, t) for every t', () => {
    for (let trial = 0; trial < 30; trial++) {
      const x0 = randomVector(rng);
      const daysObserved = 1 + Math.floor(rng() * 20);
      const rows = expandToPersonPeriods({
        leadId: `l${trial}`,
        x0,
        terminal: 'censored',
        daysObserved,
        synthetic: true,
      });
      expect(rows).toHaveLength(daysObserved);
      rows.forEach((r) => {
        expect(r.t).toBeTypeOf('number');
        const expected = advanceCovariates(x0, r.t);
        r.x.forEach((v, i) => expect(v).toBe(expected[i]));
      });
    }
  });

  it('does not mutate the shared x0 across periods', () => {
    const x0 = randomVector(rng);
    const snapshot = x0.slice();
    expandToPersonPeriods({
      leadId: 'l',
      x0,
      terminal: 'sign',
      daysObserved: 12,
      synthetic: true,
    });
    expect(x0).toEqual(snapshot);
  });

  it('each row owns a distinct vector instance (no aliasing of x0)', () => {
    const x0 = zeroVector();
    const rows = expandToPersonPeriods({
      leadId: 'l',
      x0,
      terminal: 'censored',
      daysObserved: 4,
      synthetic: true,
    });
    for (const r of rows) expect(r.x).not.toBe(x0);
    // distinct from each other too (mutating one must not touch siblings)
    rows[0].x[0] = 999;
    expect(rows[1].x[0]).not.toBe(999);
  });
});

// ─── expandToPersonPeriods: outcome/absorption invariants over many shapes ──
describe('expandToPersonPeriods — absorption & censoring invariants', () => {
  const rng = mulberry32(0xa11ce);
  const terminals = ['sign', 'ghost', 'censored'] as const;

  it('absorbing outcome appears at most once and only on the final row', () => {
    for (let trial = 0; trial < 60; trial++) {
      const terminal = terminals[Math.floor(rng() * terminals.length)];
      const daysObserved = 1 + Math.floor(rng() * 25);
      const rows = expandToPersonPeriods({
        leadId: 'l',
        x0: zeroVector(),
        terminal,
        daysObserved,
        synthetic: true,
      });
      const absorbingRows = rows.filter((r) => r.outcome !== 'stay');
      if (terminal === 'censored') {
        expect(absorbingRows).toHaveLength(0);
        expect(rows.every((r) => r.outcome === 'stay')).toBe(true);
      } else {
        expect(absorbingRows).toHaveLength(1);
        expect(absorbingRows[0]).toBe(rows[rows.length - 1]);
        expect(absorbingRows[0].outcome).toBe(terminal);
        // every non-final row is stay
        expect(rows.slice(0, -1).every((r) => r.outcome === 'stay')).toBe(true);
      }
    }
  });

  it('t indices are 0..n-1 contiguous and strictly increasing for any shape', () => {
    for (let trial = 0; trial < 40; trial++) {
      const daysObserved = 1 + Math.floor(rng() * 30);
      const rows = expandToPersonPeriods({
        leadId: 'l',
        x0: zeroVector(),
        terminal: terminals[Math.floor(rng() * terminals.length)],
        daysObserved,
        synthetic: true,
      });
      expect(rows.map((r) => r.t)).toEqual(
        Array.from({ length: daysObserved }, (_, i) => i)
      );
    }
  });

  it('censored == sign/ghost in every respect except the final outcome', () => {
    const x0 = randomVector(rng);
    const common = { leadId: 'l', x0, daysObserved: 7, synthetic: true } as const;
    const cens = expandToPersonPeriods({ ...common, terminal: 'censored' });
    const sign = expandToPersonPeriods({ ...common, terminal: 'sign' });
    expect(sign).toHaveLength(cens.length);
    sign.forEach((r, i) => {
      expect(r.t).toBe(cens[i].t);
      expect(r.x).toEqual(cens[i].x);
      if (i < sign.length - 1) expect(r.outcome).toBe(cens[i].outcome);
    });
    expect(sign[sign.length - 1].outcome).toBe('sign');
    expect(cens[cens.length - 1].outcome).toBe('stay');
  });
});

// ─── expandToPersonPeriods: daysObserved bounds & degenerate inputs ─────────
describe('expandToPersonPeriods — daysObserved bounds & degenerate inputs', () => {
  const base = (over: Partial<LeadTimeline>): LeadTimeline => ({
    leadId: 'l',
    x0: zeroVector(),
    terminal: 'sign',
    daysObserved: 5,
    synthetic: true,
    ...over,
  });

  it('row count equals floor(daysObserved) for positive integers', () => {
    for (let d = 1; d <= 10; d++) {
      expect(expandToPersonPeriods(base({ daysObserved: d }))).toHaveLength(d);
    }
  });

  it('fractional daysObserved floors to whole periods AND keeps the absorption', () => {
    // Regression: a fractional lastIndex must not strand the absorbing outcome.
    const rows = expandToPersonPeriods(
      base({ terminal: 'ghost', daysObserved: 3.9 })
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.t)).toEqual([0, 1, 2]);
    expect(rows.slice(0, -1).every((r) => r.outcome === 'stay')).toBe(true);
    expect(rows[2].outcome).toBe('ghost'); // not silently dropped to 'stay'
  });

  it('a fractional value in (0,1) yields no rows (floors to 0)', () => {
    expect(expandToPersonPeriods(base({ daysObserved: 0.9 }))).toEqual([]);
  });

  it('negative fractional daysObserved yields no rows', () => {
    expect(expandToPersonPeriods(base({ daysObserved: -0.5 }))).toEqual([]);
    expect(expandToPersonPeriods(base({ daysObserved: -7.2 }))).toEqual([]);
  });

  it('NaN daysObserved yields no rows (never an unbounded/garbage loop)', () => {
    expect(expandToPersonPeriods(base({ daysObserved: NaN }))).toEqual([]);
  });

  it('large daysObserved keeps t contiguous and the lone absorption last', () => {
    const n = 365;
    const rows = expandToPersonPeriods(base({ terminal: 'sign', daysObserved: n }));
    expect(rows).toHaveLength(n);
    expect(rows[0].t).toBe(0);
    expect(rows[n - 1].t).toBe(n - 1);
    expect(rows.filter((r) => r.outcome === 'sign')).toHaveLength(1);
    expect(rows[n - 1].outcome).toBe('sign');
    // last-period clock advanced by exactly n-1 periods
    const last = rows[n - 1];
    expect(last.x[idx('daysInPipeline')]).toBe(n - 1);
    expect(last.x[idx('daysToNextAction')]).toBe(-(n - 1));
  });

  it('single-period censored lead is one stay row at t=0', () => {
    const rows = expandToPersonPeriods(
      base({ terminal: 'censored', daysObserved: 1 })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ t: 0, outcome: 'stay' });
  });
});
