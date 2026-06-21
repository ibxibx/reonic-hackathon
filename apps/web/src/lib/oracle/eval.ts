/**
 * A3 — Eval harness.
 *
 * Golden-case DIRECTION checks on the seed leads (qualitative/relative, not exact
 * thresholds): the disengaged ghosted lead (Noah) must out-risk the actively
 * negotiating investor (Lukas) on ghostRisk, and Lukas must out-score Noah on
 * signProbability. Plus a full eval report combining held-out calibration
 * metrics + golden results. If a direction does NOT hold we report passed:false
 * with detail — never force-pass.
 */
import {
  DEFAULT_HORIZON_DAYS,
} from './contracts';
import type {
  EvalMetrics,
  FittedModel,
  GoldenCaseResult,
  OracleFeatures,
  SyntheticCorpus,
} from './contracts';
import { computeSolarEconomics } from '../solar';
import { featuresToVector } from './features';
import { cumulativeIncidence } from './model/competing-risks';
import { calibrateFromCorpus } from './calibration';

export interface EvalReport {
  metrics: { sign: EvalMetrics; ghost: EvalMetrics };
  golden: GoldenCaseResult[];
  modelVersion: string;
  regime: string;
  notes: string[];
}

/**
 * Build one faithful OracleFeatures fixture from a small seed-lead spec. The
 * economics fields are derived through the SAME computeSolarEconomics the rest
 * of the system uses, so the covariates match train/inference exactly.
 */
interface SeedSpec {
  leadId: string;
  name: string;
  persona: OracleFeatures['persona'];
  personaConfidence: number;
  hasStrategy: boolean;
  financingType: string;
  monthlyBill: number;
  systemSizeKw: number;
  totalCost: number;
  roofType: string | null;
  // engagement / temporal state
  messagesSent: number;
  messagesDraft: number;
  messagesFailed: number;
  distinctChannels: number;
  lastChannel: string | null;
  maxSequenceOrder: number;
  daysSinceLastTouch: number;
  awaitingReply: boolean;
  currentStep: number;
  totalSteps: number;
  daysToNextAction: number;
  daysInPipeline: number;
  daysSinceLatestStrategy: number;
}

function buildFeatures(spec: SeedSpec): OracleFeatures {
  const econ = computeSolarEconomics({
    monthlyBill: spec.monthlyBill,
    systemSizeKw: spec.systemSizeKw,
    totalCost: spec.totalCost,
    financingType: spec.financingType,
  });
  const stepProgressRatio =
    spec.totalSteps > 0 ? spec.currentStep / spec.totalSteps : 0;

  return {
    leadId: spec.leadId,
    monthlyBill: spec.monthlyBill,
    systemSizeKw: spec.systemSizeKw,
    totalCost: spec.totalCost,
    financingType: spec.financingType,
    roofType: spec.roofType,
    persona: spec.persona,
    personaConfidence: spec.personaConfidence,
    costPerKw: econ.costPerKw,
    simplePaybackYears: econ.simplePaybackYears,
    monthlySavingsRatio: econ.monthlySavingsRatio,
    roi25yrRatio: econ.roi25yrRatio,
    financingAdjustedUpfront: econ.financingAdjustedUpfront,
    messagesSent: spec.messagesSent,
    messagesDraft: spec.messagesDraft,
    messagesFailed: spec.messagesFailed,
    distinctChannels: spec.distinctChannels,
    lastChannel: spec.lastChannel,
    maxSequenceOrder: spec.maxSequenceOrder,
    daysSinceLastTouch: spec.daysSinceLastTouch,
    awaitingReply: spec.awaitingReply,
    currentStep: spec.currentStep,
    totalSteps: spec.totalSteps,
    stepProgressRatio,
    daysToNextAction: spec.daysToNextAction,
    daysInPipeline: spec.daysInPipeline,
    daysSinceLatestStrategy: spec.daysSinceLatestStrategy,
    signProbSlope: 0,
    ghostRiskSlope: 0,
    hasQuote: true,
    hasStrategy: spec.hasStrategy,
    synthetic: false,
  };
}

/**
 * The 5 seed leads as faithful OracleFeatures fixtures, mirroring the app's
 * seed.sql. Exported so tests / integration can reuse the exact same inputs.
 */
