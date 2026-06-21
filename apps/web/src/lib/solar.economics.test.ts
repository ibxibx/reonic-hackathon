import { describe, it, expect } from 'vitest';
import {
  computeSolarEconomics,
  annualProductionValue,
  financingAdjustedUpfront,
  clamp,
  ELECTRICITY_PRICE,
  PRODUCTION_PER_KW,
  ROI_HORIZON_YEARS,
  type EconomicsInput,
  type SolarEconomics,
} from './solar';

const base: EconomicsInput = {
  monthlyBill: 200,
  systemSizeKw: 10,
  totalCost: 30_000,
  financingType: 'cash',
};

describe('clamp', () => {
  it('clamps below, within, and above range', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
  });
});

describe('annualProductionValue', () => {
  it('is zero for non-positive system size', () => {
    expect(annualProductionValue(0)).toBe(0);
    expect(annualProductionValue(-5)).toBe(0);
  });

  it('matches size * PRODUCTION_PER_KW * ELECTRICITY_PRICE', () => {
    expect(annualProductionValue(10)).toBeCloseTo(
      10 * PRODUCTION_PER_KW * ELECTRICITY_PRICE,
      6
    );
  });
});

describe('financingAdjustedUpfront', () => {
  it('cash requires full cost', () => {
    expect(financingAdjustedUpfront(30_000, 'cash')).toBe(30_000);
  });

  it('loan / lease / PPA require ~0 down', () => {
    expect(financingAdjustedUpfront(30_000, 'loan')).toBe(0);
    expect(financingAdjustedUpfront(30_000, 'lease')).toBe(0);
    expect(financingAdjustedUpfront(30_000, 'PPA')).toBe(0);
  });

  it('unknown financing falls back to full cost (conservative)', () => {
    expect(financingAdjustedUpfront(30_000, 'mystery')).toBe(30_000);
  });
});

describe('computeSolarEconomics — known values', () => {
  it('computes the documented model for a representative lead', () => {
    const econ = computeSolarEconomics(base);
    // gross annual value = 10 * 1300 * 0.16 = 2080
    const gross = 10 * PRODUCTION_PER_KW * ELECTRICITY_PRICE;
    const annualBill = 200 * 12; // 2400
    const annualSavings = Math.min(gross, annualBill); // 2080
    expect(econ.costPerKw).toBeCloseTo(3000, 6);
    expect(econ.estMonthlySavings).toBeCloseTo(annualSavings / 12, 6);
    expect(econ.monthlySavingsRatio).toBeCloseTo(
      annualSavings / 12 / 200,
      6
    );
    expect(econ.roi25yrRatio).toBeCloseTo(
      (annualSavings * ROI_HORIZON_YEARS) / 30_000,
      6
    );
    expect(econ.financingAdjustedUpfront).toBe(30_000);
    expect(econ.simplePaybackYears).toBeCloseTo(30_000 / annualSavings, 6);
  });

  it('caps savings at the annual bill when production value exceeds it', () => {
    // tiny bill, big system → savings capped at bill
    const econ = computeSolarEconomics({
      monthlyBill: 50,
      systemSizeKw: 14,
      totalCost: 40_000,
      financingType: 'cash',
    });
    const annualBill = 50 * 12; // 600
    expect(econ.estMonthlySavings).toBeCloseTo(annualBill / 12, 6);
    // savings can't exceed the bill
    expect(econ.estMonthlySavings).toBeLessThanOrEqual(50);
  });
});

describe('computeSolarEconomics — guards', () => {
  it('zero system size → costPerKw 0 and no production', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 200,
      systemSizeKw: 0,
      totalCost: 30_000,
      financingType: 'cash',
    });
    expect(econ.costPerKw).toBe(0);
    expect(econ.estMonthlySavings).toBe(0);
    // no savings → sentinel payback
    expect(econ.simplePaybackYears).toBe(99);
    expect(econ.roi25yrRatio).toBe(0);
  });

  it('zero monthly bill → monthlySavingsRatio 0 (no division by zero)', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 0,
      systemSizeKw: 10,
      totalCost: 30_000,
      financingType: 'cash',
    });
    expect(econ.monthlySavingsRatio).toBe(0);
    expect(Number.isFinite(econ.monthlySavingsRatio)).toBe(true);
  });

  it('zero total cost → roi25yrRatio 0 and finite payback path', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 200,
      systemSizeKw: 10,
      totalCost: 0,
      financingType: 'cash',
    });
    expect(econ.roi25yrRatio).toBe(0);
    expect(Number.isFinite(econ.costPerKw)).toBe(true);
  });
});

describe('computeSolarEconomics — bounds', () => {
  it('monthlySavingsRatio is clamped to [0, 1.5]', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 1, // huge system relative to bill, but capped at bill anyway
      systemSizeKw: 14,
      totalCost: 40_000,
      financingType: 'cash',
    });
    expect(econ.monthlySavingsRatio).toBeGreaterThanOrEqual(0);
    expect(econ.monthlySavingsRatio).toBeLessThanOrEqual(1.5);
  });
});

