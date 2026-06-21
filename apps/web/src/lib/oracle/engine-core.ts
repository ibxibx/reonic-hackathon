/**
 * A5 — Engine CORE (PURE).
 *
 * The deterministic, dependency-free heart of the Oracle scoring engine. Every
 * function here is a pure transform: no DB, no LLM provider, no Supabase, no
 * `Date.now()` / `Math.random()`. The LLM is supplied as an already-resolved
 * `OracleLlmOutput | null` (dependency injection) so this file is unit-testable
 * under vitest, which has NO `@/` alias — therefore EVERY import here is RELATIVE.
 *
 * Responsibilities:
 *  - decideMode:                model vs degraded selection
 *  - confidenceBand:            band half-widths by mode/calibration + clamping
 *  - computeModelNumbersAndFactors: CIF → 0–100 ints + factor attribution
 *  - assembleRichPrediction:    merge model numbers + LLM narration into the
 *                               frozen RichPrediction shape, with deterministic
 *                               fallbacks when the LLM is unavailable.
 *
 * The wiring half (Supabase load, provider call, synthetic model build, persist)
 * lives in the server-only `engine.ts`, which calls into this file.
 */
import {
  BLOCKER_CODES,
} from './contracts';
import type {
  BlockerCode,
  CalibrationParams,
  ConfidenceBand,
  FittedModel,
  OracleFactor,
  OracleLlmOutput,
  OracleMode,
  RichPrediction,
} from './contracts';
import { cumulativeIncidence, attributeFactors } from './model/competing-risks';
import { applyCalibration } from './calibration';

// ─── small numeric helpers (pure) ───────────────────────────────────────────

function clampInt0to100(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const r = Math.round(v);
  if (r < 0) return 0;
  if (r > 100) return 100;
  return r;
}

