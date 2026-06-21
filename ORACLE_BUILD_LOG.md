# ORACLE BUILD LOG (append-only, tagged)

Calibrated sign/ghost predictor — hybrid model + LLM engine. Built by an
Orchestrator + 5 worker lanes behind frozen contracts. Read top→bottom to
reconstruct the build per agent.

- **Integration branch:** `feat/oracle-calibrated-engine` (from `feat/design-iteration` HEAD)
- **Start:** 2026-06-21 ~01:45 local
- **Worker lanes:** A1 Data/Economics · A2 Model Core · A3 Inference/Calibration · A4 LLM/Taxonomy · A5 Engine/UI
- **Phase plan:** A Contracts (ORCH) → B parallel build (B1: A1+A2+A4 ∥, B2: A3, B3: A5) → C integrate+verify (ORCH) → D hardening swarm
- **Verify commands:** `pnpm --filter web typecheck` · `pnpm --filter web test` · `pnpm --filter web lint`

Entry format:
```
## [phase] [ORCH|A1..A5] — <title>
- Did: …   - Verified: …   - Assumptions(new): …   - Decisions(why): …   - Debt/Deferred: …   - Commit: <hash msg>   - Next: …
```

---

## [Phase A] [ORCH] — Contracts, migration, stubs, ownership/log
- Did: created branch `feat/oracle-calibrated-engine`; wrote `lib/oracle/contracts.ts` (frozen types: OracleFeatures, PersonPeriodRow, FittedModel, CalibrationParams, RichPrediction, OracleScore, OracleLlmOutput, OraclePromptContext; FEATURE_NAMES canonical vector + TIME_VARYING_FEATURES; BLOCKER_CODES; constants DEFAULT_HORIZON_DAYS=14, MODEL_MODE_MIN_LABELS=30, MODEL_VERSION, SYNTHETIC_INSTALLER_ID); additive idempotent migration `20260621000000_oracle_calibration.sql` (predictions: sign_confidence/ghost_confidence/factors/blocker_code/model_version/calibrated/mode; new RLS table model_calibration); hand-mirrored those into `database.types.ts` (cannot regen vs live DB here); added `'oracle'` to agent-log AgentName; wrote compiling stubs for every owned module (synthetic, person-period, features, linalg, fitter, competing-risks, calibration, eval, blocker-taxonomy, engine, provider#generateOracleLlm); wrote ORACLE_OWNERSHIP.md.
- Verified: project-wide `tsc --noEmit` GREEN with all stubs in place (node v24.16.0 / pnpm 11.1.2). Migration DB-apply deferred to Phase C (additive+idempotent standard DDL).
- Assumptions: real seed labels are scarce (Elena=closed, Thomas+Noah=ghosted, Lukas=negotiating, Ava=contacted) → degraded mode on real data; synthetic corpus is generated/consumed in-process only (never inserted). Feature vector frozen at 26 covariates. Build/verify in shared working tree (disjoint ownership = isolation; no worktrees); workers verify via their own vitest tests (esbuild per-file), Orchestrator runs project-wide tsc at integration.
- Decisions: TS-only multinomial competing-risks (no Python/SHAP); LLM numbers overridden by model in model mode; clock-roll spec (TIME_VARYING_FEATURES) lives in contracts so A1 training and A3 inference agree; prediction-history read + page wiring are Orchestrator integration tasks (keep A5 lane disjoint).
- Debt/Deferred: all module bodies are stubs (`throw TODO`).
- Commit: 5013f2f + 64abc47 (action→engine decouple)
- Next: green typecheck → commit → dispatch B1 (A1, A2, A4 in parallel).

---

## [Phase B1] [ORCH] — Parallel build A1+A2+A4 integrated
- Did: dispatched A1/A2/A4 in parallel (shared tree, disjoint lanes) behind frozen contracts; all three returned tests-green with no contract-change requests. Integrated as-is.
- Verified: project-wide `tsc --noEmit` GREEN; full vitest suite **106 passed (10 files)**.
- Cross-lane note (relayed to A3/A5): `vitest.config.ts` registers NO `@/` alias → runtime VALUE imports of contracts/siblings MUST be relative (`./contracts`, `../solar`); `import type` is erased so `@/` is fine for types only.
- Commit: (this commit)

### A1 — Data & Economics (complete) — 67 tests
- solar.ts: ADDED `computeSolarEconomics` + helpers/constants (ELECTRICITY_PRICE=0.16, PRODUCTION_PER_KW=1300, ROI_HORIZON_YEARS=25); pre-existing exports untouched. Assumptions: no rate data → those two constants are documented modeling assumptions; annualSavings capped at annual bill; payback sentinel 99.
- oracle/person-period.ts: `advanceCovariates` (pure, exact TIME_VARYING_FEATURES deltas) + `expandToPersonPeriods` (absorb on final row, censored→all stay).
- oracle/synthetic.ts: `generateSyntheticCorpus` deterministic via exported `mulberry32`; latent competing-risks process in standardized space (fixed internal stats, intercepts ~-3.5), regime tilts intercepts; emits rows+labels+trueCoefficients.
- oracle/features.ts: `assembleFeatures` (uses the SAME computeSolarEconomics as synthetic) + `featuresToVector` (exact FEATURE_NAMES order, length===FEATURE_COUNT guard); `leastSquaresSlope` exported for trend.

### A2 — Model Core (complete) — 23 tests
- model/linalg.ts: dot/addVec/subVec/scaleVec/zeros/matVecMul/transpose + stable logSumExp/softmax.
- model/fitter.ts: multinomial logistic (reference 'stay' at logit 0), GD+L2 (intercepts unpenalized), population standardization (sd≤1e-9→1), width from rows[0].x.length (any width), logit/coef clamping → no NaN/Inf. `fitMultinomial` + `predictProbabilities` + `computeStandardization`; FitOptions extended in-lane with `featureNames?`. Coefficient recovery test corr>0.9.

### A4 — LLM & Taxonomy (complete) — 15 tests
- ai/blocker-taxonomy.ts: real names + definitions for all 7 codes; `blockerCodeEnum`.
- ai/schemas.ts: `oracleSchema` upgraded to EXACTLY match OracleLlmOutput (int 0-100 probs, 0-100 confidences, blockerCode enum, factors≤8, action/evidence bounds); GeneratedOracle assignable to OracleLlmOutput.
- ai/prompts.ts: `buildOraclePrompt(ctx)` — blindfold removed; surfaces economics, persona/confidence, real engagementSummary, orchestration position, trend; model-mode locks supplied numbers+factors, degraded-mode estimates; strict no-hallucination.
- ai/provider.ts: `generateOracleLlm` implemented (generateObject + oracleSchema, 20s timeout, 'oracle' logging); legacy `generateOracle` removed; generateStrategy/classifyArchetype untouched.

---

## [Phase B2] [A3] — Inference, calibration, eval (on real A1+A2)
- Did: competing-risks.ts (`cumulativeIncidence` — discrete-time competing risks under the no-additional-touch counterfactual, clock rolled via advanceCovariates, sign+ghost from one trajectory, perPeriod decomposition; `attributeFactors` — standardized beta·z contributions, ranked, signed, human plainText). calibration.ts (`evaluate` Brier/rank-AUC/ECE+reliability; `fitCalibration` Platt 1-D logistic + isotonic PAVA; `applyCalibration`; `calibrateFromCorpus` lead-level seeded split, no leakage, held-out before/after). eval.ts (`buildSeedFeatures` 5 faithful seed.sql fixtures; `runGoldenCases` qualitative relative directions; `runEvalReport`).
- Verified: lane tests 19 passed; project-wide `tsc --noEmit` GREEN; full suite **125 passed (13 files)**.
- Results: **golden directions BOTH PASS** (model on seed:7/600 leads, H=14): Noah sign 0.026 / ghost 0.933; Lukas sign 0.452 / ghost 0.322 → ghost(Noah)>ghost(Lukas) ✓, sign(Lukas)>sign(Noah) ✓. Held-out ECE (Platt): sign 0.098→0.089; ghost 0.264→0.104.
- Decisions: both CIFs from one no-touch trajectory (recommendedAction = the clock-reset lever on ghost); AUC rank-based w/ tie handling; calibrateFromCorpus splits LEADS not periods; calibration recovery test deliberately distorts scores then shows Platt restores ECE (honest demonstration).
- Debt/Deferred: none. No contract changes. Continuable agentId a2bd62544404d989d.
- Commit: 49cabcf

---

## [Phase B3] [A5] — Engine, action, panel (wires A1+A3+A4)
- Did: NEW `engine-core.ts` (PURE, DI'd LLM, relative imports) — decideMode, confidenceBand, computeModelNumbersAndFactors, assembleRichPrediction (21 unit tests). `engine.ts` (server-only) — scoreOracle: RLS-scoped substrate load, memoized synthetic-trained model singleton (seed 7/600 leads), model-mode numbers+factors (A3) + LLM narration (A4) in try/catch→null fallback, pure assembly, clean persist (PGRST205/any insert error → predictionId=null), only throws on missing lead. `oracle-panel.tsx` — calibrated/uncalibrated badge, per-gauge confidence bands, blocker name+code (BLOCKER_TAXONOMY), tinted factor breakdown, recharts trend sparkline (≥2 snapshots), a11y; optional `predictions?` history prop (page untouched). `data/user/oracle.ts` already thin (Phase A.1).
- Verified: engine-core 21 tests; project-wide `tsc --noEmit` GREEN; full suite **146 passed (14 files)**; `oxlint` 0 errors (37 stylistic no-new-array warnings → Phase D).
- Decisions (semantics): mode='model' whenever a usable model exists; `calibrated` stays FALSE until ≥K real labels AND real calibration params (synthetic model honestly flagged uncalibrated, amber badge, wider ±15 band). Layer split: model owns numbers+factors, LLM only narrates blocker/action/evidence; degraded → LLM owns numbers; LLM failure → deterministic fallback. Persist stores band width in sign/ghost_confidence + factors jsonb + blocker_code + model_version + calibrated + mode (legacy predicted_code also populated).
- Debt/Deferred: real-data training + real calibration params (intentional cold-start); page wiring of prediction-history → Phase C (Orchestrator). Continuable agentId a185f361d16a756a5.
- Commit: 49f9cf1

---

## [Phase C] [ORCH] — Integration, page wiring, eval report
- Did: made prediction reads degrade gracefully in `leads-read.ts` (getLatestPredictionForLead returns null on error/PGRST205 instead of throwing — no more page crash on un-migrated DB) + added `getPredictionHistoryForLead`; wired `leads/[leadId]/page.tsx` to fetch the 4 reads in parallel and pass `predictions` history to OraclePanel (sparkline). Generated REAL eval numbers across all 3 regimes via a temporary vitest report generator (then deleted it); wrote `ORACLE_EVAL.md` with corpus summary, coefficient recovery, calibration before/after, golden directions, mode behavior, honest synthetic-vs-real disclosure + cold-start limits, and the exact degraded→model promotion trigger.
- Verified: project-wide `tsc --noEmit` GREEN; full suite **146 passed (14 files)**; `oxlint` 0 errors (37 stylistic warnings → Phase D).
- Eval headlines (synthetic, seed 7, 800 leads/regime): coefficient recovery r 0.73–0.85; Platt improves GHOST ECE in every regime (balanced 0.193→0.049, high-ghost 0.195→0.027), SIGN already ~calibrated (Platt neutral); AUC 0.71–0.86; golden BOTH PASS (Noah ghost 0.86 > Lukas 0.37; Lukas sign 0.44 > Noah 0.07). Honest limitation logged: Elena (real=closed) reads high-ghost because her no-strategy fixture looks disengaged — fixed by real-label retraining, not a hand override.
- Decisions: page wiring + prediction-history read are Orchestrator integration (kept A5 lane disjoint); graceful PGRST205 in the read layer realizes the "degrade, never crash" principle end-to-end.
- Debt/Deferred: live DB apply of the migration deferred (standard additive/idempotent DDL; apply via `supabase db reset` when bringing up the local stack); no-new-array lint warnings → Phase D code-quality.
- Commit: (this commit)
- Next: Phase D hardening swarm.
