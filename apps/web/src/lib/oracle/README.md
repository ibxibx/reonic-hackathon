# Oracle — calibrated sign/ghost predictor

A hybrid lead-scoring engine for solar installers. For every lead it produces two
numbers — **`signProbability`** (will this lead close?) and **`ghostRisk`** (will
this lead go silent?) — plus a confidence band, a dominant blocker code, a single
recommended action, and human-readable evidence.

The design rule is **numbers from a model, words from the LLM**: a statistical
competing-risks model owns the probabilities and the signed drivers; the LLM only
classifies the blocker, writes the recommended action, and narrates evidence over
the factors the model supplies. In model mode the LLM never free-guesses the
probabilities.

> All evaluation numbers (synthetic metrics, coefficient recovery, golden cases,
> the real cross-domain churn benchmark) live in
> [`ORACLE_EVAL.md`](../../../../../ORACLE_EVAL.md) at the repo root. This README
> describes the architecture; that file holds the figures.

---

## 1. The statistical model

### Discrete-time competing risks

Each lead is expanded into **person-period rows** — one row per active day the
lead is alive in the pipeline. The outcome observed at the end of a period is one
of three competing transitions:

```
PERIOD_OUTCOMES = ['stay', 'sign', 'ghost']   // reference = 'stay'
```

A **multinomial logistic regression** is fit over those rows (softmax with the
`stay` class fixed at logit 0). From the per-period transition probabilities we
compute, by walking the horizon period by period and tracking survival `S`:

- `signProbability` = the cumulative incidence of `sign` over a horizon `H`
  (`DEFAULT_HORIZON_DAYS = 14`).
- `ghostRisk` = the cumulative incidence of `ghost` over the same `H`, computed
  under the **no-additional-touch counterfactual**: as the trajectory rolls
  forward the clock keeps advancing (`daysSinceLastTouch`, `daysInPipeline`,
  `daysSinceLatestStrategy` keep rising; `daysToNextAction` keeps falling) and
  *no* touch ever resets it. That counterfactual is the whole point — the
  recommended action, which *would* reset the silence clock, is the causal lever
  on `ghostRisk`.

Both CIFs come from a single survival-weighted walk
(`signCIF += S·p.sign; ghostCIF += S·p.ghost; S *= p.stay`), so they are
internally consistent and monotone non-decreasing in `H`.

### The feature vector

`contracts.FEATURE_NAMES` is the frozen, canonical covariate order (26 features)
that *every* numeric vector in the system aligns to — person-period rows,
inference inputs, factor attribution, and the synthetic generator. It spans four
groups:

- **economics**: `monthlyBill`, `systemSizeKw`, `totalCost`, `costPerKw`,
  `simplePaybackYears`, `monthlySavingsRatio`, `roi25yrRatio`,
  `financingAdjustedUpfront`, `personaConfidence`
- **engagement**: `messagesSent`, `messagesFailed`, `distinctChannels`,
  `maxSequenceOrder`, `daysSinceLastTouch`, `stepProgressRatio`,
  `daysToNextAction`
- **temporal**: `daysInPipeline`, `daysSinceLatestStrategy`
- **trend**: `signProbSlope`, `ghostRiskSlope` (least-squares slopes of prior
  prediction snapshots)
- **booleans / one-hots**: `awaitingReply`, `hasStrategy`, `financingIsCash`,
  `financingIsLoan`, `personaInvestor`, `personaSkeptic`

Values are stored **RAW** (unstandardized); the fitted model carries the
standardization used at fit time. `contracts.TIME_VARYING_FEATURES` declares the
per-period deltas that `advanceCovariates` applies to roll the clock forward — the
*same* rules drive both training (person-period expansion) and inference
(cumulative incidence), so the two clocks agree by construction.

### The fitter

`model/fitter.ts` fits the multinomial logit by gradient descent with **L2**
regularization (intercepts unpenalized) over standardized covariates. It is
numerically guarded (stable softmax, clamped logits/coefficients, no NaN/Inf) and
**pure** — no `Date.now()` / `Math.random()`. The L2 penalty is **selected by
lead-aware k-fold cross-validation** (`crossValidateL2`): folds are partitioned by
`leadId` via a seeded Fisher–Yates shuffle so all of a lead's person-periods stay
together (no within-lead period leakage), and the L2 with the lowest mean held-out
log-loss wins. `model/linalg.ts` provides the vector/matrix and stable
softmax / log-sum-exp primitives.