function clamp0to100(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/** Whether a blocker code string is part of the frozen taxonomy. */
function isBlockerCode(code: unknown): code is BlockerCode {
  return (
    typeof code === 'string' &&
    (BLOCKER_CODES as readonly string[]).includes(code)
  );
}

// ─── decideMode ─────────────────────────────────────────────────────────────

/**
 * Mode is purely a function of model availability: if a usable FittedModel is in
 * hand we run `model` mode (model supplies the numbers + factors, LLM narrates);
 * otherwise `degraded` (LLM supplies the numbers). The real-label count drives
 * `calibrated` (handled by the caller), NOT the mode — a synthetic-trained model
 * is still a model, it is just honestly flagged uncalibrated.
 */
export function decideMode(
  _realLabelCount: number,
  hasModel: boolean
): OracleMode {
  return hasModel ? 'model' : 'degraded';
}

// ─── confidenceBand ─────────────────────────────────────────────────────────

/** Band half-width (± points) by mode + calibration state. */
function halfWidthFor(mode: OracleMode, calibrated: boolean): number {
  if (mode === 'model') return calibrated ? 8 : 15;
  return 22; // degraded
}

/**
 * Build a symmetric confidence band around a 0–100 value. Half-width tightens
 * with trust: calibrated model ≈ ±8, uncalibrated model ≈ ±15, degraded ≈ ±22.
 * low/high are clamped to [0,100] (so the rendered band never spills the gauge)
 * and width is the realized high − low after clamping.
 */
export function confidenceBand(
  value0to100: number,
  mode: OracleMode,
  calibrated: boolean
): ConfidenceBand {
  const v = clamp0to100(value0to100);
  const half = halfWidthFor(mode, calibrated);
  const low = clamp0to100(v - half);
  const high = clamp0to100(v + half);
  return { low, high, width: high - low };
}

// ─── computeModelNumbersAndFactors ──────────────────────────────────────────

export interface ModelNumbersAndFactors {
  signProbability: number; // 0–100 int
  ghostRisk: number; // 0–100 int
  factors: OracleFactor[];
}

/**
 * Run competing-risks inference on a fitted model and translate the [0,1] CIFs
 * into display 0–100 ints, optionally recalibrating each target when a matching
 * CalibrationParams is supplied (raw otherwise). Factors are attributed for the
 * DOMINANT story: the higher-risk target's drivers lead, then the other target's
 * top drivers fill in, capped at ≤6 total so the panel stays legible.
 */
export function computeModelNumbersAndFactors(
  model: FittedModel,
  xRaw: number[],
  horizonDays: number,
  calibration?: { sign?: CalibrationParams; ghost?: CalibrationParams }
): ModelNumbersAndFactors {
  const ci = cumulativeIncidence(model, xRaw, horizonDays);

  // Optional recalibration ONLY when a matching params object is provided.
  const signRaw01 = ci.signProbability;
  const ghostRaw01 = ci.ghostRisk;
  const sign01 = calibration?.sign
    ? applyCalibration(signRaw01, calibration.sign)
    : signRaw01;
  const ghost01 = calibration?.ghost
    ? applyCalibration(ghostRaw01, calibration.ghost)
    : ghostRaw01;

  const signProbability = clampInt0to100(sign01 * 100);
  const ghostRisk = clampInt0to100(ghost01 * 100);

  // Dominant story = whichever target is the bigger risk; lead with its drivers.
  const ghostDominant = ghost01 >= sign01;
  const primaryTarget: 'sign' | 'ghost' = ghostDominant ? 'ghost' : 'sign';
  const secondaryTarget: 'sign' | 'ghost' = ghostDominant ? 'sign' : 'ghost';

  const primary = attributeFactors(model, xRaw, primaryTarget, 4);
  const secondary = attributeFactors(model, xRaw, secondaryTarget, 2);

  // Merge primary first, then secondary, de-duping by (feature, target).
  const seen = new Set<string>();
  const factors: OracleFactor[] = [];
  for (const f of [...primary, ...secondary]) {
    const key = `${f.target}:${f.feature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    factors.push(f);
    if (factors.length >= 6) break;
  }

  return { signProbability, ghostRisk, factors };
}

// ─── deterministic blocker fallback ─────────────────────────────────────────

/**
 * When no LLM is available, derive a defensible blockerCode from the model's
 * top factor. A tiny, transparent heuristic over the dominant driver's feature
 * + direction. Falls back to 'OK' when nothing dominates.
 */
function deterministicBlocker(factors: OracleFactor[]): BlockerCode {
  const top = factors[0];
  if (!top) return 'OK';
  const f = top.feature;
  const ghostish = top.target === 'ghost' && top.direction === 'increases';

  // Engagement / silence story → Timing or Trust.
  if (
    f === 'daysSinceLastTouch' ||
    f === 'awaitingReply' ||
    f === 'daysSinceLatestStrategy' ||
    f === 'daysInPipeline'
  ) {
    return ghostish ? 'Ti' : 'T';
  }
  if (f === 'messagesFailed' || f === 'distinctChannels' || f === 'stepProgressRatio') {
    return ghostish ? 'Ti' : 'OK';
  }
  // Economics story → Price / Financing.
  if (f === 'simplePaybackYears' || f === 'roi25yrRatio' || f === 'monthlySavingsRatio') {
    return 'P';
  }
  if (f === 'financingAdjustedUpfront' || f === 'financingIsLoan' || f === 'financingIsCash') {
    return 'F';
  }
  if (f === 'costPerKw' || f === 'totalCost') {
    return 'P';
  }
  if (f === 'personaConfidence' || f === 'personaSkeptic') {
    return 'T';
  }
  if (f === 'systemSizeKw' || f === 'roofType') {
    return 'Te';
  }
  // Unknown driver but a real ghost story → Timing; else On track.
  return ghostish ? 'Ti' : 'OK';
}

/** Deterministic, PII-safe recommended action keyed off the dominant story. */
function deterministicAction(
  blockerCode: BlockerCode,
  factors: OracleFactor[]
): string {
  const ghostStory = factors.some(
    (f) => f.target === 'ghost' && f.direction === 'increases'
  );
  switch (blockerCode) {
    case 'Ti':
      return 'Send a short, low-pressure check-in on their preferred channel within 24h to reopen the conversation before the lead goes quiet.';
    case 'T':
      return 'Share a concrete reference or proof point on a call this week to build credibility before asking for a decision.';
    case 'P':
      return 'Re-frame the quote around payback and lifetime savings in a tailored follow-up email this week.';
    case 'F':
      return 'Walk through financing options and monthly cash-flow on a call this week to address affordability concerns.';
    case 'Te':
      return 'Offer a quick technical review of roof/system fit on a call to clear the feasibility question.';
    case 'C':
      return 'Send a side-by-side value summary this week so the homeowner can compare your offer with confidence.';
    case 'OK':
    default:
      return ghostStory
        ? 'Keep momentum with a timely, relevant touch on their preferred channel within the next few days.'
        : 'Advance to the next sequence step on schedule and keep the cadence consistent.';
  }
}

/** Map LLM-narrated factors (no target) onto OracleFactor[], inferring target. */
function mapLlmFactors(
  llmFactors: OracleLlmOutput['factors'] | undefined
): OracleFactor[] {
  if (!Array.isArray(llmFactors)) return [];
  return llmFactors.map((f) => {
    const feature = typeof f.feature === 'string' ? f.feature : 'unknown';
    const direction: 'increases' | 'decreases' =
      f.direction === 'decreases' ? 'decreases' : 'increases';
    const weight = Number.isFinite(f.weight) ? f.weight : 0;
    // Infer target from the feature semantics: ghost-leaning features → ghost.
    const ghostLeaning =
      feature === 'daysSinceLastTouch' ||
      feature === 'awaitingReply' ||
      feature === 'messagesFailed' ||
      feature === 'daysInPipeline' ||
      feature === 'ghostRiskSlope';
    const target: 'sign' | 'ghost' = ghostLeaning ? 'ghost' : 'sign';
    const plainText =
      typeof f.plainText === 'string' && f.plainText.length > 0
        ? f.plainText
        : `${feature} ${direction} ${target} likelihood`;
    return { feature, direction, weight, target, plainText };
  });
}

// ─── assembleRichPrediction ─────────────────────────────────────────────────

export interface AssembleRichArgs {
  leadId: string;
  mode: OracleMode;
  calibrated: boolean;
  modelVersion: string;
  horizonDays: number;
  /** model-computed numbers + factors (model mode); null in degraded mode */
  modelNumbers: ModelNumbersAndFactors | null;
  /** the resolved LLM output, or null when the provider was unavailable */
  llm: OracleLlmOutput | null;
}

/**
 * Merge the statistical and qualitative layers into the frozen RichPrediction.
 *
 * MODEL mode: numbers + factors come from the model; the LLM contributes only
 * blockerCode / recommendedAction / evidence (with a deterministic fallback when
 * the LLM is absent). DEGRADED mode: the LLM is authoritative for numbers and
 * factors; with no LLM we fall back to neutral 45/45 and an empty factor list.
 * Confidence bands are always reconstructed from the final numbers + mode.
 */
export function assembleRichPrediction(
  args: AssembleRichArgs
): RichPrediction {
  const { leadId, mode, calibrated, modelVersion, horizonDays, modelNumbers, llm } =
    args;

  let signProbability: number;
  let ghostRisk: number;
  let factors: OracleFactor[];

  if (mode === 'model' && modelNumbers) {
    // Numbers + factors are the model's; the LLM never overrides them here.
    signProbability = clampInt0to100(modelNumbers.signProbability);
    ghostRisk = clampInt0to100(modelNumbers.ghostRisk);
    factors = modelNumbers.factors ?? [];
  } else {
    // Degraded: the LLM owns the numbers; neutral fallback when it is absent.
    signProbability = llm ? clampInt0to100(llm.signProbability) : 45;
    ghostRisk = llm ? clampInt0to100(llm.ghostRisk) : 45;
    factors = mapLlmFactors(llm?.factors);
  }

  // Blocker / action / evidence: prefer the LLM, fall back deterministically.
  const blockerCode: BlockerCode =
    llm && isBlockerCode(llm.blockerCode)
      ? llm.blockerCode
      : deterministicBlocker(factors);

  const recommendedAction =
    llm && typeof llm.recommendedAction === 'string' && llm.recommendedAction.trim()
      ? llm.recommendedAction
      : deterministicAction(blockerCode, factors);

  const evidence =
    llm && typeof llm.evidence === 'string' && llm.evidence.trim()
      ? llm.evidence
      : mode === 'model'
        ? 'Statistical model assessment based on this lead’s economics, engagement, and pipeline timing. LLM narration was unavailable, so this is the deterministic summary.'
        : 'Heuristic assessment from the available lead facts. The qualitative model was unavailable, so estimates are intentionally conservative.';

  const signConfidence = confidenceBand(signProbability, mode, calibrated);
  const ghostConfidence = confidenceBand(ghostRisk, mode, calibrated);

  return {
    leadId,
    signProbability,
    ghostRisk,
    signConfidence,
    ghostConfidence,
    blockerCode,
    factors,
    recommendedAction,
    evidence,
    calibrated,
    mode,
    modelVersion,
    horizonDays,
  };
}
