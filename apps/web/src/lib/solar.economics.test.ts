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
