/**
 * A1 — Feature assembler.
 * Turns the raw lead substrate (lead, quote, strategy, messages, orchestration,
 * prior prediction snapshots) into the typed OracleFeatures object, then projects
 * it onto FEATURE_NAMES order via `featuresToVector`. Pure: the clock is injected
 * (input.nowMs). Economics are derived through the SAME computeSolarEconomics
 * used by synthetic generation, so train/inference covariates agree.
 */
import {
  FEATURE_NAMES,
  FEATURE_COUNT,
} from './contracts';
import type {
  AssembleFeatures,
  FeatureAssemblyInput,
  FeaturesToVector,
  OracleFeatures,
} from './contracts';
import { computeSolarEconomics } from '../solar';

const MS_PER_DAY = 86_400_000;

/** ms-since-epoch of an ISO timestamp, or null if unparseable/absent. */
function toMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const v = Date.parse(ts);
  return Number.isNaN(v) ? null : v;
}

/**
 * Least-squares slope (per-day) of y values plotted against their day-index
 * (x = 0,1,2,...). Returns 0 when fewer than 2 points or when x has no spread.
 * The slope is per *snapshot step*; snapshots are assumed evenly ordered.
 */
export function leastSquaresSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export const assembleFeatures: AssembleFeatures = (
  input: FeatureAssemblyInput
): OracleFeatures => {
  const { lead, quote, strategy, messages, orchestration, priorPredictions, nowMs } =
    input;

  // ── structured / economics ────────────────────────────────────────────────
  const monthlyBill = lead.monthly_bill ?? 0;
  const systemSizeKw = quote?.system_size_kw ?? 0;
  const totalCost = quote?.total_cost ?? 0;
  const financingType = quote?.financing_type ?? 'unknown';

  const econ = computeSolarEconomics({
    monthlyBill,
    systemSizeKw,
    totalCost,
    financingType,
  });

  const persona = strategy?.persona_detected ?? null;
  const personaConfidence = strategy
    ? strategy.persona_confidence ?? 0
    : 0;

  // ── temporal ──────────────────────────────────────────────────────────────
  const createdMs = toMs(lead.created_at);
  const daysInPipeline =
    createdMs !== null ? (nowMs - createdMs) / MS_PER_DAY : 0;

  const strategyMs = strategy ? toMs(strategy.created_at) : null;
  const daysSinceLatestStrategy =
    strategyMs !== null ? (nowMs - strategyMs) / MS_PER_DAY : daysInPipeline;

  // ── engagement (from messages) ──────────────────────────────────────────────
  let messagesSent = 0;
  let messagesDraft = 0;
  let messagesFailed = 0;
  let maxSequenceOrder = 0;
  const channels = new Set<string>();
  let latestSentMs: number | null = null;
  let lastChannel: string | null = null;

  for (const m of messages) {
    if (m.status === 'sent') messagesSent++;
    else if (m.status === 'draft') messagesDraft++;
    else if (m.status === 'failed') messagesFailed++;

    if (m.channel_type) channels.add(m.channel_type);
    if (typeof m.sequence_order === 'number' && m.sequence_order > maxSequenceOrder) {
      maxSequenceOrder = m.sequence_order;
    }

    const sentMs = toMs(m.sent_at);
    if (sentMs !== null && (latestSentMs === null || sentMs > latestSentMs)) {
      latestSentMs = sentMs;
      lastChannel = m.channel_type ?? null;
    }
  }

  const distinctChannels = channels.size;
  const daysSinceLastTouch =
    latestSentMs !== null
      ? (nowMs - latestSentMs) / MS_PER_DAY
      : daysInPipeline;

  // ── orchestration ───────────────────────────────────────────────────────────
  const currentStep = orchestration?.current_step ?? 0;
  const totalSteps = orchestration?.total_steps ?? 0;
  const stepProgressRatio = totalSteps > 0 ? currentStep / totalSteps : 0;
  const awaitingReply = orchestration?.status === 'awaiting_reply';
  const nextActionMs = orchestration ? toMs(orchestration.next_action_at) : null;
  const daysToNextAction =
    nextActionMs !== null ? (nextActionMs - nowMs) / MS_PER_DAY : 0;

  // ── trend (slopes of prior prediction snapshots) ────────────────────────────
  const signProbSlope = leastSquaresSlope(
    priorPredictions.map((p) => p.sign_prob)
  );
  const ghostRiskSlope = leastSquaresSlope(
    priorPredictions.map((p) => p.ghost_risk)
  );

  return {
    leadId: lead.id,
    // structured
    monthlyBill,
    systemSizeKw,
    totalCost,
    financingType,
    roofType: lead.roof_type ?? null,
    persona,
    personaConfidence,
    // derived economics
    costPerKw: econ.costPerKw,
    simplePaybackYears: econ.simplePaybackYears,
    monthlySavingsRatio: econ.monthlySavingsRatio,
    roi25yrRatio: econ.roi25yrRatio,
    financingAdjustedUpfront: econ.financingAdjustedUpfront,
    // engagement
    messagesSent,
    messagesDraft,
    messagesFailed,
    distinctChannels,
    lastChannel,
    maxSequenceOrder,
    daysSinceLastTouch,
    awaitingReply,
    currentStep,
    totalSteps,
    stepProgressRatio,
    daysToNextAction,
    // temporal
    daysInPipeline,
    daysSinceLatestStrategy,
    // trend
    signProbSlope,
    ghostRiskSlope,
    // flags
    hasQuote: quote !== null,
    hasStrategy: strategy !== null,
    // provenance
    synthetic: false,
  };
};

const b = (v: boolean): number => (v ? 1 : 0);

export const featuresToVector: FeaturesToVector = (
  features: OracleFeatures
): number[] => {
  // Map FEATURE_NAMES → numeric value. Booleans/one-hots collapse to 0/1.
  const valueByName: Record<string, number> = {
    monthlyBill: features.monthlyBill,
    systemSizeKw: features.systemSizeKw,
    totalCost: features.totalCost,
    costPerKw: features.costPerKw,
    simplePaybackYears: features.simplePaybackYears,
    monthlySavingsRatio: features.monthlySavingsRatio,
    roi25yrRatio: features.roi25yrRatio,
    financingAdjustedUpfront: features.financingAdjustedUpfront,
    personaConfidence: features.personaConfidence,
    messagesSent: features.messagesSent,
    messagesFailed: features.messagesFailed,
    distinctChannels: features.distinctChannels,
    maxSequenceOrder: features.maxSequenceOrder,
    daysSinceLastTouch: features.daysSinceLastTouch,
    stepProgressRatio: features.stepProgressRatio,
    daysToNextAction: features.daysToNextAction,
    daysInPipeline: features.daysInPipeline,
    daysSinceLatestStrategy: features.daysSinceLatestStrategy,
    signProbSlope: features.signProbSlope,
    ghostRiskSlope: features.ghostRiskSlope,
    awaitingReply: b(features.awaitingReply),
    hasStrategy: b(features.hasStrategy),
    financingIsCash: b(features.financingType === 'cash'),
    financingIsLoan: b(features.financingType === 'loan'),
    personaInvestor: b(features.persona === 'investor'),
    personaSkeptic: b(features.persona === 'skeptic'),
  };

  const vec = FEATURE_NAMES.map((name) => valueByName[name] ?? 0);
  // Defensive invariant: must match the frozen feature count exactly.
  if (vec.length !== FEATURE_COUNT) {
    throw new Error(
      `featuresToVector produced ${vec.length} values, expected ${FEATURE_COUNT}`
    );
  }
  return vec;
};