export function buildSeedFeatures(): OracleFeatures[] {
  return [
    // Thomas Schneider — family, loan, bill 190, 6.9kW, $16,300, ghosted,
    // ~24 days in pipeline, strategy (conf 0.84), drafts only (clock has run
    // since last real touch ≈ daysInPipeline), low step progress.
    buildFeatures({
      leadId: '10000000-0000-4000-8000-000000000001',
      name: 'Thomas Schneider',
      persona: 'family',
      personaConfidence: 0.84,
      hasStrategy: true,
      financingType: 'loan',
      monthlyBill: 190,
      systemSizeKw: 6.9,
      totalCost: 16300,
      roofType: 'shingle',
      messagesSent: 0,
      messagesDraft: 4,
      messagesFailed: 0,
      distinctChannels: 0,
      lastChannel: null,
      maxSequenceOrder: 4,
      daysSinceLastTouch: 24,
      awaitingReply: false,
      currentStep: 0,
      totalSteps: 4,
      daysToNextAction: 0,
      daysInPipeline: 24,
      daysSinceLatestStrategy: 0.5,
    }),
    // Lukas Becker — investor, cash, bill 410, 12.4kW, $37,200, negotiating,
    // ~17 days, strategy conf 0.91, 1 sent + mid-sequence (progress ~0.5),
    // daysSinceLastTouch small (~2), awaiting reply.
    buildFeatures({
      leadId: '10000000-0000-4000-8000-000000000002',
      name: 'Lukas Becker',
      persona: 'investor',
      personaConfidence: 0.91,
      hasStrategy: true,
      financingType: 'cash',
      monthlyBill: 410,
      systemSizeKw: 12.4,
      totalCost: 37200,
      roofType: 'tile',
      messagesSent: 1,
      messagesDraft: 1,
      messagesFailed: 0,
      distinctChannels: 1,
      lastChannel: 'email',
      maxSequenceOrder: 2,
      daysSinceLastTouch: 2,
      awaitingReply: true,
      currentStep: 1,
      totalSteps: 2,
      daysToNextAction: 1,
      daysInPipeline: 17,
      daysSinceLatestStrategy: 2,
    }),
    // Ava Thompson — skeptic, lease, bill 315.5, 8.9kW, $31,250, contacted,
    // ~4 days, strategy conf 0.74, 1 draft.
    buildFeatures({
      leadId: '10000000-0000-4000-8000-000000000003',
      name: 'Ava Thompson',
      persona: 'skeptic',
      personaConfidence: 0.74,
      hasStrategy: true,
      financingType: 'lease',
      monthlyBill: 315.5,
      systemSizeKw: 8.9,
      totalCost: 31250,
      roofType: 'tile',
      messagesSent: 0,
      messagesDraft: 1,
      messagesFailed: 0,
      distinctChannels: 0,
      lastChannel: null,
      maxSequenceOrder: 1,
      daysSinceLastTouch: 4,
      awaitingReply: false,
      currentStep: 0,
      totalSteps: 1,
      daysToNextAction: 0,
      daysInPipeline: 4,
      daysSinceLatestStrategy: 3,
    }),
    // Noah Patel — no strategy (personaConfidence 0, hasStrategy false), loan,
    // bill 510, 13.1kW, $48,600, ghosted, ~8 days, no messages
    // (daysSinceLastTouch ≈ 8), no orchestration (stepProgressRatio 0).
    buildFeatures({
      leadId: '10000000-0000-4000-8000-000000000004',
      name: 'Noah Patel',
      persona: null,
      personaConfidence: 0,
      hasStrategy: false,
      financingType: 'loan',
      monthlyBill: 510,
      systemSizeKw: 13.1,
      totalCost: 48600,
      roofType: 'flat',
      messagesSent: 0,
      messagesDraft: 0,
      messagesFailed: 0,
      distinctChannels: 0,
      lastChannel: null,
      maxSequenceOrder: 0,
      daysSinceLastTouch: 8,
      awaitingReply: false,
      currentStep: 0,
      totalSteps: 0,
      daysToNextAction: 0,
      daysInPipeline: 8,
      daysSinceLatestStrategy: 8,
    }),
    // Elena Brooks — no strategy, PPA, bill 180, 6.5kW, $21,900, closed,
    // ~10 days.
    buildFeatures({
      leadId: '10000000-0000-4000-8000-000000000005',
      name: 'Elena Brooks',
      persona: null,
      personaConfidence: 0,
      hasStrategy: false,
      financingType: 'PPA',
      monthlyBill: 180,
      systemSizeKw: 6.5,
      totalCost: 21900,
      roofType: 'shingle',
      messagesSent: 0,
      messagesDraft: 0,
      messagesFailed: 0,
      distinctChannels: 0,
      lastChannel: null,
      maxSequenceOrder: 0,
      daysSinceLastTouch: 10,
      awaitingReply: false,
      currentStep: 0,
      totalSteps: 0,
      daysToNextAction: 0,
      daysInPipeline: 10,
      daysSinceLatestStrategy: 10,
    }),
  ];
}

