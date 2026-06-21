import { describe, it, expect } from 'vitest';
import { generateSyntheticCorpus, mulberry32 } from './synthetic';
import { FEATURE_COUNT, TERMINAL_OUTCOMES } from './contracts';
import type { SyntheticCorpus, SyntheticRegime } from './contracts';
import { CHURN_DATA } from './churn-prior';

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

// ─── Real-rate-anchored sanity check ────────────────────────────────────────
//
// HONESTY NOTE: this is a LOOSE SANITY BAND on a SYNTHETIC corpus, NOT a claim
// that the synthetic process reproduces real solar outcomes. The anchor is
// CHURN_DATA.telcoBaseChurn (= 0.265), a REAL telecom subscription-churn base
// rate [IBM "Telco Customer Churn", 7,043 customers] used in churn-prior.ts as
// a cross-domain PRIOR for the ghost hazard. We only assert that ONE configured
// regime ('high-sign') can land its terminal ghost share in a realistic band
// AROUND that cited proxy rate (0.20–0.35) — evidence the latent generator can
// be tuned to plausible real-world magnitudes, never that it IS calibrated to
// solar labels. The 'balanced'/'high-ghost' regimes intentionally sit far above
// this band (they stress-test the high-ghost side), so they are NOT anchored.
describe('generateSyntheticCorpus — real-rate-anchored ghost-share sanity', () => {
  // Wide band around the cited telecom proxy: ±~0.07 of telcoBaseChurn (0.265).
  const LOWER = 0.2;
  const UPPER = 0.35;

  it('cited anchor (telcoBaseChurn) sits inside the sanity band', () => {
    // Documents that the band is centered on the REAL proxy rate we anchor to.
    expect(CHURN_DATA.telcoBaseChurn).toBeGreaterThanOrEqual(LOWER);
    expect(CHURN_DATA.telcoBaseChurn).toBeLessThanOrEqual(UPPER);
  });

  it("the 'high-sign' regime's terminal ghost share lands near the cited base rate", () => {
    // Empirically (sweep of 80 seeds, nLeads=400, maxDays=60): high-sign ghost
    // share ∈ [0.212, 0.307], mean ≈ 0.261 ≈ telcoBaseChurn (0.265). A large
    // corpus + representative seed keeps this a stable, non-flaky check.
    const corpus = generateSyntheticCorpus({
      seed: 123,
      nLeads: 600,
      maxDays: 60,
      regime: 'high-sign',
    });
    const g = ghostShare(corpus);
    expect(g).toBeGreaterThanOrEqual(LOWER);
    expect(g).toBeLessThanOrEqual(UPPER);
    // And it tracks the cited proxy reasonably closely (loose, synthetic).
    expect(Math.abs(g - CHURN_DATA.telcoBaseChurn)).toBeLessThan(0.1);
  });

  it("'high-sign' stays in-band across many seeds (loose synthetic sanity)", () => {
    // Robustness: the band must hold for EVERY seed, not just the headline one.
    for (const seed of [3, 17, 58, 123, 271, 404, 911, 1492, 2718, 5150]) {
      const corpus = generateSyntheticCorpus({
        seed,
        nLeads: 500,
        maxDays: 60,
        regime: 'high-sign',
      });
      const g = ghostShare(corpus);
      expect(g, `seed=${seed} ghost-share=${g}`).toBeGreaterThanOrEqual(LOWER);
      expect(g, `seed=${seed} ghost-share=${g}`).toBeLessThanOrEqual(UPPER);
    }
  });

  it('the high-ghost/balanced regimes are intentionally ABOVE the band (not anchored)', () => {
    // Guards the honesty framing: only high-sign is anchored to the proxy rate;
    // the other regimes stress the ghost side well past any realistic base rate.
    const balanced = generateSyntheticCorpus({
      seed: 42,
      nLeads: 500,
      maxDays: 60,
      regime: 'balanced',
    });
    const highGhost = generateSyntheticCorpus({
      seed: 42,
      nLeads: 500,
      maxDays: 60,
      regime: 'high-ghost',
    });
    expect(ghostShare(balanced)).toBeGreaterThan(UPPER);
    expect(ghostShare(highGhost)).toBeGreaterThan(UPPER);
  });
});