### Factor attribution

`attributeFactors` (in `model/competing-risks.ts`) ranks the standardized-
coefficient contributions `contribution_j = beta_j · z_j` by magnitude and returns
the top signed drivers for a target, each with a direction and a deterministic
plain-text phrase. These are the factors the LLM narrates over — it never invents
them in model mode.

---

## 2. Calibration

`calibration.ts` provides the metrics + recalibration machinery:

- **`evaluate`** — Brier, rank-based AUC (Mann–Whitney U with tie handling), ECE,
  and the reliability curve over equal-width bins.
- **`fitCalibration` / `applyCalibration`** — **Platt** scaling (1-D logistic on
  logits) or **isotonic** regression (pool-adjacent-violators), persisted as
  `CalibrationParams` carrying before/after metrics.
- **`calibrateFromCorpus`** — fits calibration from a corpus's **lead-level**
  train/test split (split by lead, not by period, so there is no leakage). Fit on
  train, report held-out before/after.
- **`selectCalibration`** — fits Platt *and* isotonic, scores each plus the raw
  `'none'` baseline on the identical held-out leads, and returns the method with
  the lowest held-out ECE. Because `'none'` is always a candidate, the chosen
  method's held-out ECE can never exceed the raw ECE.
- **`calibrateFromCorpusHonest`** — closes a leakage caveat: it **re-fits the base
  model on TRAIN leads only**, so the base-model "before" metrics are fully
  out-of-sample (`calibrateFromCorpus` grades a model fit on the full corpus, whose
  "before" numbers are optimistic).

### Honest synthetic-vs-real findings (read this)

- **Calibration-method selection works.** On synthetic held-out splits, Platt
  substantially improves **ghost** calibration and `selectCalibration` keeps
  **raw** for sign (already near-identity) — so a chosen method never increases ECE
  versus raw.
- **The literature churn prior does NOT improve synthetic calibration.**
  `compareGhostPriorBlend` quantifies that blending the model ghost toward the
  churn prior *worsens* held-out ghost ECE on synthetic data (the synthetic ghost
  rate sits below the telecom-anchored base rate, so pulling toward it mis-scales).
  `compareGhostPriorRanking` further shows the prior helps **neither** calibration
  **nor** ranking against a fitted synthetic model. The prior's value is therefore
  strictly **cold-start** (when there is *no* fitted model) — which is exactly how
  it is wired. This is the un-spun finding and it is the reason `calibrated` stays
  `false`.

(Exact numbers: `ORACLE_EVAL.md` §4, §10, §11.)

---

## 3. Real-world grounding of the ghost hazard

Because real *solar* outcome labels are scarce (only a handful of absorbed leads
exist), the **ghost** side is grounded in published, cited statistics from
adjacent domains. These are **REAL external benchmarks / cross-domain anchors —
never presented as this installer's solar outcomes. SIGN is never grounded.**

### `churn-prior.ts` — the cold-start prior

Encodes cited constants (`CHURN_DATA`) and turns them into an informative ghost
prior:

- **MIT / InsideSales.com Lead Response Management Study** → re-engagement odds
  collapse with elapsed time, modeled as an exponential odds decay with a
  documented 3-day half-life (`reengagementOddsMultiplier`).
- **IBM "Telco Customer Churn"** (overall 26.5%; month-to-month 47.4% vs two-year
  2.8%) → a base-rate anchor plus a financing-as-commitment analog (bounded ±30%,
  not the raw spread).
- **Sales follow-up research** (~80% of deals need 5+ touches) → an
  engagement-relief term (active sequence → lower ghost).

`churnGhostPrior` combines base rate + silence pressure + engagement relief;
`blendWithPrior` is the convex pull used to shrink the model ghost toward it.

**Honest caveat:** this prior is **cold-start-only**. It is a grounding / ranking
aid for the era before a real fitted model exists; it does *not* improve
calibration against the synthetic model (see §2) and it never flips the live
`calibrated` flag.

### `real-benchmark.ts` — proof the machinery learns real labels

