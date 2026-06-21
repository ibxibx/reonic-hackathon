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
- Commit: (pending)
- Next: green typecheck → commit → dispatch B1 (A1, A2, A4 in parallel).
