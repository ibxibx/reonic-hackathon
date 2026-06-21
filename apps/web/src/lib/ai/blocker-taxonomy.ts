/**
 * A4 — Blocker taxonomy.
 *
 * Human-readable names + crisp one-sentence definitions for every BlockerCode in
 * contracts.BLOCKER_CODES, plus a zod enum typed to the BlockerCode union. The
 * code set is frozen in contracts; A4 owns only the names/definitions here.
 *
 * The Oracle LLM picks exactly one of these codes as the dominant obstacle (or
 * `OK` when the lead is progressing with no single blocker). The UI renders the
 * name; the definition disambiguates the taxonomy for both humans and the model.
 */
import { z } from 'zod';
import { BLOCKER_CODES, type BlockerCode } from '../oracle/contracts';

export interface BlockerInfo {
  name: string;
  definition: string;
}

export const BLOCKER_TAXONOMY: Record<BlockerCode, BlockerInfo> = {
  P: {
    name: 'Price',
    definition:
      'The total price feels too high relative to the homeowner’s expectations or budget, independent of how it is financed.',
  },
  F: {
    name: 'Financing',
    definition:
      'The obstacle is the financing structure or monthly affordability — loan terms, upfront cash, or cash-flow concerns rather than the headline price.',
  },
  T: {
    name: 'Trust',
    definition:
      'The homeowner needs credibility, references, or risk reassurance before committing to the installer or the technology.',
  },
  Ti: {
    name: 'Timing',
    definition:
      'The homeowner is interested but not ready right now — scheduling, life events, or a deliberate wait is delaying the decision.',
  },
  Te: {
    name: 'Technical',
    definition:
      'A roof, system-sizing, or installation feasibility concern is the main thing standing between the homeowner and a yes.',
  },
  C: {
    name: 'Competition',
    definition:
      'The homeowner is comparing or leaning toward a competing offer and is weighing alternatives before deciding.',
  },
  OK: {
    name: 'On track',
    definition:
      'No single dominant blocker — the lead is progressing normally and the priority is sustaining momentum.',
  },
};

export const blockerCodeEnum = z.enum(
  BLOCKER_CODES as unknown as [BlockerCode, ...BlockerCode[]]
);
