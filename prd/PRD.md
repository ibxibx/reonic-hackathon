# Product Requirements Document

## RayCiprocity — AI Multi-Channel Customer Engagement & Closing Copilot for Solar Installers

**Track:** Reonic — AI-Powered Marketing to Enable Renewable Installers
**Team:** 5 (3 engineers, 2 product) · **Build window:** ~20 hours remaining · **Submit:** Sunday 14:00
**Tech framework:** Next.js 16 (App Router, RSC, Turbopack) + Supabase + Vercel AI SDK *(repo is on 16; earlier "Next 14" references are stale)*

> *"We don't just generate emails. We turn a solar quote into a diagnosed, persona-matched, multi-channel closing strategy — and we tell the installer exactly why each customer is stalling and what to do next."*

---

## 0. Alignment with the official Reonic track brief

> Added after receiving Reonic's official challenge brief. Where this PRD and the brief differ, **the brief wins** — it defines scoring.

**The brief's CORE ask (the scored floor):** take homeowner profile + quote → output a communication strategy that is *strategically sound, visually compelling, actionable/iterable, and multi-channel aware*, demoed live for **2+ customer profiles**. The deliverables are a working prototype, example output for 2+ profiles, and a brief explanation. Reonic states plainly: **"No massive documentation needed. Impress us with what you build, not what you write about building it."**

**What this means for our scope:**
- The base persona → multi-channel strategy flow (already shipped) **satisfies the core**. Lock and polish it first.
- Our **Problem Codes (40)** and **Oracle** are **bonus-point** features ("something unexpected" / "predictive insights"), not the core. Sequence them *after* the core is demo-ready. See `ACTION_PLAN.md` for the phase order (Core → Oracle → Codes).
- **Auth / RLS / multi-tenancy** (already built) is **not scored** by the brief. Spend zero remaining hours hardening it.
- Keep the README minimal. The competition submission rules (§14) still require a README + 2-min Loom, but don't over-invest in docs.

**Brief bonus points and where we hit them:** multi-channel (shipped) · iteration built-in (editable steps) · predictive insights (Oracle) · A/B testing (stretch) · beautiful UX (Phase polish) · localization (DE/EN) · something unexpected (the code system).

**Engineering discipline:** all build work follows `docs/ENGINEERING_PRINCIPLES.md` — simplicity first, surgical changes, goal-driven execution. This is *why* Codes can ship as a ~12-code subset and the Oracle skips RAG.

---

## 1. Problem & Opportunity

In residential solar, deals don't die at the pitch — they die in the silence *after the quote*. The homeowner has the quote in hand, then hesitates, gets distracted, collects competing offers, waits on financing clarity, or quietly ghosts. Installers don't have time to personalize follow-up at scale, so they fall back on generic templates that don't move anyone, with no answer to *"why this message, to this person, in this tone, right now?"*

Research across German, English, Dutch, French, and Italian customer-voice sources (Trustpilot review corpora, consumer-protection complaint records, forums, and 18 verbatim-transcribed YouTube customer/sales videos) confirms the gap is **trust + clarity + timing**, not price alone:

