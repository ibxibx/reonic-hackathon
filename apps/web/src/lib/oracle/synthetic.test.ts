import { describe, it, expect } from 'vitest';
import { generateSyntheticCorpus, mulberry32 } from './synthetic';
import { FEATURE_COUNT } from './contracts';
import type { SyntheticCorpus } from './contracts';

function ghostShare(corpus: SyntheticCorpus): number {
  const ghosts = corpus.labels.filter((l) => l.terminal === 'ghost').length;
  return ghosts / corpus.labels.length;
}
function signShare(corpus: SyntheticCorpus): number {
  const signs = corpus.labels.filter((l) => l.terminal === 'sign').length;
  return signs / corpus.labels.length;
}

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds give different streams', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });
});

describe('generateSyntheticCorpus — determinism', () => {
  it('same seed → deep-equal corpus', () => {
    const c1 = generateSyntheticCorpus({ seed: 42, nLeads: 50, maxDays: 20 });
    const c2 = generateSyntheticCorpus({ seed: 42, nLeads: 50, maxDays: 20 });
    expect(c1).toEqual(c2);
  });

  it('different seed → different corpus', () => {
    const c1 = generateSyntheticCorpus({ seed: 1, nLeads: 50, maxDays: 20 });
    const c2 = generateSyntheticCorpus({ seed: 2, nLeads: 50, maxDays: 20 });
    expect(c1).not.toEqual(c2);
  });
});

describe('generateSyntheticCorpus — shape & invariants', () => {
  const corpus = generateSyntheticCorpus({ seed: 99, nLeads: 80, maxDays: 25 });

  it('produces one label per lead', () => {
    expect(corpus.labels).toHaveLength(80);
  });

  it('every person-period row has a full-length raw vector', () => {
    expect(corpus.rows.length).toBeGreaterThan(0);
    expect(corpus.rows.every((r) => r.x.length === FEATURE_COUNT)).toBe(true);
  });

  it('every row is flagged synthetic', () => {
    expect(corpus.rows.every((r) => r.synthetic === true)).toBe(true);
  });

  it('label snapshots are full-length raw vectors', () => {
    expect(corpus.labels.every((l) => l.features.length === FEATURE_COUNT)).toBe(
      true
    );
  });

  it('echoes seed and regime', () => {
    expect(corpus.seed).toBe(99);
    expect(corpus.regime).toBe('balanced');
  });

  it('returns trueCoefficients = [signRow, ghostRow], each intercept+betas', () => {
    expect(corpus.trueCoefficients).toBeDefined();
    const tc = corpus.trueCoefficients!;
    expect(tc).toHaveLength(2);
    expect(tc[0]).toHaveLength(FEATURE_COUNT + 1);
    expect(tc[1]).toHaveLength(FEATURE_COUNT + 1);
  });

  it('emits no rows after a lead is absorbed (per-lead t is contiguous from 0)', () => {
    // group rows by lead, check t = 0..k and any sign/ghost is only the last
    const byLead = new Map<string, typeof corpus.rows>();
    for (const r of corpus.rows) {
      const arr = byLead.get(r.leadId) ?? [];
      arr.push(r);
      byLead.set(r.leadId, arr);
    }
    for (const [, rows] of byLead) {
      const sorted = rows.slice().sort((a, b) => a.t - b.t);
      // contiguous t starting at 0
      sorted.forEach((r, i) => expect(r.t).toBe(i));
      // absorbing outcomes only allowed on the final row
      sorted.slice(0, -1).forEach((r) => expect(r.outcome).toBe('stay'));
    }
  });

  it('a lead row count matches its daysObserved label', () => {
    const counts = new Map<string, number>();
    for (const r of corpus.rows) {
      counts.set(r.leadId, (counts.get(r.leadId) ?? 0) + 1);
    }
    for (const label of corpus.labels) {
      expect(counts.get(label.leadId) ?? 0).toBe(label.daysObserved);
    }
  });

  it('censored leads observe exactly maxDays periods', () => {
    const censored = corpus.labels.filter((l) => l.terminal === 'censored');
    expect(censored.every((l) => l.daysObserved === 25)).toBe(true);
  });
});

describe('generateSyntheticCorpus — regime shifts the terminal mix', () => {
  const N = 300;
  const D = 30;
  const high = generateSyntheticCorpus({
    seed: 7,
    nLeads: N,
    maxDays: D,
    regime: 'high-ghost',
  });
  const sign = generateSyntheticCorpus({
    seed: 7,
    nLeads: N,
    maxDays: D,
    regime: 'high-sign',
  });

  it('high-ghost has a larger ghost share than high-sign', () => {
    expect(ghostShare(high)).toBeGreaterThan(ghostShare(sign));
  });

  it('high-sign has a larger sign share than high-ghost', () => {
    expect(signShare(sign)).toBeGreaterThan(signShare(high));
  });
});

describe('generateSyntheticCorpus — defaults', () => {
  it('defaults to 400 leads, balanced regime', () => {
    const corpus = generateSyntheticCorpus({ seed: 5 });
    expect(corpus.labels).toHaveLength(400);
    expect(corpus.regime).toBe('balanced');
  });
});

