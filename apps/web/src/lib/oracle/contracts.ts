/**
 * ORACLE CONTRACTS — frozen interfaces for the calibrated sign/ghost predictor.
 *
 * READ-ONLY after Phase A. Every agent (A1–A5) builds against these types and
 * never edits this file. A worker that genuinely needs a change appends
 * `[CONTRACT-CHANGE-REQUEST] <reason>` to ORACLE_BUILD_LOG.md; only the
 * Orchestrator amends this file and re-notifies.
 *
 * Architecture (locked): a discrete-time competing-risks hazard model.
 * Each lead is expanded into person-period rows (one per day in an active
 * state). Per period the outcome is one of {stay, sign, ghost}. A multinomial
 * logistic regression is fit on those rows. `signProbability` is the cumulative
 * incidence of `sign` over a horizon H; `ghostRisk` is the cumulative incidence
 * of `ghost` over H under the *no-additional-touch* counterfactual (the clock
 * keeps advancing, time-since-last-touch keeps rising). The LLM never guesses
 * the probabilities once the model layer is active — it classifies the blocker,
 * writes the single recommended action, and narrates evidence over the model's
 * supplied factors.
 */

import type { FinancingType, MessageChannel, Persona } from '@/lib/solar';
import type { Database } from '@/lib/database.types';

// ─── DB row aliases (read-only references) ──────────────────────────────────

type LeadRow = Database['public']['Tables']['leads']['Row'];
type QuoteRow = Database['public']['Tables']['quotes']['Row'];
type StrategyRow = Database['public']['Tables']['strategies']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type OrchestrationRow = Database['public']['Tables']['lead_orchestration']['Row'];
type PredictionRow = Database['public']['Tables']['predictions']['Row'];

// ─── Tunable constants (locked defaults) ────────────────────────────────────

/** Default prediction horizon in days for cumulative incidence. */
export const DEFAULT_HORIZON_DAYS = 14;

/**
 * Minimum count of REAL absorbed outcomes (closed|ghosted) before the engine
 * switches from degraded (LLM numbers) to model mode / trusts recalibration.
 */
export const MODEL_MODE_MIN_LABELS = 30;

/** Stamped onto every FittedModel / CalibrationParams / persisted snapshot. */
export const MODEL_VERSION = 'oracle-cr-v1';

/**
 * Dedicated installer id tagging SYNTHETIC rows. Synthetic data is generated and
 * consumed IN-PROCESS only — never inserted into real tables, never mixed with
 * real installer data. This id exists so synthetic provenance is unambiguous.
 */
export const SYNTHETIC_INSTALLER_ID =
  '00000000-0000-4000-8000-00000000dead';

// ─── Outcomes & blocker taxonomy ────────────────────────────────────────────

/** Competing outcomes of one discrete period in the lead state machine. */
export const PERIOD_OUTCOMES = ['stay', 'sign', 'ghost'] as const;
export type PeriodOutcome = (typeof PERIOD_OUTCOMES)[number];

/** Terminal (absorbing) outcomes used as ground-truth labels. */
export const TERMINAL_OUTCOMES = ['sign', 'ghost', 'censored'] as const;
export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number];

/**
 * Blocker taxonomy codes. A4 owns the human-readable names/definitions in
 * blocker-taxonomy.ts; this list is the frozen source of truth the zod enum and
 * the UI both reference.
 *  P  = Price            F  = Financing       T  = Trust
 *  Ti = Timing           Te = Technical       C  = Competition
 *  OK = On track / no dominant blocker
 */
export const BLOCKER_CODES = ['P', 'F', 'T', 'Ti', 'Te', 'C', 'OK'] as const;
export type BlockerCode = (typeof BLOCKER_CODES)[number];

// ─── Canonical feature vector ───────────────────────────────────────────────

/**
 * Canonical covariate order for the model. EVERY numeric feature vector in the
 * system (person-period rows, inference input, factor attribution) is aligned
 * to this order. Frozen — changing it is a contract change.
 *
 * Values are RAW (unstandardized); the FittedModel carries the standardization
 * used at fit time. Boolean features are encoded 0/1; categoricals are one-hot.
 */