// ─── Fuzz / property tests across many seeds ────────────────────────────────
//
// Structural invariants that must hold for EVERY seed × regime, independent of
// the random draw. These are the contracts downstream fitters (A2/A3) rely on.
describe('generateSyntheticCorpus — fuzz/property invariants over many seeds', () => {
  const REGIMES: readonly SyntheticRegime[] = [
    'balanced',
    'high-ghost',
    'high-sign',
  ];
  // A spread of seeds (incl. 0 and large values) to exercise the RNG broadly.
  const SEEDS = [0, 1, 2, 3, 5, 8, 13, 21, 100, 999, 31337, 2 ** 31 - 1];

  it('is deterministic: same {seed,nLeads,maxDays,regime} → deep-equal corpus', () => {
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const a = generateSyntheticCorpus({ seed, nLeads: 40, maxDays: 12, regime });
        const b = generateSyntheticCorpus({ seed, nLeads: 40, maxDays: 12, regime });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it('every person-period row.x has length === FEATURE_COUNT', () => {
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const c = generateSyntheticCorpus({ seed, nLeads: 50, maxDays: 15, regime });
        expect(c.rows.length).toBeGreaterThan(0);
        for (const r of c.rows) {
          expect(r.x).toHaveLength(FEATURE_COUNT);
          expect(r.x.every((v) => Number.isFinite(v))).toBe(true);
        }
      }
    }
  });

  it('label snapshot vectors have length === FEATURE_COUNT and finite entries', () => {
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const c = generateSyntheticCorpus({ seed, nLeads: 50, maxDays: 15, regime });
        for (const l of c.labels) {
          expect(l.features).toHaveLength(FEATURE_COUNT);
          expect(l.features.every((v) => Number.isFinite(v))).toBe(true);
        }
      }
    }
  });

  it('emits NO rows after absorption: per-lead t is 0..k contiguous, only final row absorbs', () => {
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const c = generateSyntheticCorpus({ seed, nLeads: 50, maxDays: 15, regime });
        const byLead = new Map<string, typeof c.rows>();
        for (const r of c.rows) {
          const arr = byLead.get(r.leadId) ?? [];
          arr.push(r);
          byLead.set(r.leadId, arr);
        }
        for (const [, rows] of byLead) {
          const sorted = rows.slice().sort((x, y) => x.t - y.t);
          sorted.forEach((r, i) => expect(r.t).toBe(i));
          // Any sign/ghost may appear ONLY on the final row.
          sorted.slice(0, -1).forEach((r) => expect(r.outcome).toBe('stay'));
        }
      }
    }
  });

  it('labels.length === nLeads and rows count === Σ daysObserved (no orphans)', () => {
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const nLeads = 37; // odd count, not a default
        const c = generateSyntheticCorpus({ seed, nLeads, maxDays: 15, regime });
        expect(c.labels).toHaveLength(nLeads);
        const counts = new Map<string, number>();
        for (const r of c.rows) {
          counts.set(r.leadId, (counts.get(r.leadId) ?? 0) + 1);
        }
        const expectedRows = c.labels.reduce((s, l) => s + l.daysObserved, 0);
        expect(c.rows).toHaveLength(expectedRows);
        for (const l of c.labels) {
          expect(counts.get(l.leadId) ?? 0).toBe(l.daysObserved);
        }
      }
    }
  });

  it('every terminal is a valid TERMINAL_OUTCOMES code; shares form a valid distribution', () => {
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const c = generateSyntheticCorpus({ seed, nLeads: 200, maxDays: 20, regime });
        let g = 0;
        let s = 0;
        let cen = 0;
        for (const l of c.labels) {
          expect(TERMINAL_OUTCOMES).toContain(l.terminal);
          if (l.terminal === 'ghost') g++;
          else if (l.terminal === 'sign') s++;
          else cen++;
        }
        const n = c.labels.length;
        expect(g + s + cen).toBe(n);
        const dist = [g / n, s / n, cen / n];
        // Valid probability vector: each in [0,1], summing to 1.
        for (const p of dist) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
        expect(dist[0] + dist[1] + dist[2]).toBeCloseTo(1, 9);
      }
    }
  });

  it('daysObserved is in [1, maxDays] for every lead, == maxDays exactly when censored', () => {
    const maxDays = 18;
    for (const regime of REGIMES) {
      for (const seed of SEEDS) {
        const c = generateSyntheticCorpus({ seed, nLeads: 80, maxDays, regime });
        for (const l of c.labels) {
          expect(l.daysObserved).toBeGreaterThanOrEqual(1);
          expect(l.daysObserved).toBeLessThanOrEqual(maxDays);
          if (l.terminal === 'censored') {
            expect(l.daysObserved).toBe(maxDays);
          }
        }
      }
    }
  });

  it('leadIds are unique and tag both seed and regime-independent index', () => {
    for (const regime of REGIMES) {
      const seed = 12321;
      const c = generateSyntheticCorpus({ seed, nLeads: 60, maxDays: 10, regime });
      const ids = new Set(c.labels.map((l) => l.leadId));
      expect(ids.size).toBe(c.labels.length);
      // Provenance: id carries the seed so synthetic rows are unambiguous.
      expect(c.labels.every((l) => l.leadId.startsWith(`syn-${seed}-`))).toBe(true);
    }
  });

  it('different seeds almost always yield different corpora (RNG actually varies)', () => {
    for (const regime of REGIMES) {
      const a = generateSyntheticCorpus({ seed: 101, nLeads: 60, maxDays: 12, regime });
      const b = generateSyntheticCorpus({ seed: 202, nLeads: 60, maxDays: 12, regime });
      expect(JSON.stringify(a.rows)).not.toBe(JSON.stringify(b.rows));
    }
  });
});
