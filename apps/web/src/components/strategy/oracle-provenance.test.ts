import { describe, expect, it } from 'vitest';
import { getGhostProvenance } from './oracle-provenance';

describe('getGhostProvenance', () => {
  it('calibrated=true → no caption, no churn blend, honest calibrated tooltip', () => {
    const p = getGhostProvenance(true, 'model');
    expect(p.calibrated).toBe(true);
    expect(p.blendedWithChurnPrior).toBe(false);
    expect(p.caption).toBe('');
    expect(p.tooltip).toMatch(/calibrated/i);
    expect(p.tooltip).toMatch(/real absorbed/i);
  });

  it('uncalibrated model mode → churn-blended caption + synthetic-corpus tooltip', () => {
    const p = getGhostProvenance(false, 'model');
    expect(p.calibrated).toBe(false);
    expect(p.mode).toBe('model');
    expect(p.blendedWithChurnPrior).toBe(true);
    expect(p.caption).toMatch(/real-world churn benchmarks/i);
    expect(p.caption).toMatch(/uncalibrated/i);
    expect(p.tooltip).toMatch(/synthetic/i);
    expect(p.tooltip).toMatch(/uncalibrated/i);
  });

  it('uncalibrated degraded mode → churn-blended caption + heuristic tooltip', () => {
    const p = getGhostProvenance(false, 'degraded');
    expect(p.blendedWithChurnPrior).toBe(true);
    expect(p.mode).toBe('degraded');
    expect(p.caption).toMatch(/real-world churn benchmarks/i);
    expect(p.tooltip).toMatch(/heuristic/i);
    expect(p.tooltip).toMatch(/uncalibrated/i);
  });

  it('HONESTY: benchmarks are explicitly NOT presented as measured solar data', () => {
    for (const mode of ['model', 'degraded'] as const) {
      const p = getGhostProvenance(false, mode);
      // benchmarks are explicitly disclaimed as "not measured solar data"
      expect(p.tooltip).toMatch(/not measured solar data/i);
      // and explicitly named as benchmarks / a cross-domain prior
      expect(p.tooltip).toMatch(/benchmarks|prior/i);
      // it must never CLAIM the churn benchmarks ARE this installer's solar
      // outcomes (the disclaimer pattern, not the bare phrase, is what matters)
      expect(p.tooltip.toLowerCase()).not.toMatch(
        /benchmarks?[^.]*\bare\b[^.]*solar outcomes/
      );
      expect(p.tooltip.toLowerCase()).not.toContain('measured solar outcomes');
    }
  });

  it('HONESTY: non-boolean calibrated defaults to UNCALIBRATED (never silently calibrated)', () => {
    for (const bad of [undefined, null, 'true', 1, 0, {}, []] as unknown[]) {
      const p = getGhostProvenance(bad, 'model');
      expect(p.calibrated).toBe(false);
      expect(p.blendedWithChurnPrior).toBe(true);
      expect(p.caption).toMatch(/uncalibrated/i);
    }
  });

  it('unknown / garbage mode → uncalibrated still gets a caption, mode normalized', () => {
    for (const bad of [undefined, null, 'weird', 42, {}] as unknown[]) {
      const p = getGhostProvenance(false, bad);
      expect(p.mode).toBe('unknown');
      expect(p.blendedWithChurnPrior).toBe(true);
      expect(p.caption).toMatch(/real-world churn benchmarks/i);
      // unknown mode falls back to the model-style (synthetic) tooltip wording
      expect(p.tooltip).toMatch(/synthetic/i);
    }
  });

  it('is pure: identical inputs yield identical descriptors', () => {
    expect(getGhostProvenance(false, 'model')).toEqual(
      getGhostProvenance(false, 'model')
    );
  });

  it('never throws on any input shape', () => {
    const inputs: unknown[] = [undefined, null, NaN, '', 'x', 0, 1, {}, [], Symbol('s')];
    for (const a of inputs) {
      for (const b of inputs) {
        expect(() => getGhostProvenance(a, b)).not.toThrow();
      }
    }
  });
});
