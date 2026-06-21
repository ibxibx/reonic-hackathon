# ORACLE_OWNERSHIP — disjoint lane map (hard rule)

Each agent writes **only** in its lane. Workers never touch the migration,
`contracts.ts`, `database.types.ts`, `agent-log.ts`, another lane's files, or
the integration assembly. The engine/panel (A5) consume other lanes **only via
their contracts** (against stubs during parallel build). Shared-file writes are
reserved to their single owner.

| Agent | Lane | Owns (write only here) |
|---|---|---|
| **A1 Data & Economics** | data substrate + features | `lib/solar.ts` (economics fns only — keep existing constants/locale), `lib/oracle/synthetic.ts`, `lib/oracle/person-period.ts`, `lib/oracle/features.ts` + their `*.test.ts` |
| **A2 Model Core** | the fitter | `lib/oracle/model/fitter.ts`, `lib/oracle/model/linalg.ts` + their `*.test.ts` |
| **A3 Inference & Calibration** | numbers + factors + eval | `lib/oracle/model/competing-risks.ts`, `lib/oracle/calibration.ts`, `lib/oracle/eval.ts` + their `*.test.ts` |
| **A4 LLM & Taxonomy** | qualitative + schema | `lib/ai/blocker-taxonomy.ts`, `lib/ai/schemas.ts` (oracleSchema only), `lib/ai/prompts.ts` (buildOraclePrompt only), `lib/ai/provider.ts` (generateOracleLlm only) + fixtures |
| **A5 Engine & UI** | engine + panel | `lib/oracle/engine.ts`, `data/user/oracle.ts`, `components/strategy/oracle-panel.tsx` + new subcomponents + their `*.test.ts` |
| **Orchestrator** | contracts + DB + integration | `lib/oracle/contracts.ts`, `apps/database/.../*_oracle_calibration.sql`, `lib/database.types.ts`, `lib/ai/agent-log.ts`, the page wiring `app/(app-pages)/leads/[leadId]/page.tsx`, `data/user/leads-read.ts` (prediction-history read only), `ORACLE_*.md` |

## Frozen inter-lane API (from `contracts.ts`)

- **A1 → all**: `lib/solar.ts#computeSolarEconomics` (`ComputeEconomics`); `features.ts#{assembleFeatures, featuresToVector}`; `person-period.ts#{expandToPersonPeriods, advanceCovariates, LeadTimeline}`; `synthetic.ts#generateSyntheticCorpus`.
- **A2 → A3/A5**: `model/fitter.ts#{fitMultinomial, predictProbabilities, FitOptions}`; `model/linalg.ts` (internal).
- **A3 → A5**: `model/competing-risks.ts#{cumulativeIncidence, attributeFactors}`; `calibration.ts#{evaluate, fitCalibration, applyCalibration}`; `eval.ts#{runGoldenCases, runEvalReport}`.
- **A4 → A5**: `ai/blocker-taxonomy.ts#{BLOCKER_TAXONOMY, blockerCodeEnum}`; `ai/schemas.ts#oracleSchema`; `ai/prompts.ts#buildOraclePrompt` (`BuildOraclePrompt`); `ai/provider.ts#generateOracleLlm` (`GenerateOracleLlm`).
- **A5 → page**: `lib/oracle/engine.ts#scoreOracle` (`ScoreOracle`); `data/user/oracle.ts#generateOracleAction`; `oracle-panel.tsx#OraclePanel` (accepts optional `predictions` history prop).

## Build & verify (discovered commands)

- typecheck: `pnpm --filter web typecheck` (`tsc --noEmit`) — **project-wide**; run by Orchestrator at integration.
- tests: `pnpm --filter web test` (`vitest run --root src`) — esbuild per-file; workers verify their own lane's tests here (must live under `apps/web/src/**`).
- lint: `pnpm --filter web lint` (`oxlint src/`).

TS config: `strict:false` but `strictNullChecks:true`, target ES2019, path alias `@/*` → `apps/web/src/*`. No `Date.now()`/`Math.random()` in PURE modules — inject the clock (`nowMs`) and seed RNG.