function censoredShare(corpus: SyntheticCorpus): number {
  const c = corpus.labels.filter((l) => l.terminal === 'censored').length;
  return c / corpus.labels.length;
}

/** Group rows by lead and assert no row exists after the absorbing one. */
function assertNoRowsAfterAbsorption(corpus: SyntheticCorpus): void {
  const byLead = new Map<string, typeof corpus.rows>();
  for (const r of corpus.rows) {
    const arr = byLead.get(r.leadId) ?? [];
    arr.push(r);
    byLead.set(r.leadId, arr);
  }
  for (const [, rows] of byLead) {
    const sorted = rows.slice().sort((a, b) => a.t - b.t);
    // t contiguous from 0
    sorted.forEach((r, i) => expect(r.t).toBe(i));
    // absorbing outcomes can only ever be the final row
    sorted
      .slice(0, -1)
      .forEach((r) => expect(r.outcome).toBe('stay'));
  }
}

describe('generateSyntheticCorpus — censored-heavy (small maxDays)', () => {
  // With only 3 observation days and small per-day hazards (~exp(-3.5)), most
  // leads never absorb → high censored share, and no leftover rows after absorb.
  const corpus = generateSyntheticCorpus({
    seed: 314,
    nLeads: 300,
    maxDays: 3,
  });

  it('a clear majority of labels are censored', () => {
    expect(censoredShare(corpus)).toBeGreaterThan(0.7);
  });

  it('every censored lead observed exactly maxDays (=3) periods', () => {
    const censored = corpus.labels.filter((l) => l.terminal === 'censored');
    expect(censored.length).toBeGreaterThan(0);
    expect(censored.every((l) => l.daysObserved === 3)).toBe(true);
  });

  it('no person-period rows exist after a lead is absorbed', () => {
    assertNoRowsAfterAbsorption(corpus);
  });

  it('absorbed (sign|ghost) leads observed at most maxDays periods', () => {
    const absorbed = corpus.labels.filter((l) => l.terminal !== 'censored');
    expect(absorbed.every((l) => l.daysObserved >= 1 && l.daysObserved <= 3)).toBe(
      true
    );
  });

  it('total rows == sum of daysObserved across labels (no orphans)', () => {
    const expected = corpus.labels.reduce((s, l) => s + l.daysObserved, 0);
    expect(corpus.rows).toHaveLength(expected);
  });
});

describe('generateSyntheticCorpus — byte-identical determinism across regimes', () => {
  it('same seed reproduces a deep-equal corpus for every regime', () => {
    for (const regime of ['balanced', 'high-ghost', 'high-sign'] as const) {
      const a = generateSyntheticCorpus({
        seed: 2025,
        nLeads: 60,
        maxDays: 18,
        regime,
      });
      const b = generateSyntheticCorpus({
        seed: 2025,
        nLeads: 60,
        maxDays: 18,
        regime,
      });
      // Deep structural equality == byte-identical (no Date/Math.random leakage).
      expect(a).toEqual(b);
      // And exact JSON serialization equality as a stronger byte-level check.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('trueCoefficients are stable across runs (latent betas are pure)', () => {
    const a = generateSyntheticCorpus({ seed: 11, nLeads: 10, maxDays: 5 });
    const b = generateSyntheticCorpus({ seed: 11, nLeads: 10, maxDays: 5 });
    expect(a.trueCoefficients).toEqual(b.trueCoefficients);
  });
});

describe('generateSyntheticCorpus — terminal mix differs as expected by regime', () => {
  const N = 400;
  const D = 30;
  const seed = 4242;
  const high = generateSyntheticCorpus({
    seed,
    nLeads: N,
    maxDays: D,
    regime: 'high-ghost',
  });
  const sign = generateSyntheticCorpus({
    seed,
    nLeads: N,
    maxDays: D,
    regime: 'high-sign',
  });
  const balanced = generateSyntheticCorpus({
    seed,
    nLeads: N,
    maxDays: D,
    regime: 'balanced',
  });

  it('high-ghost yields more ghosts than signs within that regime', () => {
    expect(ghostShare(high)).toBeGreaterThan(signShare(high));
  });

  it('high-sign yields more signs than ghosts within that regime', () => {
    expect(signShare(sign)).toBeGreaterThan(ghostShare(sign));
  });

  it('balanced sits between the two for ghost share', () => {
    expect(ghostShare(balanced)).toBeLessThan(ghostShare(high));
    expect(ghostShare(balanced)).toBeGreaterThan(ghostShare(sign));
  });

  it('balanced sits between the two for sign share', () => {
    expect(signShare(balanced)).toBeGreaterThan(signShare(high));
    expect(signShare(balanced)).toBeLessThan(signShare(sign));
  });

  it('terminal shares form a valid distribution (sum to 1) in every regime', () => {
    for (const c of [high, sign, balanced]) {
      const total = ghostShare(c) + signShare(c) + censoredShare(c);
      expect(total).toBeCloseTo(1, 9);
    }
  });
});
