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
