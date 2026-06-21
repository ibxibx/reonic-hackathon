/**
 * A3 — Competing-risks inference + factor attribution.
 *
 * `cumulativeIncidence`: discrete-time competing-risks cumulative incidence of
 * `sign` over a horizon H, and of `ghost` over H under the NO-ADDITIONAL-TOUCH
 * counterfactual. The clock advances via `advanceCovariates` (daysSinceLastTouch
 * etc. keep rising, never reset), so the recommended action — which would reset
 * that clock — is the causal lever on ghostRisk. Outputs clamped to [0,1];
 * ghostRisk is monotone increasing in base daysSinceLastTouch.
 *
 * `attributeFactors`: standardized-coefficient contributions (beta_j * z_ij)
 * ranked by |contribution|, returning the top signed drivers for a target.
 */
import {
  DEFAULT_HORIZON_DAYS,
  FEATURE_NAMES,
} from '../contracts';
import type {
  AttributeFactors,
  CumulativeIncidence,
  CumulativeIncidenceFn,
  FittedModel,
  OracleFactor,
  PeriodOutcome,
} from '../contracts';
import { predictProbabilities } from './fitter';
import { advanceCovariates } from '../person-period';

/** Clamp `v` to [0,1] and scrub non-finite values to 0. */
function clamp01(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Discrete-time competing-risks cumulative incidence under the no-touch
 * counterfactual. Walk t = 0..H-1 over ONE trajectory whose clock keeps rolling
 * forward (no touch resets daysSinceLastTouch). Maintain survival S (=1 before
 * the first period). Each period: signCIF += S * p.sign ; ghostCIF += S * p.ghost ;
 * then S *= p.stay. Both sign and ghost come from this single no-touch path.
 */
export const cumulativeIncidence: CumulativeIncidenceFn = (
  model: FittedModel,
  baseXRaw: number[],
  horizonDays: number = DEFAULT_HORIZON_DAYS
): CumulativeIncidence => {
  const H = Number.isFinite(horizonDays) && horizonDays > 0
    ? Math.floor(horizonDays)
    : 0;

  let signCIF = 0;
  let ghostCIF = 0;
  let survive = 1;

  const perPeriod: Array<{
    t: number;
    sign: number;
    ghost: number;
    survive: number;
  }> = [];

  for (let t = 0; t < H; t++) {
    // Roll the RAW covariate clock forward to period t (t=0 → unchanged).
    const xt = advanceCovariates(baseXRaw, t);
    const p = predictProbabilities(model, xt);

    // Incidence accrues against the survivors entering this period.
    signCIF += survive * p.sign;
    ghostCIF += survive * p.ghost;
    // Then survivors carry forward by the stay probability.
    survive *= p.stay;

    perPeriod.push({
      t,
      sign: clamp01(signCIF),
      ghost: clamp01(ghostCIF),
      survive: clamp01(survive),
    });
  }

  return {
    signProbability: clamp01(signCIF),
    ghostRisk: clamp01(ghostCIF),
    horizonDays: H,
    perPeriod,
  };
};

/**
 * Human-readable labels for feature names. Anything not listed falls back to the
 * raw machine name so the phrase is always populated.
 */
const FEATURE_LABELS: Partial<Record<string, string>> = {
  monthlyBill: 'monthly bill',
  systemSizeKw: 'system size',
  totalCost: 'total cost',
  costPerKw: 'cost per kW',
  simplePaybackYears: 'payback period',
  monthlySavingsRatio: 'monthly savings vs. bill',
  roi25yrRatio: '25-year ROI',
  financingAdjustedUpfront: 'upfront cash required',
  personaConfidence: 'persona confidence',
  messagesSent: 'messages sent',
  messagesFailed: 'failed messages',
  distinctChannels: 'distinct channels used',
  maxSequenceOrder: 'sequence depth',
  daysSinceLastTouch: 'days since last contact',
  stepProgressRatio: 'sequence progress',
  daysToNextAction: 'days to next action',
  daysInPipeline: 'days in pipeline',
  daysSinceLatestStrategy: 'days since strategy',
  signProbSlope: 'sign-probability trend',
  ghostRiskSlope: 'ghost-risk trend',
  awaitingReply: 'awaiting their reply',
  hasStrategy: 'has a strategy',
  financingIsCash: 'cash financing',
  financingIsLoan: 'loan financing',
  personaInvestor: 'investor persona',
  personaSkeptic: 'skeptic persona',
};

function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/** Title-case the first character of a phrase for a clean sentence start. */
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Rank the standardized-coefficient contributions for a target outcome and
 * return the top-N signed drivers. contribution_j = beta_j * z_j, where
 * z_j = (xRaw_j - mean_j) / sd_j and beta_j is the (non-intercept) coefficient
 * of `target`'s logit row.
 */
export const attributeFactors: AttributeFactors = (
  model: FittedModel,
  xRaw: number[],
  target: 'sign' | 'ghost',
  topN: number = 5
): OracleFactor[] => {
  const classes = model.classes;
  const classIndex = classes.indexOf(target as PeriodOutcome);
  // classes[0] is the reference (stay); its coef row is coefficients[index-1].
  if (classIndex <= 0) return [];
  const coefRow = model.coefficients[classIndex - 1];
  if (!coefRow) return [];

  const { mean, sd } = model.standardization;
  const width = mean.length;
  const names = model.featureNames.length === width
    ? model.featureNames
    : (FEATURE_NAMES as readonly string[]);

  const factors: OracleFactor[] = [];
  for (let j = 0; j < width; j++) {
    const raw = j < xRaw.length ? xRaw[j] : 0;
    const v = Number.isFinite(raw) ? raw : 0;
    const s = sd[j] || 1;
    const z = (v - mean[j]) / s;
    // coefRow[0] is the intercept; betas start at index 1.
    const beta = coefRow[j + 1] ?? 0;
    const contribution = beta * z;
    if (!Number.isFinite(contribution)) continue;

    const feature = names[j] ?? `f${j}`;
    const direction: 'increases' | 'decreases' =
      contribution >= 0 ? 'increases' : 'decreases';
    const plainText = `${capitalize(labelFor(feature))} ${direction} ${target} likelihood`;

    factors.push({
      feature,
      direction,
      weight: contribution,
      target,
      plainText,
    });
  }

  factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : factors.length;
  return factors.slice(0, n);
};
