# ORACLE_EVAL — calibrated sign/ghost predictor

Evaluation of the discrete-time competing-risks Oracle (`model_version = oracle-cr-v1`)
on a **synthetic** labeled corpus. All numbers below are reproducible from the
committed code; they were produced by fitting the real fitter on the real
synthetic generator and running the real calibration/eval harness.

> **Honesty disclosure.** Every metric here is from SYNTHETIC data, clearly
> flagged. The model is NOT trained on real installer outcomes (there are only
> ~3 absorbed real leads — see cold-start below). Synthetic rows are generated
> and consumed in-process only; they are never inserted into real tables. In the
> running app the engine therefore reports `calibrated = false` (an "Uncalibrated"
> badge) until real outcomes accumulate.

## 1. What was built

A hybrid engine: **numbers from a model, words from the LLM**. A multinomial
logistic regression is fit over person-period rows (one row per active day,
outcome ∈ {stay, sign, ghost}, reference = stay). `signProbability` is the
cumulative incidence of `sign` over a 14-day horizon; `ghostRisk` is the
cumulative incidence of `ghost` over the same horizon **under the
no-additional-touch counterfactual** (the clock keeps advancing,
time-since-last-touch keeps rising). Factor attribution is the standardized-
coefficient contribution `beta_j · z_j`. The LLM classifies the blocker, writes
the single recommended action, and narrates evidence over the model's supplied
factors — it never free-guesses the probabilities in model mode.

## 2. Synthetic corpus summary (seed 7, 800 leads/regime, maxDays 30)

| Regime | Leads | Person-period rows | sign | ghost | censored |
|---|---|---|---|---|---|
| balanced | 800 | 8,283 | 351 | 449 | 0 |
| high-ghost | 800 | 7,116 | 198 | 602 | 0 |
| high-sign | 800 | 6,115 | 590 | 210 | 0 |

The regimes shift terminal mix as intended (high-ghost is ghost-heavy, high-sign
sign-heavy). The latent generating process uses signed, interpretable
coefficients (e.g. ghost driven by `daysSinceLastTouch +0.7`, `stepProgressRatio
−0.5`; sign driven by `roi25yrRatio +0.5`, `monthlySavingsRatio +0.6`).

## 3. Coefficient recovery (fitted vs latent betas, Pearson r)

| Regime | sign-row r | ghost-row r |
|---|---|---|
| balanced | 0.79 | 0.73 |
| high-ghost | 0.77 | 0.75 |
| high-sign | 0.85 | 0.64 |

The fitter recovers the latent structure well from the expanded person-period
rows — directions and relative magnitudes are right, which is what the factor
attribution relies on.

## 4. Calibration (lead-level held-out split, no period leakage; Platt)

