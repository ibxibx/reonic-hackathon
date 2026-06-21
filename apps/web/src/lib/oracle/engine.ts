/**
 * A5 — Hybrid scoring engine (server-only ORCHESTRATION).
 *
 * `scoreOracle(leadId)`:
 *   1. load the lead substrate (lead + quote + latest strategy + messages +
 *      orchestration + prior predictions) via the installer-scoped Supabase
 *      client (RLS enforced server-side);
 *   2. assemble features (A1) and project to the canonical vector;
 *   3. obtain a fitted model — today a SYNTHETIC-trained, process-memoized
 *      singleton (real-data training is deferred until ≥ MODEL_MODE_MIN_LABELS
 *      real absorbed outcomes exist). `calibrated` is honestly `false` until real
 *      calibration params are fit, so a synthetic model is flagged uncalibrated;
 *   4. MODEL mode → model numbers + factors (A3), LLM narrates the blocker /
 *      action / evidence (A4); DEGRADED mode → LLM estimates the numbers;
 *   5. assemble the frozen RichPrediction (engine-core, pure);
 *   6. persist a snapshot — degrading cleanly (predictionId=null) on a missing
 *      predictions table or any insert error.
 *
 * This file is the Next runtime boundary: it imports `server-only`, uses `@/`
 * imports, and may use `Date.now()`. It never runs under vitest — the pure,
 * tested logic lives in `engine-core.ts`. Only thing that throws: a missing lead.
 */
import 'server-only';

import {
  DEFAULT_HORIZON_DAYS,
  MODEL_MODE_MIN_LABELS,
  MODEL_VERSION,
} from './contracts';
import type { FittedModel, OracleLlmOutput, OracleScore } from './contracts';
import { assembleFeatures, featuresToVector } from './features';
import { fitMultinomial } from './model/fitter';
import { generateSyntheticCorpus } from './synthetic';
import {
  assembleRichPrediction,
  computeModelNumbersAndFactors,
  decideMode,
} from './engine-core';
import type { ModelNumbersAndFactors } from './engine-core';

import { createSupabaseClient } from '@/supabase-clients/server';
import {
  getLeadWithQuote,
  getStrategyForLead,
  getMessagesForLead,
  getOrchestrationForLead,
} from '@/data/user/leads-read';
import { generateOracleLlm } from '@/lib/ai/provider';
import { buildOraclePrompt } from '@/lib/ai/prompts';
import { logStep, logError } from '@/lib/ai/agent-log';
import type { Table } from '@/types';
import type { OracleFeatures, OracleFactor, OraclePromptContext } from './contracts';

// ─── module-level synthetic model singleton (fit ONCE per server process) ────

let SYNTHETIC_MODEL: FittedModel | null = null;

/**
 * Build (once) and reuse the synthetic-trained model. Pure inputs + a fixed seed
 * make the fit deterministic; memoizing avoids refitting on every request.
 */
function getSyntheticModel(): FittedModel {
  if (SYNTHETIC_MODEL) return SYNTHETIC_MODEL;
  const corpus = generateSyntheticCorpus({
    seed: 7,
    nLeads: 600,
    regime: 'balanced',
  });
  SYNTHETIC_MODEL = fitMultinomial(corpus.rows, { trainedOn: 'synthetic' });
  logStep('oracle', 'synthetic model fit', {
    rows: SYNTHETIC_MODEL.nRows,
    leads: SYNTHETIC_MODEL.nLeads,
    trainedOn: SYNTHETIC_MODEL.trainedOn,
  });
  return SYNTHETIC_MODEL;
}

// ─── prior predictions (chronological) ──────────────────────────────────────

/**
 * Load prior prediction snapshots oldest→newest for trend slopes. Returns []
 * when the predictions table is unavailable (e.g. not yet migrated) so the
 * engine never throws on thin/absent prediction history.
 */