describe('computeSolarEconomics — monotonicity', () => {
  it('higher total cost → higher costPerKw and longer payback', () => {
    const lo = computeSolarEconomics({ ...base, totalCost: 25_000 });
    const hi = computeSolarEconomics({ ...base, totalCost: 35_000 });
    expect(hi.costPerKw).toBeGreaterThan(lo.costPerKw);
    expect(hi.simplePaybackYears).toBeGreaterThan(lo.simplePaybackYears);
  });

  it('higher bill → savings non-decreasing (until production-capped)', () => {
    const lo = computeSolarEconomics({ ...base, monthlyBill: 100 });
    const hi = computeSolarEconomics({ ...base, monthlyBill: 300 });
    expect(hi.estMonthlySavings).toBeGreaterThanOrEqual(lo.estMonthlySavings);
  });

  it('loan financing lowers upfront vs cash for same cost', () => {
    const cash = computeSolarEconomics({ ...base, financingType: 'cash' });
    const loan = computeSolarEconomics({ ...base, financingType: 'loan' });
    expect(loan.financingAdjustedUpfront).toBeLessThan(
      cash.financingAdjustedUpfront
    );
  });
});

describe('computeSolarEconomics — extreme inputs stay finite & in-bounds', () => {
  /** Assert every numeric field is a finite number (no NaN/±Infinity). */
  function expectAllFinite(econ: SolarEconomics): void {
    for (const [key, v] of Object.entries(econ)) {
      expect(Number.isFinite(v), `${key} must be finite (got ${v})`).toBe(true);
    }
  }

  it('all-zero input stays finite with documented sentinels', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 0,
      systemSizeKw: 0,
      totalCost: 0,
      financingType: 'cash',
    });
    expectAllFinite(econ);
    expect(econ.costPerKw).toBe(0); // guarded size=0
    expect(econ.estMonthlySavings).toBe(0); // no production
    expect(econ.monthlySavingsRatio).toBe(0); // guarded bill=0
    expect(econ.roi25yrRatio).toBe(0); // guarded cost=0
    expect(econ.simplePaybackYears).toBe(99); // no-savings sentinel
    expect(econ.financingAdjustedUpfront).toBe(0);
  });

  it('size near zero (1e-9 kW) does not blow up costPerKw to Infinity', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 200,
      systemSizeKw: 1e-9,
      totalCost: 30_000,
      financingType: 'cash',
    });
    expectAllFinite(econ);
    // costPerKw is huge but must remain finite (size > 0 so the guard passes)
    expect(econ.costPerKw).toBeGreaterThan(0);
    // production is tiny-but-positive → payback is enormous yet FINITE (the
    // key invariant: no Infinity even when savings approach zero)
    expect(econ.simplePaybackYears).toBeGreaterThan(1e6);
    expect(Number.isFinite(econ.simplePaybackYears)).toBe(true);
    expect(econ.roi25yrRatio).toBeGreaterThanOrEqual(0);
    expect(econ.monthlySavingsRatio).toBeGreaterThanOrEqual(0);
    expect(econ.monthlySavingsRatio).toBeLessThanOrEqual(1.5);
  });

  it('huge total cost keeps every field finite and ratio in-bounds', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 200,
      systemSizeKw: 10,
      totalCost: 1e12, // absurd cost
      financingType: 'cash',
    });
    expectAllFinite(econ);
    expect(econ.costPerKw).toBeCloseTo(1e12 / 10, 0);
    // big cost vs small savings → enormous but finite payback, tiny ROI
    expect(econ.simplePaybackYears).toBeGreaterThan(0);
    expect(econ.roi25yrRatio).toBeGreaterThanOrEqual(0);
    expect(econ.roi25yrRatio).toBeLessThan(1); // savings dwarfed by cost
    expect(econ.monthlySavingsRatio).toBeGreaterThanOrEqual(0);
    expect(econ.monthlySavingsRatio).toBeLessThanOrEqual(1.5);
  });

  it('huge bill with modest system caps savings at production (ratio bounded)', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 100_000, // unrealistic bill
      systemSizeKw: 8,
      totalCost: 24_000,
      financingType: 'loan',
    });
    expectAllFinite(econ);
    // savings limited by production, so the ratio is well under 1
    expect(econ.monthlySavingsRatio).toBeGreaterThanOrEqual(0);
    expect(econ.monthlySavingsRatio).toBeLessThanOrEqual(1.5);
    expect(econ.financingAdjustedUpfront).toBe(0); // loan
  });

  it('negative inputs stay finite; ratios are guarded to 0', () => {
    const econ = computeSolarEconomics({
      monthlyBill: -200,
      systemSizeKw: -10,
      totalCost: -30_000,
      financingType: 'cash',
    });
    // Robustness contract: nothing blows up to NaN/Infinity on garbage input,
    // and the two guarded ratios collapse to 0 (bill<=0 and cost<=0 guards).
    expectAllFinite(econ);
    expect(econ.costPerKw).toBe(0); // size<=0 guard
    expect(econ.monthlySavingsRatio).toBe(0); // bill<=0 guard
    expect(econ.roi25yrRatio).toBe(0); // cost<=0 guard
  });

  it('unknown financing string keeps fields finite and falls back to full cost', () => {
    const econ = computeSolarEconomics({
      monthlyBill: 200,
      systemSizeKw: 10,
      totalCost: 30_000,
      financingType: 'crypto-barter',
    });
    expectAllFinite(econ);
    expect(econ.financingAdjustedUpfront).toBe(30_000);
  });
});