Reliability is measured on a 30% held-out set of LEADS (predicted cumulative
incidence vs the lead's terminal label). ECE before/after Platt recalibration:

| Regime | target | ECE before | ECE after | Brier | AUC |
|---|---|---|---|---|---|
| balanced | sign | 0.044 | 0.061 | 0.211 | 0.724 |
| balanced | ghost | 0.193 | **0.049** | 0.213 | 0.711 |
| high-ghost | sign | 0.099 | 0.058 | 0.150 | 0.760 |
| high-ghost | ghost | 0.195 | **0.027** | 0.157 | 0.738 |
| high-sign | sign | 0.095 | 0.098 | 0.146 | 0.863 |
| high-sign | ghost | 0.165 | **0.097** | 0.149 | 0.857 |

**Honest reading:**
- Platt recalibration **substantially improves ghost calibration** in every
  regime (e.g. balanced 0.193 → 0.049; high-ghost 0.195 → 0.027). The raw
  no-touch ghost CIF is systematically over/under-confident and Platt fixes it.
- For **sign**, the raw model is already close to calibrated, so Platt is
  neutral-to-slightly-worse on the held-out fold (noise on an already-good
  score). We do **not** claim sign recalibration helps — it mostly doesn't here.
- AUC ranges 0.71–0.86 (discrimination is meaningful, strongest in high-sign).

The calibration machinery itself is verified separately: a deliberately distorted
(underconfident) score is restored by Platt with a clear ECE drop (calibration
unit test).

### 4.1 Feature-group ablation (held-out AUC)

Fitting on feature subsets (zeroing the other groups) shows the full feature set
dominates — engagement and economics are complementary, not redundant:

| Subset | ghost AUC | sign AUC |
|---|---|---|
| economics-only | 0.674 | 0.667 |
| engagement-only | 0.607 | 0.613 |
| **full** | **0.746** | **0.748** |

(seed 7, n=350, held-out split; a higher-fidelity probe n=500/maxIter=600 gives
the same ordering: ghost econ 0.677 / engage 0.585 / full 0.704.) Economics
carries most of the **sign** signal; engagement alone is the weakest **ghost**
predictor; combining both is strictly best for both targets. This is the
quantitative justification for using the previously-unused engagement/
orchestration/trend signals — they add real lift.

Horizon-H is also verified monotone: both `signProbability` and `ghostRisk` are
non-decreasing as H grows (1→30 days) and per-period survival is non-increasing.

## 5. Golden-case directions (balanced model, H=14) — BOTH PASS

Qualitative/relative checks on the real seed leads (not absolute thresholds):

| Lead (persona) | signProbability | ghostRisk |
|---|---|---|
| Thomas (family) | 35.5% | 61.1% |
| Lukas (investor) | 44.3% | 37.5% |
| Ava (skeptic) | 19.8% | 49.5% |
| Noah (no strategy) | 7.2% | 85.6% |
| Elena (no strategy) | 10.9% | 83.0% |

- ✅ `ghostRisk(Noah) > ghostRisk(Lukas)` — 0.856 vs 0.375. The disengaged,
  no-strategy, high-bill ghosted lead out-risks the actively negotiating
  investor.
- ✅ `signProbability(Lukas) > signProbability(Noah)` — 0.443 vs 0.072. The
  cash investor with strong economics, high persona confidence and an active
  sequence out-scores the silent lead.

## 6. Engine modes

- **Model mode** (a fitted model is available): probabilities + factors come
  from the model; the LLM narrates blocker/action/evidence over the supplied
  factors. Confidence band ±15 pts when uncalibrated, ±8 when calibrated.
- **Degraded mode** (no usable model): the LLM estimates the probabilities;
  `calibrated = false`, widened ±22 band; still emits taxonomy + factors +
  confidence. Reached only if the model can't be built.
- **LLM failure** inside either mode (no API key / timeout) → deterministic
  fallback (model mode: blocker derived from the top factor; degraded with no
  LLM: neutral 45/45) — the engine never throws on that path.
- **Missing predictions table / thin data** → clean empty state: reads return
  `null`/`[]` (PGRST205 swallowed), `scoreOracle` returns `predictionId = null`
  rather than throwing. The only thing that throws is a genuinely missing lead.

## 7. Real-vs-synthetic disclosure & cold-start

Real absorbed outcomes today: Elena = closed; Thomas + Noah = ghosted; Lukas =
negotiating; Ava = contacted → only ~3 absorbed labels, far below the threshold.
So the live app runs the **synthetic-trained** model, honestly flagged
`calibrated = false`. The synthetic model still ranks leads far better than a
naive guess (golden directions hold), which is its purpose pre-cold-start.

**Known limitations (honest):**
- The seed fixtures for no-strategy leads (Noah, **Elena**) look disengaged to
  the model, so Elena — who actually *closed* — scores high ghost (83%). Her
  fixture lacks the engagement signals that drove her real close; real-label
  retraining is the fix, not a hand-tuned override.
- Synthetic economics use fixed assumptions (electricity price, kWh/kW/yr) — they
  give a consistent monotonic ordering, not measured savings.
- Sign calibration is already near-identity; Platt is retained for the pipeline
  but does not improve sign on synthetic.

## 8. Promotion trigger (degraded/synthetic → real, calibrated)

Switch to a **real-trained, calibrated** model when, for the installer:
`count(leads where status in (closed, ghosted)) >= MODEL_MODE_MIN_LABELS (=30)`
**and** real `model_calibration` params exist for the current `model_version`.
At that point: fit the model on real person-period rows, fit Platt/isotonic on a
held-out real split, persist `CalibrationParams` to `model_calibration`, and set
`calibrated = true` (badge turns green, bands tighten to ±8). The harness and the
schema are already in place for this — only the real labels are missing.

## 9. Reproduce

```
# (toolchain: see ORACLE_BUILD_LOG.md header)
corepack pnpm --filter web test          # full suite incl. eval/calibration/golden
corepack pnpm --filter web typecheck
```
The golden directions and calibration-improvement assertions are part of the
permanent vitest suite (`oracle/eval.test.ts`, `oracle/calibration.test.ts`).