async function loadPriorPredictions(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  leadId: string
): Promise<Array<Table<'predictions'>>> {
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

/** Count this installer's absorbed (closed|ghosted) leads, RLS-scoped. */
async function countAbsorbedLeads(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .in('status', ['closed', 'ghosted']);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── engagement summary (PII-safe) ──────────────────────────────────────────

/** A short, PII-safe outreach summary line built only from numeric features. */
function buildEngagementSummary(f: OracleFeatures): string {
  const parts: string[] = [];
  parts.push(
    `${f.messagesSent} sent / ${f.messagesDraft} draft across ${f.distinctChannels} channel${
      f.distinctChannels === 1 ? '' : 's'
    }`
  );
  parts.push(`last touch ${Math.round(f.daysSinceLastTouch)}d ago`);
  if (f.totalSteps > 0) {
    parts.push(`step ${f.currentStep}/${f.totalSteps}`);
  }
  if (f.awaitingReply) parts.push('awaiting reply');
  if (Number.isFinite(f.daysToNextAction) && f.daysToNextAction < 0) {
    parts.push(`next action overdue by ${Math.abs(Math.round(f.daysToNextAction))}d`);
  }
  return parts.join('; ') + '.';
}

// ─── LLM call (never throws) ────────────────────────────────────────────────

/** Run the Oracle LLM, swallowing ANY failure → null (deterministic fallback). */
async function tryLlm(
  ctx: OraclePromptContext
): Promise<OracleLlmOutput | null> {
  try {
    return await generateOracleLlm(buildOraclePrompt(ctx));
  } catch (err) {
    logError('oracle', 'LLM unavailable — using deterministic fallback', err);
    return null;
  }
}

// ─── scoreOracle ─────────────────────────────────────────────────────────────

export const scoreOracle = async (leadId: string): Promise<OracleScore> => {
  const supabase = await createSupabaseClient();
  const nowMs = Date.now();

  // 1) Load the lead substrate (RLS-scoped). Missing lead is the ONLY throw.
  let lead: Table<'leads'>;
  let quote: Table<'quotes'> | null;
  try {
    const res = await getLeadWithQuote(leadId);
    lead = res.lead;
    quote = res.quote;
  } catch {
    throw new Error('Lead not found');
  }
  if (!lead) throw new Error('Lead not found');

  const [strategy, messages, orchestration, priorPredictions] = await Promise.all([
    getStrategyForLead(leadId),
    getMessagesForLead(leadId),
    getOrchestrationForLead(leadId),
    loadPriorPredictions(supabase, leadId),
  ]);

  // 2) Assemble features → canonical vector.
  const features = assembleFeatures({
    lead,
    quote,
    strategy,
    messages,
    orchestration,
    priorPredictions,
    nowMs,
  });
  const xRaw = featuresToVector(features);

  // 3) Obtain a model + honest calibration/mode semantics.
  const realLabelCount = await countAbsorbedLeads(supabase);
  // Real-data training is deferred; even past the threshold we fall back to the
  // synthetic model (and note it) until a real-trained model exists.
  const model = getSyntheticModel();
  const hasModel = model != null;
  // Calibrated requires BOTH enough real labels AND real calibration params,
  // neither of which exist tonight → effectively false.
  const calibrated = false;
  const mode = decideMode(realLabelCount, hasModel);
  const engagementSummary = buildEngagementSummary(features);

  logStep('oracle', 'mode decided', {
    mode,
    calibrated,
    realLabelCount,
    minLabels: MODEL_MODE_MIN_LABELS,
    trainedOn: model.trainedOn,
  });

  // 4) Compute numbers + factors (model mode) and run the LLM narration layer.
  let modelNumbers: ModelNumbersAndFactors | null = null;
  let factors: OracleFactor[] = [];
  if (mode === 'model') {
    modelNumbers = computeModelNumbersAndFactors(
      model,
      xRaw,
      DEFAULT_HORIZON_DAYS
      // no real calibration params tonight → raw CIFs
    );
    factors = modelNumbers.factors;
  }

  const ctx: OraclePromptContext = {
    lead,
    quote,
    strategy,
    features,
    factors,
    modelNumbers:
      mode === 'model' && modelNumbers
        ? {
            signProbability: modelNumbers.signProbability,
            ghostRisk: modelNumbers.ghostRisk,
          }
        : null,
    mode,
    engagementSummary,
  };

  const llm = await tryLlm(ctx);

  // 5) Assemble the frozen RichPrediction (pure).
  const rich = assembleRichPrediction({
    leadId,
    mode,
    calibrated,
    modelVersion: MODEL_VERSION,
    horizonDays: DEFAULT_HORIZON_DAYS,
    modelNumbers,
    llm,
  });

  // 6) Persist a snapshot — degrade cleanly (predictionId=null) on any error.
  let predictionId: string | null = null;
  let createdAt: string | null = null;
  try {
    const { data, error } = await supabase
      .from('predictions')
      .insert({
        lead_id: leadId,
        sign_prob: rich.signProbability,
        ghost_risk: rich.ghostRisk,
        // keep the legacy `predicted_code` column populated alongside the new one
        predicted_code: rich.blockerCode,
        blocker_code: rich.blockerCode,
        recommended_action: rich.recommendedAction,
        evidence: rich.evidence,
        sign_confidence: rich.signConfidence.width,
        ghost_confidence: rich.ghostConfidence.width,
        factors: rich.factors as unknown as Table<'predictions'>['factors'],
        model_version: rich.modelVersion,
        calibrated: rich.calibrated,
        mode: rich.mode,
      })
      .select('id, created_at')
      .single();

    if (!error && data) {
      predictionId = data.id;
      createdAt = data.created_at;
    } else if (error) {
      logError('oracle', 'prediction insert failed — returning unpersisted score', error);
    }
  } catch (err) {
    logError('oracle', 'prediction insert threw — returning unpersisted score', err);
  }

  return { ...rich, predictionId, createdAt };
};
