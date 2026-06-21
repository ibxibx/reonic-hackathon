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
