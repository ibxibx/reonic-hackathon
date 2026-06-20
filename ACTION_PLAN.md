# 🚀 RayCiprocity — 20-Hour Build Plan

**Track:** Reonic · AI-Powered Marketing for Renewable Installers
**Build window:** ~20h left · **Submit:** Sunday 14:00
**Stack (actual repo):** Next.js **16** (App Router, RSC, Turbopack) · Supabase (Postgres + Auth + RLS + Storage) · Vercel AI SDK · ElevenLabs / Twilio / Resend

> *"We don't just generate emails. We turn a solar quote into a diagnosed, persona-matched, multi-channel closing strategy — and tell the installer exactly why each customer is stalling and what to do next."*

---

## ✅ Already shipped (don't rebuild)

- Auth + RLS + base schema: `profiles, leads, quotes, strategies, messages` + `voice-notes` storage bucket
- Lead CRUD: list table, new-lead form, detail page, status badges, delete
- **Persona** detection (family / investor / environmentalist / skeptic) + multi-channel strategy gen (email / SMS / call / voice) as JSON via `lib/ai`
- Strategy timeline UI: editable step cards, persona badge, rationale, **voice-note player**
- Integration adapters: `elevenlabs.ts`, `resend.ts`, `twilio.ts` with `MOCK_EMAIL` / `MOCK_SMS` flags
- Seed data (8+ leads) — just expanded

## 🎯 What Reonic actually scores (from the official track brief)

The brief's **CORE** ask is simpler than our PRD. Build the CORE first; everything else is bonus.

**Core success criteria (must nail these):**
- **"Would an installer actually use this? Does it help close deals?"** — the brief's #1 lens. Every feature is judged against real installer usefulness, not novelty. When choosing what to polish, optimize for *credible and usable* over *clever*.
- **Believable, tailored strategy** — feels customer-specific, not templated. Shows *why this, this tone, this timing*.
- **Visual & usable** — "something an installer would show their sales manager." Not a text dump.
- **Iterable** — installer can tweak messaging / timing / approach.
- **2+ example profiles** demoed live, showing real variety.

**Bonus points (our differentiators map directly):**
- Predictive insights ("might ghost" / "ready to close") → **the Oracle**
- Something unexpected → **the 40-code diagnosis** (and/or a richer *input* — see below)
- Multi-channel smarts (SMS, call, voice) → **already shipped**
- Localization (DE/EN) · Beautiful UX · **A/B testing** (currently unbuilt — deliberate cut unless we reach Phase 5 with time)

> **Two brief-blessed angles we're currently NOT using — decide consciously, don't skip by accident:**
> - **Input is open-ended.** The brief invites "JSON / CSV upload / *conversational chatbot interview*" as input. We default to the lead form. A conversational intake could itself be the "something unexpected" — flag as an option, not a commitment.
> - **Customer-facing output.** The brief twice mentions an artifact the installer can *send to the customer directly* (proposal deck). We're 100% installer-facing (sales-manager view). A one-click customer-shareable summary is a distinct, low-cost wow if Phase 5 has room.

> **Reonic's explicit note: "No massive documentation needed. Impress us with what you build, not what you write about building it."** Keep the README minimal — just enough to satisfy the submission rules.

## 🔨 Remaining work — priority order (cut from the bottom)

1. **CORE polish** — persona strategy believable + visual + 2 demo profiles · *this is the floor; the base flow is already built*
2. **The Oracle** — sign/ghost prob + predicted blocker + one next action · *highest-value bonus*
3. **Problem Codes** — the 40-code diagnosis · *"something unexpected" bonus*
4. **Interactions log** + engagement signals (E1/E2/E3)
5. **Surveys** (resolve uncertain codes) — *cut candidate*
6. **Keep-warm cadence** + dashboard risk column — *cut candidate*

> **Reframe vs. earlier draft:** Codes dropped from #1 to #3. The brief's core is "tailored strategy + visual + iterable," which the shipped persona flow already covers. Lock that and the Oracle before investing 6 hours in 40 codes.

---

## ⏱️ Phase-by-phase

### Phase 0 — Unblock & baseline · hours 0–1 · **everyone**
Get the app running against Docker-Supabase before writing any feature.