- Buyers distrust the sales model itself (ghosting, reps who can't answer questions, post-sale silence), so post-quote silence *confirms* their distrust.
- They shop multiple quotes and choose on *clarity and confidence*, not lowest price; a slick competitor pitch beats a better-value silent one.
- Hesitation is often a **smoke screen** — "I need to think about it" / *"Ich will mir das nochmal überlegen"* masks a deeper, unspoken blocker. The job is to *diagnose the real reason*, not take the stall at face value.
- Each customer archetype (family, investor, environmentalist, skeptic) needs a *different* reassurance, on a *different* channel, at a *different* tempo.

**Opportunity:** an installer-facing copilot that diagnoses *why* each customer is stalling, assigns a structured **problem code**, runs a personalized multi-channel (WhatsApp / SMS / email / call / voice note) engagement strategy that keeps them warm, and predicts the single next-best action — with reasoning the installer can read, trust, edit, and act on.

---

## 2. Goals & Non-Goals

**Goals**
1. Turn a customer profile + quote into a *diagnosed*, *coded*, multi-channel engagement strategy with explicit reasoning and timing.
2. Detect and code the specific bottleneck(s) per customer (the **Problem Code** system, 40 codes).
3. Keep stalled leads warm via channel-appropriate touches and light surveys that resolve uncertain codes.
4. Give the account manager a predictive **"Oracle"** view: sign/ghost likelihood + the single recommended next action, with evidence.
5. Be visually compelling enough to show a sales manager — and demo-able live in 2 minutes.

**Non-Goals (explicit, to protect the 24h scope)**
- Not building real WhatsApp Business API approval flows — channels are *real where a key exists, gracefully mocked otherwise*.
- Not a billing/CRM replacement; it complements (and ideally plugs into) the installer's existing pipeline.
- No real customer PII at the demo — synthetic/seeded data only.
- Not autonomous sending without installer approval — the human stays in the loop (the AI proposes, they dispose).

---

## 3. Users & Customer Archetypes

**Primary user — the Account Manager / Installer Sales Rep.** Time-poor, juggling 20–60 open leads, no time to personalize. Needs to know *who to touch, how, and why* today.

**Secondary user — the Sales Manager.** Wants pipeline visibility and confidence the team is working the right leads with a defensible strategy.

**The homeowner is the *subject*, not the user** — modeled via four archetypes:

| Archetype | Core need | Winning frame | Preferred channels | Tempo |
|---|---|---|---|---|
| **Family** | Reassurance, peace of mind | "Predictable bills, no surprises; families nearby did this" | WhatsApp + warm call + voice note | Gentle, steady |
| **Investor** | Hard ROI, comparisons | "13% annual return vs. market; 25-yr cashflow table" | Email (data) + SMS nudge | Fast, numbers-first |
| **Environmentalist** | Impact narrative | "Offset ~150 t CO₂ over 25 yrs; energy independence" | Email + WhatsApp story | Mission-led |
| **Skeptic** | Objection handling, proof | "Yes, works in winter; license, insurance, 4.8★ reviews — verify independently" | Call script + documents + low-pressure email | Slow, evidence-led |

> **Research note:** over-explaining causes *Überforderung* ("paralysis by analysis") — a documented stall cause. Persona-matched, simplified messaging beats data-dumping, especially for Family and Skeptic.

---

## 4. ⭐ The Problem Code System (core differentiator)

Every stalled lead is diagnosed into one or more **Problem Codes** — a structured taxonomy of *why* a deal is stuck, each carrying a recommended counter-strategy, channel, and message angle. This is what makes the strategy explainable ("why this, now") instead of a black box. The taxonomy is grounded in verbatim customer-voice research across five languages/markets Reonic serves.

A lead holds a **code stack** (e.g. `P2 + T2 + C1` = "financing-unclear, unproven-installer, comparison-shopping"); the AI composes a strategy addressing the stack in priority order.

### Price & Finance
| Code | Situation | Evidence (verbatim) |
|---|---|---|
| `P1` | Sticker shock / total too high | — |
| `P2` | Financing unclear (rate, term, deposit) | German market: winning frame is "rate ≈ current electricity bill" |
| `P3` | Subsidy/tax/credit confusion (BAFA, KfW, MwSt) — incl. credit *disguised* as subsidy | FR: signing believed-subsidy that's actually high-interest consumer loan |
| `P4` | ROI/payback not believed (blanket claims) | Trigger is *pauschale Versprechen* without roof/usage specifics |
| `P5` | Wants cash but liquidity-constrained / loan-averse | "I don't want to take out a loan / finance it" |
| `P6` | Lock-in / contract-length fear | NL: "I'm stuck in a solar panel contract"; 20-yr lease anxiety; ~3% PPA escalator doubling payments |

### Trust
| Code | Situation | Evidence (verbatim) |
|---|---|---|
| `T1` | Distrusts solar industry generally | Ghosting reputation, "$30k mistakes" |
| `T2` | Distrusts this specific installer (no proof seen) | — |
| `T3` | Scam / paid-but-never-installed fear | DE consumer-protection cases; staatsanwaltschaftliche Ermittlungen |
| `T4` | Opaque contract terms / *unverbindlich* anxiety | — |
| `T5` | High-pressure close / no cooling-off | *"Beim Zweitgespräch wurde keine Bedenkzeit angeboten, man wollte sofortigen Abschluss"* |
| `T6` | Door-to-door / illegal cold-call distrust | FR cold-calling banned since 2020; fake "Stadtwerke" reps |
| `T7` | Widerruf sign-then-regret-then-cancel risk | 14-day cancellation right used as escape hatch |
| `T8` | Disguised-commitment fear (document means more than stated) | FR: *"ce n'est pas une étude, c'est un bon de commande ferme et définitif"* |
| `T9` | Credential-authenticity doubt | FR: *"des logos qu'ils ont copié collé depuis Google image"* (faked RGE/ministry badges) |
| `T10` | Installer-longevity / bankruptcy fear | US "company shuts doors"; NL "installateurs stoppen ermee" — worthless warranties |

### Competition
| Code | Situation |
|---|---|
| `C1` | Actively comparing 2+ quotes |
| `C2` | Has a cheaper competing offer |
| `C3` | Competitor pitched faster / more clearly |

### Fit & Technical
| Code | Situation | Evidence |
|---|---|---|
| `F1` | Roof/shading/orientation doubt | — |
| `F2` | Winter/cloudy-climate performance doubt | — |
| `F3` | System sizing feels wrong (over/under) | "regret not getting 2–3 more panels" |
| `F4` | Heat-pump/EV/battery add-on uncertainty | — |
| `F5` | Renter / not the decision-owner | — |
| `F6` | Roof age / re-roof dependency | "we froze — one more decision caused pause" |
| `F7` | Roof damage / leak fear | "ceiling caved in" |
| `F8` | Technical mismatch / commissioning failure | DE: *"400 Volt bestellt und 230 Volt bekommen... die Lichter fliegen aus"* |

### Life & Timing
| Code | Situation | Evidence |
|---|---|---|
| `L1` | Decision inertia / *Entscheidungsangst* | "I need to think about it"; *"Ich schlafe immer über eine Entscheidung"* |
| `L2` | Spouse/co-owner not aligned (*kein Entscheider*) | rep not speaking to the actual decision-maker |
| `L3` | Waiting on external event (move, roof, tax year) | — |
| `L4` | Seasonal hesitation ("I'll do it in spring") | — |
| `L5` | Moving-house uncertainty | "should I even do this if I might move?" |

### Service & Process
| Code | Situation | Evidence |
|---|---|---|
| `S1` | Delivery/completion-time anxiety | DE: "Wärmepumpen Fiasko — 1 Jahr warten" |
| `S2` | Slow/poor prior communication from us | — |
| `S3` | Paperwork overwhelm (Netzanmeldung, MaStR) | 6–9 docs/project |
| `S4` | Post-install abandonment reputation | *"Du kriegst Enpal nicht ans Telefon wenn du ein schwerwegendes Problem hast"* |
| `S5` | Repair-trust / diagnostic-integrity fear | DE: misdiagnosis cost spiral — wrong part replaced, then "compressor's also dead" |

### Engagement Signal (auto-derived, behavioral)
| Code | Situation | Action |
|---|---|---|
| `E1` | Going cold (no opens/replies in N days) | **ghost risk** → re-warm sequence |
| `E2` | Re-engaged (opened/clicked after silence) | **strike now** → escalate to close |
| `E3` | High intent (asked a buying question) | **ready** → alert manager to call |

**40 codes across 7 families**, each mapped to a counter-strategy, channel, and message angle.

## 4a. Customer Profile Taxonomy (supplementary layer)

In addition to the four archetypes used in strategy generation (Section 3), the following finer-grained customer profile taxonomy has been drafted to inform persona detection and the lead classifier:

| # | Customer Profile |
|---|---|
| 1 | Cost-Conscious Family |
| 2 | ROI Investor |
| 3 | Environmentalist |
| 4 | Technical Skeptic |
| 5 | Busy Professional |
| 6 | Competitor Shopper |
| 7 | Financing-Sensitive Buyer |
| 8 | Energy Independence Customer |
| 9 | Neighborhood Champion |
| 10 | Older Homeowner |

## 4b. Lead Classifier — Input Feature Table

Structured input fields proposed for persona/profile classification and engagement scoring:

**Property & System Fit**
| # | Input Field | Type | Example Values | Signal For |
|---|---|---|---|---|
| 1 | monthly_bill_eur | numeric | 60 – 400 | Deal size, urgency (high bill → price-pressured) |
| 2 | system_size_kw | numeric | 3 – 20 | Deal size, ambition level |
| 3 | has_battery_interest | bool | true / false | ROI Investor, Energy Independence |
| 4 | has_ev_charger_interest | bool | true / false | Environmentalist, Energy Independence |
| 5 | has_heat_pump_interest | bool | true / false | Environmentalist, cross-sell readiness |
| 6 | roof_type | categorical | tile / flat / shingle / other | Technical fit, minor signal |
| 7 | property_ownership | bool | owns / rents | Eligibility, Older Homeowner |

**Financial Profile**
| # | Input Field | Type | Example Values | Signal For |
|---|---|---|---|---|
| 8 | financing_type | categorical | cash / loan / undecided | ROI Investor (cash), Financing-Sensitive (loan) |
| 9 | budget_quote_fit | categorical | covers_full / covers_base_only / unclear | Budget alignment (mirrors Reonic's own scoring) |

**Household & Demographic**
| # | Input Field | Type | Example Values | Signal For |
|---|---|---|---|---|
| 10 | household_size | numeric | 1 – 6 | Cost-Conscious Family |
| 11 | age_bracket | categorical | 25–35 / 36–50 / 51–65 / 65+ | Older Homeowner, Busy Professional |
| 12 | occupation_signal | categorical | employed_ft / self_employed / retired / unknown | Busy Professional, Older Homeowner |

**Lead Source & Behavioral Flags**
| # | Input Field | Type | Example Values | Signal For |
|---|---|---|---|---|
| 13 | lead_source | categorical | contact_form / partner / referral / cold_outreach | Neighborhood Champion (referral), lead quality |
| 14 | num_competing_quotes | numeric | 0 – 4 | Competitor Shopper |
| 15 | mentioned_roi_or_payback | bool | true / false | ROI Investor |
| 16 | mentioned_co2_or_sustainability | bool | true / false | Environmentalist |
| 17 | mentioned_technical_specs | bool | true / false | Technical Skeptic |
| 18 | mentioned_objections | bool | true / false | Technical Skeptic, Competitor Shopper |
| 19 | mentioned_time_constraints | bool | true / false | Busy Professional |
| 20 | mentioned_neighbors_or_community | bool | true / false | Neighborhood Champion |

**Engagement & Readiness Signals**
| # | Input Field | Type | Example Values | Signal For |
|---|---|---|---|---|
| 21 | response_latency_hours | numeric | 1 – 168 | Engagement / readiness, ghost-risk |
| 22 | num_followups_sent | numeric | 0 – 5 | Engagement / readiness |
| 23 | time_since_quote_days | numeric | 0 – 30 | Readiness / urgency |

*Note: fields 21–23 overlap directly with the engagement signal codes (E1/E2/E3) already defined in Section 4's Engagement Signal family, and could serve as their concrete computational basis.*

---

## 5. ⭐ The "Oracle" — Predictive Next-Best-Action (the unexpected feature)

A *Minority Report*-inspired panel on each lead. Using the lead's RAG document store (quote, profile, every logged interaction) the Oracle outputs:

- **Sign probability** and **Ghost risk** (0–100, with trend arrows).
- **Predicted objection** — the problem code most likely blocking the sign, *before* the customer voices it.
- **The one recommended action** — channel + timing + message angle (e.g. "Send a WhatsApp voice note today reframing rate vs. their current bill; they're `P2`-stalled and re-engaged").
- **Confidence + evidence** — which signals drove the prediction, so the manager trusts it.

Mechanically: lead history is embedded into a per-lead RAG store; a scoring prompt produces the probabilities and the single action, grounded in retrieved evidence and active problem codes. Framed honestly as *decision-support*, not a crystal ball.

> **Research-validated tactic baked in:** the "Before I Go" technique — book the next touch *first* so the guard drops, then ask what they'll be turning over in their mind. This surfaces the hidden code. Our survey mechanism automates exactly this.

---

## 6. Channels & Keep-Warm Engine

| Channel | Use | Implementation | Fallback |
|---|---|---|---|
| **WhatsApp** | Warm, high open-rate; family/environmentalist | WhatsApp Business Cloud API | Mock send + preview card |
| **SMS** | Short, time-sensitive nudges; investor | Twilio | Mock toast if no key |
| **Email** | Data, documents, ROI tables; investor/skeptic | Resend | Preview only |
| **Call** | High-touch objection handling; skeptic/family | AI-generated structured call script (text) | Script always shown |
| **Voice note** | Human warmth at scale — the wow moment | ElevenLabs TTS → Supabase Storage → signed URL | Pre-cached MP3 |
| **Survey / micro-poll** | Resolve an uncertain code | 1-tap WhatsApp/SMS question or 2-click emailed poll | Simulated response in-app |

**Keep-warm logic:** a per-lead cadence engine schedules touches by archetype + code + engagement signal. Going-cold (`E1`) triggers a re-warm sequence; re-engagement (`E2`) escalates to a closing touch; high-intent (`E3`) alerts the manager to call now. Research-grounded cadence: follow up in short windows ("in the next day or so") before over-analysis sets in. Surveys deploy when a code is *uncertain* — a light question ("Is it the upfront cost or the timing giving you pause?") resolves `P1` vs `L1` and re-routes the strategy.

> **Design irony to avoid:** customers complain that providers replaced phone support with chatbots. Our voice notes and call scripts must feel *human*, not like the automated wall customers resent.

---

## 7. Functional Requirements

- **FR-1 Lead & Quote intake** — create/import a lead (homeowner profile + quote: kW, total cost, financing type, monthly bill). Seeded demo dataset of ~8 leads across all four archetypes and varied code stacks.
- **FR-2 Diagnosis & coding** — AI analyzes profile + quote + interaction history, detects archetype, assigns a problem-code stack with reasoning.
- **FR-3 Strategy generation** — produces a multi-channel, multi-step sequence (channel, timing, rationale, message body/script) addressing the code stack, persona-matched, as strict JSON.
- **FR-4 Timeline UI** — visual sequence (WhatsApp → email → call → voice note), each step editable before send; shows the *why* per step.
- **FR-5 Channel execution** — send via real API where key present, graceful mock otherwise; log every touch back to the lead (feeding the RAG store + engagement signals).
- **FR-6 Surveys** — generate and "send" a micro-survey to resolve uncertain codes; ingest the response to update the diagnosis.
- **FR-7 Oracle panel** — sign/ghost scores, predicted objection, recommended next action with evidence.
- **FR-8 Manager dashboard** — pipeline (Kanban/table) with per-lead archetype badge, code-stack chips, engagement state, and Oracle risk; sortable by "who needs action today."

---

## 8. Non-Functional Requirements

- **Security / multi-tenant:** Supabase Auth + RLS — each installer sees only their own leads.
- **Resilience:** every external call wrapped + mock-fallback so the demo never hard-fails.
- **Localization:** DE + EN message generation minimum (market is German, judges bilingual); architecture supports NL/FR/IT.
- **Latency:** strategy generation streamed with skeletons; perceived speed > raw speed.
- **Auditability:** every AI decision shows its reasoning + evidence.

---

## 9. Technical Architecture (per Leonardo's production spec)

- **Framework:** Next.js 14+ (App Router, RSC), TypeScript.
- **UI:** Tailwind + shadcn/ui + Lucide; dark SaaS aesthetic; `sonner` toasts.
- **DB/Auth/Storage:** Supabase (Postgres + Auth + Storage, RLS).
- **AI:** Vercel AI SDK → OpenAI/Gemini via Server Actions.
- **Integrations:** WhatsApp Business Cloud API, Twilio (SMS), Resend (email), ElevenLabs (voice).
- **RAG:** per-lead document/interaction store (pgvector in Supabase) feeding diagnosis + Oracle.

**Schema (extends Leonardo's base `profiles` / `leads` / `quotes` / `strategies` / `messages`):**
- `interactions` (id, lead_id, channel, direction, content, sentiment, occurred_at) — warm/cold signal + RAG source.
- `problem_codes` (id, lead_id, code, confidence, evidence, resolved_at) — the code stack.
- `surveys` (id, lead_id, question, channel, response, asked_at, answered_at).
- `predictions` (id, lead_id, sign_prob, ghost_risk, predicted_code, recommended_action, evidence, created_at) — Oracle output.
- `messages.channel_type` enum extended with `whatsapp` and `survey`.
- Storage bucket `voice-notes` (private, signed URLs).
- RLS on all new tables via `lead_id → leads.installer_id = auth.uid()`.

> **Reonic fit:** Reonic's own value prop is "one software, not 24 tools" — every partner sees exactly which stage a customer is in. Our copilot should *extend* their existing customer portal + digital-signature flow, not become tool #25. Position as a module inside the Reonic workflow.

---

## 10. 24-Hour Build Plan (5 people, parallelized)

**Hours 0–2 — Foundation (all):** SQL migration (base + new tables + RLS + pgvector), Supabase middleware, seed the 8-lead demo dataset. Lock the demo script and the one wow moment (Oracle → voice note).

**Hours 2–10 — Parallel tracks**
- *Eng 1 (backend/AI):* diagnosis + problem-code Server Action; strategy generator; zod schemas.
- *Eng 2 (integrations):* WhatsApp/Twilio/Resend/ElevenLabs adapters with mock fallbacks; interaction logging.
- *Eng 3 (frontend):* dashboard, lead view, timeline, editable step cards.
- *PM 1:* problem-code content + persona message libraries (DE/EN, using the verbatim research quotes) + survey copy.
- *PM 2:* demo narrative, seed-data realism, pitch deck, Loom script.

**Hours 10–16 — Differentiators:** Oracle panel (scoring prompt + evidence) + RAG store wiring; survey loop; cadence/keep-warm engine.

**Hours 16–20 — Integrate & polish:** end-to-end happy path; dark-mode polish; loading states; DE/EN toggle; pre-cache the demo voice note.

**Hours 20–23 — Demo-proof:** rehearse the 2-min Loom; record fallback video; freeze features; write the README (setup, APIs, tools — required by the rules).

**Hour 23–24 — Submit:** public repo, README, 2-min Loom, opt-in before 14:00.

---

## 11. Demo Script (2 minutes)

1. Dashboard: 8 leads, archetype badges, code-stack chips, Oracle risk column. "These deals are stalling — here's why."
2. Open a `P2 + T2 + C1` family lead going cold (`E1`). Oracle: "68% sign, 41% ghost-risk rising; predicted blocker `P2`; recommended: WhatsApp voice note reframing rate vs. current bill, today."
3. Click *Generate Strategy* → coded, multi-channel timeline streams in with per-step reasoning.
4. Edit the voice-note script → *Generate Voice* (ElevenLabs) → play the warm German voice note. **Wow.**
5. Fire the WhatsApp touch (real or mocked) → it logs back → engagement flips `E1→E2`, Oracle updates live.
6. Close: "Diagnoses why each customer stalls, picks the right channel and message, predicts the next best action — the persuasion strategy an installer can trust and adapt."

---

## 12. Judging-Criteria Alignment

| Criterion | How we hit it |
|---|---|
| Strategically sound | Problem codes + persona = explicit reasoning |
| Visually compelling | Dashboard + Oracle + timeline |
| Actionable & iterative | Editable steps, survey-driven re-diagnosis |
| Multi-channel | WhatsApp + SMS + email + call + voice + survey |
| Predictive insights | The Oracle (ghost/close) |
| A/B testing | Strategy variants per code (stretch) |
| Localization | DE/EN now; NL/FR/IT-ready (research already gathered) |
| Something unexpected | The Oracle + the 40-code diagnosis system |
| Eleven Labs side challenge | Voice notes as the warmth-at-scale mechanic |

---

## 13. Risks & Mitigations

- *Scope creep* → Oracle + codes are the differentiators; channel breadth is mock-acceptable. Protect the wow path.
- *Live API flakiness* → mock fallbacks everywhere + pre-cached voice note + recorded demo.
- *RAG over-engineering in 24h* → start with a simple per-lead text-embedding store; pgvector only if time.
- *DE/EN content doubling* → generate per-locale via prompt, don't hand-author twice.
- *Full RLS eating build time* → migration includes RLS, but demo can run from a single seeded installer account if needed.

---

## 14. Submission Checklist (per competition rules)

- [ ] Submitted by **Sunday 14:00**
- [ ] Team of **max 5** ✓ (3 eng + 2 product)
- [ ] Project **newly created** at this hackathon (boilerplate allowed — Vercel/Supabase starter)
- [ ] **2-minute Loom** video: solution explanation + live feature walkthrough
- [ ] **Public GitHub repo** with:
  - [ ] Comprehensive README (setup + install instructions)
  - [ ] Documentation of all APIs, frameworks, tools
  - [ ] Sufficient technical docs for jury evaluation

---

## 15. Open Questions (resolve at kickoff)

- Final product name (shortlist: *Momentum, Cadence, Cloze, Chorus, Tailwind, Wingman, Warmline*).
- WhatsApp Business API access in time, or mock-only for the demo?
- Real Reonic API/sandbox access on Saturday — if granted, wire diagnosis to live project data and extend their customer portal directly.

---

### Appendix A — Research basis

Taxonomy grounded in verbatim customer-voice sources across five languages/markets Reonic serves: Trustpilot review corpora (Enpal 23k+ reviews), German consumer-protection complaint records (Verbraucherzentrale), homeowner regret/forum threads, and 18 verbatim-transcribed YouTube customer & sales videos (DE/EN/NL/FR/IT) covering hesitation drivers, post-sale complaints, contract-trap mechanics, heat-pump-specific failures, and successful re-engagement tactics. Reonic-specific insight drawn from the MySolarExpress customer success story and Reonic product documentation.