export const FEATURE_NAMES = [
  // structured / economics
  'monthlyBill',
  'systemSizeKw',
  'totalCost',
  'costPerKw',
  'simplePaybackYears',
  'monthlySavingsRatio',
  'roi25yrRatio',
  'financingAdjustedUpfront',
  'personaConfidence',
  // engagement
  'messagesSent',
  'messagesFailed',
  'distinctChannels',
  'maxSequenceOrder',
  'daysSinceLastTouch',
  'stepProgressRatio',
  'daysToNextAction',
  // temporal
  'daysInPipeline',
  'daysSinceLatestStrategy',
  // trend
  'signProbSlope',
  'ghostRiskSlope',
  // booleans / one-hots
  'awaitingReply',
  'hasStrategy',
  'financingIsCash',
  'financingIsLoan',
  'personaInvestor',
  'personaSkeptic',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Number of covariates in a feature vector (excludes the model intercept). */
export const FEATURE_COUNT = FEATURE_NAMES.length;

/**
 * Features that advance per period under the no-additional-touch counterfactual.
 * A3 uses this to roll the RAW covariate vector forward when computing ghostRisk
 * (cumulative incidence with the clock running and no touch resetting it).
 * Deltas are in raw units per 1-day period. A1's person-period expansion uses
 * the same rules so training and inference clocks agree.
 */
export const TIME_VARYING_FEATURES = [
  { name: 'daysSinceLastTouch', perPeriodDelta: 1 },
  { name: 'daysInPipeline', perPeriodDelta: 1 },
  { name: 'daysSinceLatestStrategy', perPeriodDelta: 1 },
  { name: 'daysToNextAction', perPeriodDelta: -1 },
] as const satisfies ReadonlyArray<{ name: FeatureName; perPeriodDelta: number }>;

// ─── A1: economics, features, person-period, synthetic corpus ───────────────

/** Output of the derived-economics layer (lib/solar.ts, A1). */
export interface SolarEconomics {
  /** total_cost / system_size_kw */
  costPerKw: number;
  /** years to recoup net upfront from estimated annual savings */
  simplePaybackYears: number;
  /** estimated monthly savings in $ */
  estMonthlySavings: number;
  /** estMonthlySavings / monthlyBill (capped, guarded for bill=0) */
  monthlySavingsRatio: number;
  /** rough 25-year cumulative value / total_cost */
  roi25yrRatio: number;
  /** upfront cash actually required given financing (cash=full, loan/lease/PPA≈0) */
  financingAdjustedUpfront: number;
}

export interface EconomicsInput {
  monthlyBill: number;
  systemSizeKw: number;
  totalCost: number;
  financingType: FinancingType | string;
}

/** Signature A1 implements as `computeSolarEconomics` in lib/solar.ts. */
export type ComputeEconomics = (input: EconomicsInput) => SolarEconomics;

/**
 * Rich, named feature object for a single lead. A1's `assembleFeatures` builds
 * this; `featuresToVector` projects it onto FEATURE_NAMES order.
 */
export interface OracleFeatures {
  leadId: string;
  // structured
  monthlyBill: number;
  systemSizeKw: number;
  totalCost: number;
  financingType: FinancingType | string;
  roofType: string | null;
  persona: Persona | string | null;
  personaConfidence: number; // 0–1; 0 when no strategy
  // derived economics
  costPerKw: number;
  simplePaybackYears: number;
  monthlySavingsRatio: number;
  roi25yrRatio: number;
  financingAdjustedUpfront: number;
  // engagement
  messagesSent: number;
  messagesDraft: number;
  messagesFailed: number;
  distinctChannels: number;
  lastChannel: MessageChannel | string | null;
  maxSequenceOrder: number;
  daysSinceLastTouch: number; // time-varying base
  awaitingReply: boolean;
  currentStep: number;
  totalSteps: number;
  stepProgressRatio: number;
  daysToNextAction: number; // negative = overdue
  // temporal
  daysInPipeline: number;
  daysSinceLatestStrategy: number;
  // trend (slopes of prior prediction snapshots; 0 when <2 snapshots)
  signProbSlope: number;
  ghostRiskSlope: number;
  // flags
  hasQuote: boolean;
  hasStrategy: boolean;
  // provenance
  synthetic: boolean;
}

/** Everything `assembleFeatures` needs. Pure: the clock is injected via nowMs. */
export interface FeatureAssemblyInput {
  lead: LeadRow;
  quote: QuoteRow | null;
  strategy: StrategyRow | null;
  messages: MessageRow[];
  orchestration: OrchestrationRow | null;
  /** chronological (oldest→newest) prior snapshots, for trend slopes */
  priorPredictions: PredictionRow[];
  /** injected current time in ms since epoch (tests pass a fixed value) */
  nowMs: number;
}

export type AssembleFeatures = (input: FeatureAssemblyInput) => OracleFeatures;
export type FeaturesToVector = (features: OracleFeatures) => number[];

/** One person-period row: a single lead observed over a single day-period. */
export interface PersonPeriodRow {
  leadId: string;
  /** 0-based period index since entering an active state */
  t: number;
  /** the transition observed at the end of this period */
  outcome: PeriodOutcome;
  /** covariates aligned to FEATURE_NAMES, RAW (unstandardized) */
  x: number[];
  synthetic: boolean;
}

/** Lead-level label + a snapshot feature vector, for calibration splits. */
export interface SyntheticLeadLabel {
  leadId: string;
  terminal: TerminalOutcome; // sign | ghost | censored
  daysObserved: number;
  /** FEATURE_NAMES-aligned RAW snapshot at the lead's entry (t=0) */
  features: number[];
}

export type SyntheticRegime = 'balanced' | 'high-ghost' | 'high-sign';

export interface SyntheticCorpus {
  rows: PersonPeriodRow[];
  labels: SyntheticLeadLabel[];
  seed: number;
  regime: SyntheticRegime;
  /**
   * The latent coefficients used to generate the corpus, [signRow, ghostRow]
   * each [intercept, ...betas] aligned to FEATURE_NAMES — lets A2/A3 check
   * coefficient recovery. Optional because real data has no ground-truth betas.
   */
  trueCoefficients?: number[][];
}

export interface SyntheticOptions {
  seed: number;
  nLeads?: number;
  regime?: SyntheticRegime;
  /** max days a lead can be observed before censoring */
  maxDays?: number;
}

export type GenerateSyntheticCorpus = (
  opts: SyntheticOptions
) => SyntheticCorpus;

// ─── A2: model fitter ───────────────────────────────────────────────────────

export interface Standardization {
  /** per-feature mean, length = FEATURE_COUNT */
  mean: number[];
  /** per-feature std-dev (guarded > 0), length = FEATURE_COUNT */
  sd: number[];
}

/**
 * A fitted discrete-time model.
 * Multinomial: `classes[0]` is the reference category (`stay`); `coefficients`
 * has `classes.length - 1` rows, row j the logit of `classes[j+1]` vs reference.
 * Each row is `[intercept, beta_1, …, beta_FEATURE_COUNT]` in standardized space.
 */
export interface FittedModel {
  kind: 'multinomial' | 'binary-hazards';
  featureNames: string[];
  classes: PeriodOutcome[];
  coefficients: number[][];
  standardization: Standardization;
  l2: number;
  modelVersion: string;
  trainedOn: 'synthetic' | 'real' | 'mixed';
  nRows: number;
  nLeads: number;
}

/** Per-period class probabilities; keys sum to 1. */
export type PeriodProbabilities = Record<PeriodOutcome, number>;

export type PredictProbabilities = (
  model: FittedModel,
  xRaw: number[]
) => PeriodProbabilities;

// ─── A3: inference, factor attribution, calibration, eval ───────────────────

export interface CumulativeIncidence {
  /** [0,1] cumulative incidence of `sign` over the horizon */
  signProbability: number;
  /** [0,1] cumulative incidence of `ghost` over the horizon under no-touch */
  ghostRisk: number;
  horizonDays: number;
  /** optional per-period decomposition (for debugging / charts) */
  perPeriod?: Array<{
    t: number;
    sign: number;
    ghost: number;
    survive: number;
  }>;
}

/** A single signed driver behind a prediction (standardized-coef contribution). */
export interface OracleFactor {
  /** FEATURE_NAME (machine) */
  feature: string;
  /** effect on the named target */
  direction: 'increases' | 'decreases';
  /** signed standardized contribution beta_j * z_ij */
  weight: number;
  target: 'sign' | 'ghost';
  /** deterministic human phrase; the LLM may narrate around it, never invent it */
  plainText: string;
}

export type AttributeFactors = (
  model: FittedModel,
  xRaw: number[],
  target: 'sign' | 'ghost',
  topN?: number
) => OracleFactor[];

export type CumulativeIncidenceFn = (
  model: FittedModel,
  baseXRaw: number[],
  horizonDays?: number
) => CumulativeIncidence;

export type CalibrationMethod = 'platt' | 'isotonic' | 'none';

export interface ReliabilityBin {
  bin: number;
  predictedMean: number;
  observedRate: number;
  count: number;
}

export interface EvalMetrics {
  brier: number;
  auc: number;
  ece: number;
  nBins: number;
  reliability: ReliabilityBin[];
  n: number;
}

/** calibratedLogit = a * rawLogit + b */
export interface PlattParams {
  a: number;
  b: number;
}

/** monotone step function: parallel knot arrays (x ascending). */
export interface IsotonicParams {
  x: number[];
  y: number[];
}

export interface CalibrationParams {
  target: 'sign' | 'ghost';
  method: CalibrationMethod;
  platt?: PlattParams;
  isotonic?: IsotonicParams;
  modelVersion: string;
  nLabels: number;
  trainedOn: 'synthetic' | 'real' | 'mixed';
  metricsBefore?: EvalMetrics;
  metricsAfter?: EvalMetrics;
}

export type ApplyCalibration = (
  rawProbability: number,
  params: CalibrationParams
) => number;

/** Direction-only golden check on a seed lead (qualitative, not exact values). */
export interface GoldenCaseResult {
  leadId: string;
  label: string;
  expectation: string;
  passed: boolean;
  detail: string;
}

// ─── A4: LLM qualitative layer ──────────────────────────────────────────────

/**
 * Structured output of the Oracle LLM call (A4's oracleSchema). The probability
 * fields are authoritative ONLY in degraded mode; in model mode the engine
 * overrides them with the fitted model's numbers. `factors[]` is the LLM's
 * narration over SUPPLIED model factors — never invented in model mode.
 */
export interface OracleLlmOutput {
  signProbability: number; // 0–100 int (degraded-mode source)
  ghostRisk: number; // 0–100 int (degraded-mode source)
  signConfidence: number; // 0–100 (band half-width / confidence)
  ghostConfidence: number; // 0–100
  blockerCode: BlockerCode;
  factors: Array<{
    feature: string;
    direction: 'increases' | 'decreases';
    weight: number;
    plainText: string;
  }>;
  recommendedAction: string;
  evidence: string;
}

export type OracleMode = 'model' | 'degraded';

/**
 * Everything the prompt builder (A4) needs. The engine (A5) assembles this; the
 * prompt formats it. The blindfold is removed: real engagement IS supplied.
 */
export interface OraclePromptContext {
  lead: LeadRow;
  quote: QuoteRow | null;
  strategy: StrategyRow | null;
  features: OracleFeatures;
  /** model-derived top drivers the LLM narrates over (empty in degraded mode) */
  factors: OracleFactor[];
  /** model numbers (0–100) when in model mode; null in degraded mode */
  modelNumbers: { signProbability: number; ghostRisk: number } | null;
  mode: OracleMode;
  /** pre-rendered, PII-safe engagement summary line(s) */
  engagementSummary: string;
}

export type BuildOraclePrompt = (ctx: OraclePromptContext) => string;
export type GenerateOracleLlm = (
  systemPrompt: string
) => Promise<OracleLlmOutput>;

// ─── A5: engine output ──────────────────────────────────────────────────────

export interface ConfidenceBand {
  low: number; // 0–100
  high: number; // 0–100
  width: number; // high − low
}

/** The full rich prediction the panel renders and the engine persists. */
export interface RichPrediction {
  leadId: string;
  signProbability: number; // 0–100 int (display)
  ghostRisk: number; // 0–100 int
  signConfidence: ConfidenceBand;
  ghostConfidence: ConfidenceBand;
  blockerCode: BlockerCode;
  factors: OracleFactor[];
  recommendedAction: string;
  evidence: string;
  calibrated: boolean;
  mode: OracleMode;
  modelVersion: string;
  horizonDays: number;
}

/** What `scoreOracle` returns (rich prediction + persistence metadata). */
export interface OracleScore extends RichPrediction {
  /** id of the persisted snapshot, or null if persistence was unavailable */
  predictionId: string | null;
  createdAt: string | null;
}

export type ScoreOracle = (leadId: string) => Promise<OracleScore>;