`benchmarkRealChurn` runs the **exact** ghost machinery (`fitMultinomial` +
`evaluate` + Platt) on a deterministic 3,000-row sample of the real **IBM Telco
Customer Churn** dataset (`fixtures/telco-churn-sample.json`). Each customer
becomes one independent person-period row with classes `['stay','ghost']`, so
`predictProbabilities(...).ghost` is the predicted churn. The split is a seeded
by-row shuffle (one row per customer → zero leakage); fit on train, evaluate
held-out. The headline result (AUC ≈ 0.836, see `ORACLE_EVAL.md` §11) proves the
same fitter+calibration that we built and tested on synthetic data learns genuine
signal on **real labels**.

**Honest caveat:** this is a **telecom cross-domain** benchmark. It is **NOT solar
data**, it never scores a real solar lead, and it does **NOT** flip the live
`calibrated` flag (which stays `false` for solar until real *solar* labels exist).
Every value it returns is tagged `domain: 'telecom-churn'` and `calibrated: false`.

---

## 4. The hybrid engine: modes, degradation, guarantees

The engine is split into a **pure core** (`engine-core.ts`, unit-tested under
vitest, all relative imports, no DB/LLM/clock) and a thin **server wiring**
(`engine.ts`, the Next runtime boundary that loads the lead substrate, calls the
LLM provider, and persists).

### Mode (`decideMode`)

Mode is purely a function of **model availability**, not label count:

- **`model`** — a fitted model is in hand. The model supplies the numbers +
  factors; the LLM narrates only blocker / action / evidence. A synthetic model is
  ALWAYS present today (a CV-tuned, process-memoized singleton), so the engine is
  effectively always in `model` mode.
- **`degraded`** — no usable model. The LLM estimates the numbers; the real ghost
  prior becomes the *spine* (the LLM's ghost guess, or the prior itself with no
  LLM, is blended toward the prior with a heavy fixed weight). This path is the
  wiring that takes over only if model construction ever fails.

### `calibrated` is an honesty flag, independent of mode

`calibrated` is `true` only when BOTH (a) ≥ `MODEL_MODE_MIN_LABELS` (30) real
absorbed outcomes exist AND (b) real calibration params have been fit. Neither
holds today, so a synthetic-trained model is a *real model that is honestly flagged
uncalibrated*. Confidence bands tighten with trust: calibrated model ≈ ±8,
uncalibrated model ≈ ±15, degraded ≈ ±22.

### Ghost grounding in the engine

While the model is synthetic/uncalibrated, the engine shrinks the model's ghost
CIF toward the churn prior by `DEFAULT_SYNTHETIC_GHOST_PRIOR_WEIGHT = 0.35`; once
a real calibrated model exists the weight drops to `0` (trust the model). Sign is
never touched. None of this makes the model `calibrated`.

### Degradation guarantees (`scoreOracle` degrades, it does not crash)

- **Missing `predictions` table** (PostgREST `PGRST205`, e.g. migration not yet
  applied) or any read error on prior predictions ⇒ `[]` (no trend slopes), never
  throws.
- **Same PGRST205 / error on the absorbed-lead count** ⇒ `0` (stays uncalibrated).
- **LLM provider failure of any kind** ⇒ deterministic fallback: in model mode the
  blocker is derived from the top factor (`deterministicBlocker`) with a templated
  action; with no LLM and no model, neutral 45/45.
- **Prediction INSERT failure** ⇒ the rich score is still returned with
  `predictionId = createdAt = null` (unpersisted).
- The **only** thing that throws is a genuinely missing lead (`"Lead not found"`).

### Promotion trigger

The engine switches to a real-trained, calibrated model when, for the installer,
`count(leads where status in (closed, ghosted)) >= MODEL_MODE_MIN_LABELS` **and**
real calibration params exist for the current `model_version`. The harness and
schema for that switch are already in place — only the real labels are missing.

---

## 5. File map