const fmt = (v: number): string => v.toFixed(4);

/**
 * Run the qualitative/relative golden-direction checks across the seed leads.
 * Each result records the expectation, whether it held, and a numeric detail.
 */
export function runGoldenCases(
  model: FittedModel,
  seedFeatures: OracleFeatures[]
): GoldenCaseResult[] {
  const H = DEFAULT_HORIZON_DAYS;
  const byId = new Map<string, OracleFeatures>();
  for (const f of seedFeatures) byId.set(f.leadId, f);

  const ci = (f: OracleFeatures) =>
    cumulativeIncidence(model, featuresToVector(f), H);

  const results: GoldenCaseResult[] = [];

  const noah = byId.get('10000000-0000-4000-8000-000000000004');
  const lukas = byId.get('10000000-0000-4000-8000-000000000002');

  if (noah && lukas) {
    const noahCI = ci(noah);
    const lukasCI = ci(lukas);

    // 1) Noah (disengaged, no strategy, high bill) should out-risk Lukas on ghost.
    {
      const passed = noahCI.ghostRisk > lukasCI.ghostRisk;
      results.push({
        leadId: noah.leadId,
        label: 'Noah Patel',
        expectation: 'ghostRisk(Noah) > ghostRisk(Lukas)',
        passed,
        detail: `Noah.ghostRisk=${fmt(noahCI.ghostRisk)} vs Lukas.ghostRisk=${fmt(
          lukasCI.ghostRisk
        )}`,
      });
    }

    // 2) Lukas (strong economics, high confidence, active sequence) should
    //    out-score Noah on sign probability.
    {
      const passed = lukasCI.signProbability > noahCI.signProbability;
      results.push({
        leadId: lukas.leadId,
        label: 'Lukas Becker',
        expectation: 'signProbability(Lukas) > signProbability(Noah)',
        passed,
        detail: `Lukas.signProbability=${fmt(
          lukasCI.signProbability
        )} vs Noah.signProbability=${fmt(noahCI.signProbability)}`,
      });
    }
  } else {
    results.push({
      leadId: 'missing',
      label: 'seed fixtures',
      expectation: 'Noah and Lukas fixtures present',
      passed: false,
      detail: `noah=${!!noah} lukas=${!!lukas}`,
    });
  }

  return results;
}

/**
 * Full eval report: held-out calibration metrics for sign and ghost plus the
 * golden-direction checks on the seed leads.
 */
export function runEvalReport(
  model: FittedModel,
  corpus: SyntheticCorpus
): EvalReport {
  const signCal = calibrateFromCorpus(model, corpus, 'sign');
  const ghostCal = calibrateFromCorpus(model, corpus, 'ghost');

  const golden = runGoldenCases(model, buildSeedFeatures());
  const misses = golden.filter((g) => !g.passed);

  const notes: string[] = [
    'synthetic-only corpus; metrics are held-out (lead-level split, no period leakage).',
    `sign ECE before=${fmt(signCal.heldOut.before.ece)} after=${fmt(
      signCal.heldOut.after.ece
    )}`,
    `ghost ECE before=${fmt(ghostCal.heldOut.before.ece)} after=${fmt(
      ghostCal.heldOut.after.ece
    )}`,
    misses.length === 0
      ? 'all golden directions passed.'
      : `golden misses: ${misses.map((m) => m.expectation).join('; ')}`,
  ];

  return {
    metrics: { sign: signCal.heldOut.after, ghost: ghostCal.heldOut.after },
    golden,
    modelVersion: model.modelVersion,
    regime: corpus.regime,
    notes,
  };
}
