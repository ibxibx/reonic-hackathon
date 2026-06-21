/**
 * A1 — Synthetic labeled corpus generator (STUB, Phase A).
 * Deterministic-by-seed population with full message/orchestration histories and
 * outcomes drawn from a known latent process, so coefficient recovery is
 * checkable. Every row is flagged synthetic; never mixed into real data.
 */
import type {
  GenerateSyntheticCorpus,
  SyntheticCorpus,
  SyntheticOptions,
} from './contracts';

export const generateSyntheticCorpus: GenerateSyntheticCorpus = (
  _opts: SyntheticOptions
): SyntheticCorpus => {
  throw new Error('TODO: A1 — generateSyntheticCorpus (synthetic.ts)');
};
