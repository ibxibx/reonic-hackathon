import { describe, it, expect } from 'vitest';
import { BLOCKER_TAXONOMY, blockerCodeEnum } from './blocker-taxonomy';
import { BLOCKER_CODES } from '../oracle/contracts';

describe('BLOCKER_TAXONOMY', () => {
  it('has a non-empty name and definition for every contract code', () => {
    for (const code of BLOCKER_CODES) {
      const info = BLOCKER_TAXONOMY[code];
      expect(info, `missing taxonomy entry for ${code}`).toBeDefined();
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.definition.length).toBeGreaterThan(0);
    }
  });

  it('covers exactly the frozen code set (no extras, no gaps)', () => {
    const taxonomyKeys = Object.keys(BLOCKER_TAXONOMY).sort();
    const contractKeys = [...BLOCKER_CODES].sort();
    expect(taxonomyKeys).toEqual(contractKeys);
  });

  it('has the same number of entries as the frozen code set', () => {
    expect(Object.keys(BLOCKER_TAXONOMY)).toHaveLength(BLOCKER_CODES.length);
  });

  it('has no taxonomy key absent from the frozen code set (no extras)', () => {
    const frozen = new Set<string>(BLOCKER_CODES);
    for (const key of Object.keys(BLOCKER_TAXONOMY)) {
      expect(frozen.has(key), `taxonomy has extra code ${key}`).toBe(true);
    }
  });

  it('has no frozen code missing a taxonomy entry (no gaps)', () => {
    const taxonomyKeys = new Set(Object.keys(BLOCKER_TAXONOMY));
    for (const code of BLOCKER_CODES) {
      expect(taxonomyKeys.has(code), `taxonomy missing code ${code}`).toBe(true);
    }
  });

  it('has trimmed, non-blank name and definition for every code', () => {
    for (const code of BLOCKER_CODES) {
      const info = BLOCKER_TAXONOMY[code];
      expect(info.name.trim().length, `blank name for ${code}`).toBeGreaterThan(
        0
      );
      expect(
        info.definition.trim().length,
        `blank definition for ${code}`
      ).toBeGreaterThan(0);
    }
  });
});

describe('blockerCodeEnum', () => {
  it('accepts every contract code', () => {
    for (const code of BLOCKER_CODES) {
      const result = blockerCodeEnum.safeParse(code);
      expect(result.success, `enum rejected valid code ${code}`).toBe(true);
    }
  });

  it('rejects an unknown code', () => {
    expect(blockerCodeEnum.safeParse('ZZ').success).toBe(false);
  });
});
