/**
 * A5 — Hybrid scoring engine (STUB, Phase A).
 * `scoreOracle(leadId)`: assemble features (A1) → model numbers + factors (A3) →
 * LLM blocker/action/evidence (A4) → persist a rich snapshot. Auto-mode: MODEL
 * mode when a fitted model + ≥ MODEL_MODE_MIN_LABELS real labels exist; DEGRADED
 * LLM mode otherwise (LLM numbers, calibrated=false, widened confidence, still
 * taxonomy + factors + confidence). Never crashes on a missing predictions table
 * or thin data; PGRST205 → clean empty state.
 */
import type { OracleScore, ScoreOracle } from './contracts';

export const scoreOracle: ScoreOracle = async (
  _leadId: string
): Promise<OracleScore> => {
  throw new Error('TODO: A5 — scoreOracle (engine.ts)');
};
