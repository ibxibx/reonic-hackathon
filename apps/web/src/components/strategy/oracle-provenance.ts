/**
 * HONEST PROVENANCE for the Oracle ghost (churn) risk — pure UI helper.
 *
 * The Oracle's ghost number is NOT a measured solar outcome. Until real solar
 * labels + fitted calibration params exist, the engine keeps `calibrated=false`
 * and grounds the ghost hazard in a literature prior (`lib/oracle/churn-prior.ts`:
 * cited real-world B2B/B2C lead-response decay + telecom commitment-churn stats,
 * used as cross-domain ANCHORS — never presented as this installer's solar data).
 *
 * This helper turns the two provenance-bearing prediction columns we actually
 * persist (`calibrated`, `mode`) into a small, TRUTHFUL caption + tooltip the
 * panel renders under the ghost gauge. It is PURE (no React, no DB, no clock),
 * tolerates any/garbage input, and never throws — a corrupt prediction degrades
 * to a conservative "uncalibrated" message rather than a crash.
 *
 * HONESTY CONTRACT:
 *  • Never claim "calibrated" unless `calibrated === true`.
 *  • Never describe the churn benchmarks as solar outcomes — they are real-world
 *    proxy/anchor statistics, explicitly labelled as benchmarks/priors.
 *  • SIGN is never grounded by the churn prior, so the caption is GHOST-only.
 *
 * vitest has no @/ alias and this module is pure, so it has zero value imports —
 * keep it dependency-free so the co-located *.test.ts stays a plain relative
 * import with no React/runtime setup.
 */

/** The engine's two honest provenance modes (mirrors OracleMode loosely). */
export type ProvenanceMode = 'model' | 'degraded' | 'unknown';

/**
 * How the displayed ghost number was composed, honestly:
 *  • 'calibrated'      — fitted + calibrated on real absorbed solar outcomes;
 *                        no benchmark blending.
 *  • 'model-blend'     — a fitted (synthetic-trained) model number SHRUNK toward
 *                        the real-world churn benchmark prior (model is the spine).
 *  • 'prior-spine'     — degraded mode: the benchmark prior IS the spine, the
 *                        model contributes little/nothing (heuristic estimate).
 */
export type GhostBlendKind = 'calibrated' | 'model-blend' | 'prior-spine';

/** A small, render-ready provenance descriptor for the ghost number. */
export interface GhostProvenance {
  /** true only when the persisted prediction is genuinely calibrated. */
  calibrated: boolean;
  /** normalized engine mode used for the wording. */
  mode: ProvenanceMode;
  /**
   * Whether the ghost number was blended with the real-world churn benchmark
   * prior. True for every uncalibrated prediction (model = ~1/3 shrink toward
   * the prior; degraded = prior is the spine). False once calibrated.
   */
  blendedWithChurnPrior: boolean;
  /**
   * Honest description of HOW the number was composed. Distinguishes an
   * uncalibrated *model* number that was merely shrunk toward the benchmark
   * (model-blend) from a *degraded* number where the benchmark is the spine
   * (prior-spine). 'calibrated' once real solar labels exist. Additive: callers
   * may ignore it and rely on `blendedWithChurnPrior` alone.
   */
  blendKind: GhostBlendKind;
  /** short caption shown inline under the ghost gauge (empty when calibrated). */
  caption: string;
  /** longer, fully-honest explanation for the tooltip. */
  tooltip: string;
}

/** Coerce an unknown `mode` column value into a known ProvenanceMode. */
function normalizeMode(raw: unknown): ProvenanceMode {
  return raw === 'model' || raw === 'degraded' ? raw : 'unknown';
}

/**
 * Derive the honest ghost provenance from a prediction's `calibrated` + `mode`.
 * Inputs are intentionally loose (`unknown`) so callers can pass raw DB values
 * without narrowing; anything non-boolean for `calibrated` is treated as the
 * SAFE default (uncalibrated), never silently "calibrated".
 */
export function getGhostProvenance(
  calibratedRaw: unknown,
  modeRaw: unknown
): GhostProvenance {
  const calibrated = calibratedRaw === true;
  const mode = normalizeMode(modeRaw);

  if (calibrated) {
    return {
      calibrated: true,
      mode,
      blendedWithChurnPrior: false,
      blendKind: 'calibrated',
      caption: '',
      tooltip:
        'Ghost risk from a calibrated model fitted on real absorbed (signed / ghosted) outcomes.',
    };
  }

  // Uncalibrated: the ghost is always grounded in the real-world churn prior.
  // Degraded mode → the prior IS the spine (heuristic); model mode → a fitted
  // (synthetic-trained) number shrunk toward the prior. Caption is GHOST-only.
  const degraded = mode === 'degraded';
  const blendKind: GhostBlendKind = degraded ? 'prior-spine' : 'model-blend';

  const caption = degraded
    ? 'Ghost risk anchored to real-world churn benchmarks (heuristic, uncalibrated)'
    : 'Ghost risk: model blended with real-world churn benchmarks (uncalibrated)';

  const tooltip = degraded
    ? 'Heuristic estimate: not enough real solar outcomes to fit a model yet, so ghost risk is anchored to real-world churn benchmarks (published lead-response decay and telecom commitment-churn rates) used as a cross-domain prior — not measured solar data. Uncalibrated.'
    : 'Blend: a model estimate on a synthetic corpus (only a handful of real outcomes exist) shrunk toward real-world churn benchmarks (published lead-response decay and telecom commitment-churn rates) used as a cross-domain prior — not measured solar data. Stays uncalibrated until real solar labels exist.';

  return {
    calibrated: false,
    mode,
    blendedWithChurnPrior: true,
    blendKind,
    caption,
    tooltip,
  };
}
