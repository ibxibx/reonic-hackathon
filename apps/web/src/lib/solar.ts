/**
 * Shared domain constants for the Solar AI Sales Copilot (RayCiprocity).
 * Kept as plain string-literal unions so they don't depend on the generated
 * database enum types (which are regenerated via `pnpm gen-types-local`).
 */

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'negotiating',
  'closed',
  'ghosted',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ROOF_TYPES = ['shingle', 'tile', 'metal', 'flat', 'other'] as const;
export type RoofType = (typeof ROOF_TYPES)[number];

export const FINANCING_TYPES = ['cash', 'loan', 'lease', 'PPA'] as const;
export type FinancingType = (typeof FINANCING_TYPES)[number];

export const PERSONAS = [
  'family',
  'investor',
  'environmentalist',
  'skeptic',
] as const;
export type Persona = (typeof PERSONAS)[number];

export const MESSAGE_CHANNELS = ['email', 'sms', 'call', 'voice'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_STATUSES = ['draft', 'sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

// ---- Status badge styling (dark-first, high contrast) ----
export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  new: {
    label: 'New',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  contacted: {
    label: 'Contacted',
    className: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  },
  negotiating: {
    label: 'Negotiating',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  closed: {
    label: 'Closed',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  ghosted: {
    label: 'Ghosted',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
};

export const MESSAGE_STATUS_CONFIG: Record<
  MessageStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground border-border',
  },
  sent: {
    label: 'Sent',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
};

// ---- Persona styling ----
export const PERSONA_CONFIG: Record<
  Persona,
  { label: string; className: string; description: string }
> = {
  family: {
    label: 'Family',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    description: 'Values stability, savings and protecting their household.',
  },
  investor: {
    label: 'Investor',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    description: 'Focused on ROI, payback period and asset value.',
  },
  environmentalist: {
    label: 'Environmentalist',
    className: 'bg-teal-400/15 text-teal-300 border-teal-400/30',
    description: 'Motivated by sustainability and carbon impact.',
  },
  skeptic: {
    label: 'Skeptic',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
    description: 'Needs proof, transparency and risk reassurance.',
  },
};

// ---- Channel (timeline step) config ----
// icon names map to lucide-react icons; resolved in client components.
export const CHANNEL_CONFIG: Record<
  MessageChannel,
  { label: string; icon: 'Mail' | 'MessageSquare' | 'Phone' | 'Mic' }
> = {
  email: { label: 'Email', icon: 'Mail' },
  sms: { label: 'SMS', icon: 'MessageSquare' },
  call: { label: 'Call', icon: 'Phone' },
  voice: { label: 'Voice Note', icon: 'Mic' },
};

export const ROOF_TYPE_LABELS: Record<RoofType, string> = {
  shingle: 'Shingle',
  tile: 'Tile',
  metal: 'Metal',
  flat: 'Flat',
  other: 'Other',
};

export const FINANCING_TYPE_LABELS: Record<FinancingType, string> = {
  cash: 'Cash',
  loan: 'Loan',
  lease: 'Lease',
  PPA: 'PPA',
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Derived solar economics (A1) ───────────────────────────────────────────
//
// A deliberately rough, transparent economics model. No tariff/rate data exists
// in this dataset, so the two driving constants below are documented ASSUMPTIONS,
// not measurements. They give a consistent, monotonic ordering of leads by
// payback / savings / ROI — which is all the Oracle needs as covariates.

/** Assumed blended retail electricity price ($/kWh). */
export const ELECTRICITY_PRICE = 0.16;
/** Assumed annual production per installed kW (kWh/kW/yr) for a typical site. */
export const PRODUCTION_PER_KW = 1300;
/** Horizon used for the rough lifetime-ROI ratio. */
export const ROI_HORIZON_YEARS = 25;

/** Output of the derived-economics layer (mirrors contracts.SolarEconomics). */
export interface SolarEconomics {
  costPerKw: number;
  simplePaybackYears: number;
  estMonthlySavings: number;
  monthlySavingsRatio: number;
  roi25yrRatio: number;
  financingAdjustedUpfront: number;
}

export interface EconomicsInput {
  monthlyBill: number;
  systemSizeKw: number;
  totalCost: number;
  financingType: FinancingType | string;
}

/** Clamp `v` to the inclusive range [lo, hi]. Pure helper. */
export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Estimated gross dollar value of the energy a system produces in one year,
 * before capping by the customer's actual bill. Guarded for non-positive size.
 */
export function annualProductionValue(systemSizeKw: number): number {
  if (systemSizeKw <= 0) return 0;
  return systemSizeKw * PRODUCTION_PER_KW * ELECTRICITY_PRICE;
}

/**
 * Upfront cash the customer actually has to put down given the financing path.
 *  - cash → full system cost
 *  - loan / lease / PPA → ~0 down (financed)
 *  - anything else / unknown → conservative: assume full cost
 */
export function financingAdjustedUpfront(
  totalCost: number,
  financingType: FinancingType | string
): number {
  switch (financingType) {
    case 'loan':
    case 'lease':
    case 'PPA':
      return 0;
    case 'cash':
      return totalCost;
    default:
      return totalCost;
  }
}

/**
 * Compute the derived economics for a lead/quote. Pure and division-guarded.
 * Reused by BOTH synthetic corpus generation and live feature assembly so the
 * economics covariates are identical at train and inference time.
 */
export function computeSolarEconomics(input: EconomicsInput): SolarEconomics {
  const { monthlyBill, systemSizeKw, totalCost, financingType } = input;

  const costPerKw = systemSizeKw > 0 ? totalCost / systemSizeKw : 0;

  const grossAnnualValue = annualProductionValue(systemSizeKw);
  const annualBill = monthlyBill * 12;
  // You never save more than you currently spend on electricity.
  const annualSavings = Math.min(grossAnnualValue, annualBill);

  const estMonthlySavings = annualSavings / 12;

  const monthlySavingsRatio =
    monthlyBill > 0 ? clamp(estMonthlySavings / monthlyBill, 0, 1.5) : 0;

  const roi25yrRatio =
    totalCost > 0 ? (annualSavings * ROI_HORIZON_YEARS) / totalCost : 0;

  const upfront = financingAdjustedUpfront(totalCost, financingType);

  // Payback is on the full system cost (capital recovery), guarded for zero
  // savings (a system that saves nothing never pays back → sentinel 99 years).
  const simplePaybackYears = annualSavings > 0 ? totalCost / annualSavings : 99;

  return {
    costPerKw,
    simplePaybackYears,
    estMonthlySavings,
    monthlySavingsRatio,
    roi25yrRatio,
    financingAdjustedUpfront: upfront,
  };
}
