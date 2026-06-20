import type { MessageChannel } from '@/lib/solar';

export const PROBLEM_CODES = [
  'P1',
  'P2',
  'F1',
  'F2',
  'T1',
  'T2',
  'C1',
  'C2',
  'S1',
  'S2',
  'E1',
  'E2',
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];
export type ProblemCodeFamily =
  | 'price'
  | 'finance'
  | 'trust'
  | 'comparison'
  | 'timing'
  | 'values';

export const PROBLEM_CODE_LIBRARY: Record<
  ProblemCode,
  {
    family: ProblemCodeFamily;
    label: string;
    counterStrategy: string;
    channel: MessageChannel;
    messageAngle: string;
  }
> = {
  P1: {
    family: 'price',
    label: 'Upfront price shock',
    counterStrategy: 'Make the investment scope and trade-offs transparent.',
    channel: 'email',
    messageAngle: 'Break down the quote without promising savings.',
  },
  P2: {
    family: 'price',
    label: 'Monthly affordability',
    counterStrategy: 'Clarify payment comfort against the current bill.',
    channel: 'sms',
    messageAngle: 'Ask which monthly-cost assumption needs clarification.',
  },
  F1: {
    family: 'finance',
    label: 'Financing fit',
    counterStrategy: 'Compare financing structures to the homeowner’s priorities.',
    channel: 'call',
    messageAngle: 'Offer a short financing-options walkthrough.',
  },
  F2: {
    family: 'finance',
    label: 'ROI and payback proof',
    counterStrategy: 'Show the assumptions behind the return case.',
    channel: 'email',
    messageAngle: 'Share a clear ROI and payback assumption summary.',
  },
  T1: {
    family: 'trust',
    label: 'Installer credibility',
    counterStrategy: 'Provide proof points and local references.',
    channel: 'voice',
    messageAngle: 'Offer relevant reference projects and a low-pressure review.',
  },
  T2: {
    family: 'trust',
    label: 'Roof or warranty risk',
    counterStrategy: 'Address installation protection and warranty questions directly.',
    channel: 'call',
    messageAngle: 'Walk through roof protection and warranty coverage.',
  },
  C1: {
    family: 'comparison',
    label: 'Quote comparison',
    counterStrategy: 'Give the homeowner a fair comparison framework.',
    channel: 'email',
    messageAngle: 'Offer an apples-to-apples comparison checklist.',
  },
  C2: {
    family: 'comparison',
    label: 'Household alignment',
    counterStrategy: 'Help all decision-makers evaluate the same trade-offs.',
    channel: 'voice',
    messageAngle: 'Invite a joint, no-pressure decision review.',
  },
  S1: {
    family: 'timing',
    label: 'Delivery / completion-time anxiety',
    counterStrategy: 'Clarify the expected delivery and completion timeline.',
    channel: 'sms',
    messageAngle: 'Give a clear timeline update without manufactured urgency.',
  },
  S2: {
    family: 'timing',
    label: 'Installation disruption',
    counterStrategy: 'Demystify the installation sequence and disruption.',
    channel: 'call',
    messageAngle: 'Explain what happens on installation day.',
  },
  E1: {
    family: 'values',
    label: 'Environmental impact clarity',
    counterStrategy: 'Connect the quote to the homeowner’s sustainability goal.',
    channel: 'email',
    messageAngle: 'Frame the system around energy independence and impact.',
  },
  E2: {
    family: 'values',
    label: 'Energy independence',
    counterStrategy: 'Clarify how the system supports control over energy use.',
    channel: 'voice',
    messageAngle: 'Explain the independence trade-off in plain language.',
  },
};

export const PROBLEM_CODE_FAMILY_STYLES: Record<ProblemCodeFamily, string> = {
  price: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  finance: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  trust: 'border-blue-500/30 bg-blue-500/15 text-blue-400',
  comparison: 'border-violet-500/30 bg-violet-500/15 text-violet-400',
  timing: 'border-orange-500/30 bg-orange-500/15 text-orange-400',
  values: 'border-teal-500/30 bg-teal-500/15 text-teal-300',
};
