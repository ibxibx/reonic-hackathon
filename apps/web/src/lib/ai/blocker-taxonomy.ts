/**
 * A4 — Blocker taxonomy (STUB, Phase A).
 * Human-readable names + definitions for every BlockerCode in contracts, plus a
 * zod enum + a human map for the UI. A4 refines the definitions; the code set is
 * frozen in contracts.BLOCKER_CODES.
 */
import { z } from 'zod';
import { BLOCKER_CODES, type BlockerCode } from '@/lib/oracle/contracts';

export interface BlockerInfo {
  name: string;
  definition: string;
}

export const BLOCKER_TAXONOMY: Record<BlockerCode, BlockerInfo> = {
  P: { name: 'Price', definition: 'TODO: A4 — price/cost objection' },
  F: { name: 'Financing', definition: 'TODO: A4 — financing structure/affordability' },
  T: { name: 'Trust', definition: 'TODO: A4 — credibility / risk reassurance' },
  Ti: { name: 'Timing', definition: 'TODO: A4 — readiness / scheduling' },
  Te: { name: 'Technical', definition: 'TODO: A4 — roof/system technical concern' },
  C: { name: 'Competition', definition: 'TODO: A4 — comparing other offers' },
  OK: { name: 'On track', definition: 'TODO: A4 — no dominant blocker' },
};

export const blockerCodeEnum = z.enum(
  BLOCKER_CODES as unknown as [BlockerCode, ...BlockerCode[]]
);
