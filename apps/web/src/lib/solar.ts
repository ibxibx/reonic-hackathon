/**
 * Shared domain constants for the Solar AI Sales Copilot (SunSync).
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