```
pnpm database#start          # waits, prints keys
pnpm supabase:sync-env
pnpm gen-types-local
pnpm dev
```

- Log in → create a lead → generate persona strategy → play a voice note (mock or real).
- **Lock the demo account + seed data now.**

**Done when:** one lead goes intake → strategy → voice note with zero errors.

---

### Phase 1 — CORE polish (the scored floor) · hours 1–5
The brief's core ask is *believable, tailored, visual, iterable, 2+ profiles*. The base flow exists — make it demo-grade. **No new schema, no new tables.** Surgical only.

**Phase 1 team: Ian, Sebastian, Ismael** (Eng 1 + Eng 2 are on other work). Three people, three different files, zero collisions:

| Sub-task | Owner | File(s) — exclusive |
|---|---|---|
| **1c** Editable cards → **1d** polish | **Ian** | `data/user/messages.ts`, `components/strategy/timeline-step.tsx` |
| **1b** "Why this" prompt | **Ian** (+ Ismael feedback loop) | `lib/ai/prompts.ts` |
| **1a** Seed: 2 contrasting leads | **Sebastian** | `apps/database/supabase/seed.sql` |
| **1a** Output QA / "still templated?" judging | **Ismael** | *(no files — runs the app, feeds notes to Ian's 1b)* |

**Run by risk, not by label order:** 1c first (missing CORE feature, highest risk) → 1a seed drafts in parallel (unblocks 1b) → 1b (Ian+Ismael loop) → 1d last (cosmetic, first to cut).
**Collision rule:** only Ian touches `timeline-step.tsx`; only Sebastian touches `seed.sql`. 1c and 1d are the *same file* — do them sequentially, never in parallel.

**1c · Iterability is real** ✅ **DONE** *(do FIRST — it's the missing CORE feature)* — there is **no edit path today**: cards render read-only and `data/user/messages.ts` has no `updateMessage` action (verified). Add `updateMessageAction` (edit body + subject, save to DB) and make the timeline cards editable. The installer adjusting a message live is a core demo beat the brief explicitly rewards. *Shipped: `updateMessageAction` (ownership-checked, blocks edits on sent), pencil-to-edit UI in `timeline-step.tsx`.*

**1a · Two contrasting demo profiles** — pick 2 seed leads that show maximum variety (e.g. a numbers-driven *investor* vs. a reassurance-seeking *family*). Confirm each generates a visibly different strategy, tone, and channel mix. This is a literal deliverable ("example output for at least 2 profiles").

**1b · "Why this" is visible** ✅ **DONE** — the rationale + per-step reasoning must read as customer-specific, not generic. Tighten the prompt in `lib/ai/prompts.ts` so each step states *why this channel, why this tone, why now*. No code beyond prompt edits. Ismael judges output and flags where it still reads templated.

**1d · Visual credibility** *(do LAST — cuttable)* — the timeline should look like something shown to a sales manager: persona badge, channel icons, clear sequence. Polish spacing/hierarchy only; don't redesign.

**Done when:** two different leads each produce a distinct, believable, **editable** strategy that looks presentable — demoed live end-to-end.

---

### Phase 2 — The Oracle (highest-value bonus) · hours 5–10 ✅ **DONE**

**2a · Schema** ✅ — `predictions(lead_id, sign_prob, ghost_risk, predicted_code, recommended_action, evidence, created_at)`, same RLS pattern. *Shipped as migration `20260620110000_create_predictions.sql`.*

**2b · AI action** ✅ — `generateOracle(leadId)`: lead + quote + interaction signals → sign_prob, ghost_risk (0–100), single predicted blocking objection, one recommended action (channel + timing + angle) + evidence. Strict JSON via existing `lib/ai/provider.ts`.
**⚠️ Skip pgvector/RAG** — feed structured rows straight into the prompt. RAG over-engineering is an explicit risk.
**Note:** Oracle now ships *before* Problem Codes. Predict the blocker from persona + quote + (later) interactions. Once codes exist (Phase 3), feed the code stack in to sharpen the prediction — but don't block the Oracle on them.

**2c · UI** ✅ — `components/strategy/oracle-panel.tsx`: two gauges (recharts, already a dep), predicted-objection chip, "one recommended action" card with a CTA that jumps to that channel's step. Top of the lead detail page.

**Done when:** open a lead → *"68% sign / 41% ghost, blocker P2, recommended: WhatsApp voice note today"* with evidence. **Demo beat #2.** ✅

---

### Phase 2.5 — Orchestrator (per-lead strategy-execution state) · **Ian + Ivan** ✅ **DONE**
A hybrid state manager that tracks where each lead sits in its strategy sequence and drives what happens next. **DB holds the state; AI defines the strategy and the detail of each step.** Built before Ian's 2b Oracle action. The Oracle still ships as planned (Phase 2) — the orchestrator consumes the Oracle's output, it does not replace it.

**Concept:** each lead is assigned a strategy-execution **state** = which step of its multi-channel sequence it's currently on (e.g. `step 0 / not started` → `step 2 / call sent, awaiting reply` → `done`). The orchestrator reads lead data + the generated strategy, advances the state, and exposes "what's the next step for this lead and why."

**2.5a · Schema (DB = source of truth for state)** ✅ — NEW migration, never edit existing:
`apps/database/supabase/migrations/20260620130000_lead_orchestration.sql`
- `lead_orchestration(lead_id, strategy_id, current_step, total_steps, status, next_action_at, updated_at)` — one row per active lead. `status ∈ (not_started, in_progress, awaiting_reply, completed, paused)`.
- RLS: copy the `strategies` policy pattern verbatim (`exists(... leads.installer_id = auth.uid())`).
- index on `(lead_id)`. Apply → `pnpm gen-types-local`.

**2.5b · State logic (DB-driven, no AI)** ✅ — `data/user/orchestration.ts`: server actions to `initOrchestration(leadId)` (seed state from the strategy's step count), `advanceStep(leadId)` (move current_step forward, flip status, set next_action_at), `getOrchestrationState(leadId)`. Plain TS + SQL — deterministic, no model call. Match the existing `authActionClient` + ownership pattern from `data/user/messages.ts`.

**2.5c · AI defines the per-step detail** ✅ — reuse the existing strategy generation (`lib/ai`) as the source of *what each step is*; the orchestrator does not re-prompt per step. When a step advances, surface that step's already-generated message + its "why this / why now" goal. *Shipped: the lead detail page surfaces the NEXT step's actual message + goal (`current_step + 1` → matching `sequence_order`).*

**2.5d · UI hook** ✅ — minimal: show each lead's current state on the lead detail page (e.g. "Step 2 of 4 · awaiting reply · next touch due today"). Full dashboard wiring is Phase 4's engagement column — don't duplicate it here; just expose the state.

**Done when:** opening a lead shows its current strategy-execution step + status from the DB, and advancing a step (e.g. after a send) visibly moves the state forward and persists. ✅

> **Live wiring shipped (beyond original spec):** strategy generation auto-seeds the orchestration row; every successful email/SMS send auto-advances the step (`bumpStep` in `lib/orchestration-core.ts`). The orchestrator is no longer inert — it drives and reflects the real send flow.

> **Boundary vs. Phase 4:** orchestration = *execution position* (which step, deterministic). Phase 4 engagement signals (E1/E2/E3) = *temperature* (cold/re-engaged/hot, recency-derived). Related but distinct — don't merge them; the orchestrator's `status` can later feed the engagement view.

---

### ✨ Phase 2.7 — Built but not originally in the plan (all ✅ DONE)
Work that emerged during the build and shipped. Listed here so the plan reflects reality.

**Inbound reply triage + outreach pivot** ✅ *(the strongest unplanned demo beat)* — `data/user/inbound.ts`, `components/strategy/inbound-panel.tsx`, migration `20260620140000_inbound_messages.sql`.
- A customer reply "lands on the dashboard" via a paste-a-reply panel on the lead detail page.
- AI categorizes intent: **interested / objection / ghost_risk / ready_to_close** (`categorizeInbound`), persisted to `inbound_messages` with reasoning + suggested next step.
- The orchestrator **reacts**: objection → hold (in_progress), ghost_risk → paused, ready_to_close → awaiting_reply.
- **The outreach actually pivots:** `adaptStrategy` rewrites ALL remaining unsent messages to convincingly tackle the customer's concern (acknowledge-then-address, persona tone, no invented numbers). Verified live against `gpt-4o` — e.g. an objection about winter production rewrites the SMS/call/voice to address diffused-light performance + financing.
- **Done when:** paste an objection → it's categorized, the timeline messages visibly change to address it, and the reply appears in the timeline. ✅

**Customer replies interleaved into the Outreach Timeline** ✅ — `components/strategy/inbound-timeline-entry.tsx`, `strategy-timeline.tsx`. Inbound replies render as customer-side entries, chronologically ordered (by `sent_at` / `created_at`) so the back-and-forth reads in sequence.

**Archetype classifier agent** ✅ — `data/user/classify-archetype.ts`, `classifyArchetype` in `lib/ai/provider.ts`. Standalone first-pass agent: lead → single archetype + confidence + signals + reasoning. Stateless; the orchestrator can call it before defining a strategy.

**Anthropic → OpenAI provider swap** ✅ — full migration to `@ai-sdk/openai` (`gpt-4o` default via `OPENAI_MODEL`). Provider, integration-status, settings UI, env types all updated. *(Note: OpenAI strict JSON-schema mode requires every key in `required` — use `.nullable()`, never `.optional()`, on AI schemas.)*

**Dev-only agent step logging** ✅ — `lib/ai/agent-log.ts`. Tagged, timestamped `[agent:<name>]` step logs across all agents (archetype / strategy / oracle / inbound / orchestrator). Greppable, secret-safe, silenced in prod or via `DEBUG_AGENTS=false`.

---

### Phase 3 — Problem Codes ("something unexpected" bonus) · hours 10–15
Only start once Phases 1–2 are demo-ready. This is upside, not the floor. Parallelize schema / AI / UI.

**3a · Schema** — NEW migration file (never edit the existing one):
`apps/database/supabase/migrations/20260620120000_problem_codes.sql`
- `problem_codes(id, lead_id, code, family, confidence, evidence, resolved_at, created_at)`
- RLS: copy the existing `strategies` policy pattern verbatim (`exists(... leads.installer_id = auth.uid())`)
- index on `(lead_id)`
- Apply → `pnpm gen-types-local`

**3b · Taxonomy as data** — `lib/problem-codes.ts`: the 40 codes (code → family, label, counter-strategy, channel, message-angle). Content, not logic — a PM can own it.

**3c · AI** — extend `lib/ai/schemas.ts` with `problemCodes: { code, confidence, evidence }[]`; update `lib/ai/prompts.ts` to return a priority-ordered code stack with verbatim evidence; persist in `data/user/strategies.ts`. Feed the stack into the Oracle prompt to sharpen its predicted blocker.

**3d · UI** — `components/strategy/problem-code-chips.tsx`: colored chips per family. Render on lead detail + as a column in `leads-table.tsx`.

**Done when:** a strategy also produces & displays a stack like `P2 + T2 + C1`, hover-evidence tooltips, persisted in DB.

> **Scope guard:** 40 codes is a lot. If time is tight, ship a *subset* (the ~12 codes that appear in the demo seed leads) rather than all 40. A believable 12-code system that demos cleanly beats 40 codes half-wired.

---

### Phase 4 — Interactions + engagement signals · hours 15–17

- **4a** `interactions(lead_id, channel, direction, content, sentiment, occurred_at)`; log a row on every (real or mock) send.
- **4b** Derive **E1/E2/E3** (going cold / re-engaged / high-intent) from recency — plain SQL/TS, no AI.
- **4c** Dashboard: engagement badge + "needs action today" sort in `leads-table.tsx`. Wire the beat where firing a touch flips **E1→E2** and the Oracle updates.

**Done when:** sending a touch logs an interaction and visibly changes engagement state.

---

### Phase 5 — Polish & demo-proof (CUT-LINE) · hours 17–19

- DE/EN toggle on generated content (prompt-driven, don't hand-author twice)
- Loading skeletons on Oracle + strategy (copy `strategy-skeleton.tsx`)
- **Pre-cache the demo voice-note MP3** — wow moment must never depend on a live call
- Seed realism: 8 leads across all 4 personas + varied code stacks
- `pnpm typecheck && pnpm lint && pnpm test` green · run `pnpm test-db` for new RLS

> **Surveys (FR-6) + full cadence engine are the cut candidates** — below the Oracle in judging value. Build only if you reach here with time to spare.
> **A/B testing (named brief bonus) is consciously cut** unless Phase 5 runs ahead of schedule — cheapest version is a second strategy variant per lead with a "which would you send?" toggle, no new schema. Flagged so it's a *decision*, not an oversight.

---

### Phase 6 — Submit · hours 19–20

**The brief's 3 required deliverables (this IS the submission — nail all three):**
1. **Working prototype** — demoable live. Have the happy path rehearsed + a fallback screen capture.
2. **Example output for ≥2 different customer profiles** — show the variety (investor vs family is the cleanest contrast). This is literal and scored — don't demo just one.
3. **Brief explanation** of the strategy + why this approach. Keep it short (Reonic: "no massive docs").

**Mechanics:**
- README (setup + APIs + tools — **required by rules**; minimal per Reonic's "no massive docs" note)
- 2-min Loom (solution + live walkthrough hitting all 3 deliverables above)
- Record a **fallback screen capture** of the happy path
- Freeze features · public repo · opt-in **before 14:00**

---

## 👥 Team split

**Phase 1 (now):** Ian, Sebastian, Ismael. Eng 1 + Eng 2 are on other work and rejoin from Phase 2.

| Who | Phase 1 (now) | Phase 2+ |
|---|---|---|
| **Ian** | 1c editable cards → 1d polish, 1b prompt | **2.5 Orchestrator (w/ Ivan)** → 2b Oracle action + 3c code-diagnosis prompts/schemas |
| **Ivan** | — | **2.5 Orchestrator (w/ Ian)** — state schema + state logic |
| **Sebastian** | 1a seed: 2 contrasting leads (`seed.sql`) | seed realism + code content library (~12 demo codes) |
| **Ismael** | 1a output QA / templated-check + DE/EN copy | demo script + Loom + README |
| **Eng 1 (rejoins P2)** | — | 2a/3a migrations |
| **Eng 2 (rejoins P2)** | — | Phase 4 interactions/signals + 2c/3d/4c frontend |

---

## ⚠️ Two standing flags

1. **Node 24 vs our 22** — repo declares `engines: node >=24`; dev works on 22 but if a Next 16 build throws an engine error, get one machine on Node 24 as the build/submit box.
2. **PRD says Next 14, repo is Next 16** — build to the repo (16). The PRD framework line is stale.

---

## 🛠️ Engineering Principles (how we build — read before coding)

Full version committed at [`docs/ENGINEERING_PRINCIPLES.md`](docs/ENGINEERING_PRINCIPLES.md). Under a 20-hour clock these aren't optional polish — they're how we avoid burning hours on the wrong thing.

1. **Don't assume. Surface tradeoffs.** State assumptions before implementing. If two interpretations exist, name both — don't silently pick. If a simpler approach exists, say so. If something's unclear, stop and ask.
2. **Simplicity first.** Minimum code that solves the problem, nothing speculative. No abstractions for single-use code, no unrequested config/flexibility, no error handling for impossible cases. If 200 lines could be 50, rewrite. *This is why Problem Codes can ship as 12, not 40, and why the Oracle skips RAG.*
3. **Surgical changes.** Touch only what the task requires. Don't "improve" adjacent code, don't refactor what isn't broken, match existing style. Remove only the orphans *your* change created; flag pre-existing dead code, don't delete it. Every changed line should trace to the request. *Critical with 5 people on one repo — surgical diffs = clean rebases, fewer conflicts.*
4. **Goal-driven execution.** Turn each task into a verifiable goal with a success check (the **"Done when:"** line on every phase above *is* that check). Strong criteria let you loop without re-asking.

> These mirror the per-phase **"Done when:"** acceptance lines — that's the goal-driven loop in practice. If a phase has no clear "done" check, define one before starting.

---

## 🧯 Quick unblocks

- `next-env.d.ts` keeps blocking `git pull` → run once: `git update-index --skip-worktree apps/web/next-env.d.ts`
- Supabase weirdness → `pnpm database#stop` then `#start` (Docker reset)
- Git stderr showing red in PowerShell is normal, not an error