| File | Role |
|---|---|
| `contracts.ts` | **Frozen** public types + tunable constants: `FEATURE_NAMES`, `TIME_VARYING_FEATURES`, `PERIOD_OUTCOMES`, `BLOCKER_CODES`, `FittedModel`, `CalibrationParams`, `RichPrediction`, horizon/threshold/version constants. Read-only after Phase A. |
| `synthetic.ts` | Deterministic-by-seed labeled corpus generator (mulberry32). Samples leads, derives economics via the shared `computeSolarEconomics`, draws daily competing-risks outcomes from known latent betas (returned in `trueCoefficients` for recovery checks). Purity: no `Date.now`/`Math.random`. |
| `person-period.ts` | `expandToPersonPeriods` (one row per active day, correct absorption/censoring, fractional `daysObserved` floored) + `advanceCovariates` (rolls the RAW vector forward under the no-touch counterfactual). |
| `features.ts` | `assembleFeatures` (lead substrate → typed `OracleFeatures`, clock injected via `nowMs`) and `featuresToVector` (project onto `FEATURE_NAMES`). `leastSquaresSlope` for trend features. |
| `model/linalg.ts` | Pure vector/matrix primitives + numerically-stable `softmax` / `logSumExp`. |
| `model/fitter.ts` | `fitMultinomial` (L2 multinomial logit GD), `predictProbabilities`, `computeStandardization`, and `crossValidateL2` (lead-aware k-fold L2 selection). |
| `model/competing-risks.ts` | `cumulativeIncidence` (no-touch competing-risks CIF) + `attributeFactors` (standardized-coefficient drivers). |
| `calibration.ts` | `evaluate`, `fitCalibration`/`applyCalibration` (Platt/isotonic), `calibrateFromCorpus`, `calibrateFromCorpusHonest`, `selectCalibration`, and the honest `compareGhostPriorBlend` / `compareGhostPriorRanking` prior-impact harnesses. |
| `eval.ts` | Golden-direction checks on the 5 seed leads (`buildSeedFeatures`, `runGoldenCases`), the full `runEvalReport`, and `backtestPredictions` (replays stored snapshots vs final status — the harness real labels will feed). |
| `churn-prior.ts` | Cited real-world churn/lead-response constants → `churnGhostPrior` + `blendWithPrior`. Cross-domain cold-start anchor, never labeled solar outcomes. |
| `real-benchmark.ts` | `benchmarkRealChurn` — runs the exact ghost machinery on the real IBM Telco Churn fixture. Cross-domain proof; `calibrated: false`, `domain: 'telecom-churn'`. |
| `fixtures/telco-churn-sample.json` | Deterministic 3,000-row sample of IBM Telco Customer Churn (real labels) used by `real-benchmark.ts`. |
| `engine-core.ts` | **Pure** engine heart: `decideMode`, `confidenceBand`, `computeModelNumbersAndFactors`, `assembleRichPrediction`, deterministic blocker/action fallbacks, ghost grounding (`GhostPriorGrounding`). |
| `engine.ts` | **Server-only** wiring: `scoreOracle(leadId)` — load substrate (RLS-scoped), assemble features, fit/memoize the synthetic model, run model + LLM layers, persist. Owns `Date.now()`, `@/` imports, and all degradation guarantees. Never runs under vitest. |

**Related (outside this module, in `lib/ai/`):** `blocker-taxonomy.ts` (names +
definitions for `BLOCKER_CODES` + the zod enum), `prompts.ts`
(`buildOraclePrompt`), `provider.ts` (`generateOracleLlm`), `schemas.ts`
(`oracleSchema`) — the LLM qualitative layer the engine narrates with.

---

## 6. Running the tests

The pure libraries are fully unit-tested under vitest (every `*.test.ts` next to
its source). vitest has **no `@/` alias**, so the tested files use relative value
imports and `import type` for types; `resolveJsonModule` is on for the JSON
fixture.

```sh
# whole oracle suite (model, calibration, eval, golden cases, real benchmark)
corepack pnpm --filter web exec vitest run --root src oracle

# a focused subset
corepack pnpm --filter web exec vitest run --root src oracle real-benchmark churn-prior

# full app suite + typecheck + lint
corepack pnpm --filter web test
corepack pnpm --filter web typecheck
corepack pnpm --filter web lint
```

The golden-direction and calibration-improvement assertions are permanent parts of
the suite (`eval.test.ts`, `calibration.test.ts`); `real-benchmark.test.ts` pins
the cross-domain benchmark. See `ORACLE_EVAL.md` for the reproduced numbers.
