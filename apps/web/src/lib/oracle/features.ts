/**
 * A1 — Feature assembler (STUB, Phase A).
 * Turns the raw lead substrate (lead, quote, strategy, messages, orchestration,
 * prior prediction snapshots) into the typed OracleFeatures object, then projects
 * it onto FEATURE_NAMES order via `featuresToVector`. Pure: the clock is injected
 * (input.nowMs). Uses the previously-unused engagement/orchestration/trend
 * signals described in the contract.
 */
import type {
  AssembleFeatures,
  FeatureAssemblyInput,
  FeaturesToVector,
  OracleFeatures,
} from './contracts';

export const assembleFeatures: AssembleFeatures = (
  _input: FeatureAssemblyInput
): OracleFeatures => {
  throw new Error('TODO: A1 — assembleFeatures (features.ts)');
};

export const featuresToVector: FeaturesToVector = (
  _features: OracleFeatures
): number[] => {
  throw new Error('TODO: A1 — featuresToVector (features.ts)');
};
