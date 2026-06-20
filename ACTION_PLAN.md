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

## 🔨 Remaining work — priority order (cut from the bottom)

1. **Problem Codes** — the 40-code diagnosis · *Differentiator #1*
2. **The Oracle** — sign/ghost prob + predicted blocker + one next action · *Differentiator #2, the demo wow*
3. **Interactions log** + engagement signals (E1/E2/E3)
4. **Surveys** (resolve uncertain codes) — *cut candidate*
5. **Keep-warm cadence** + dashboard risk column — *cut candidate*

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

### Phase 1 — Problem Codes (Differentiator #1) · hours 1–7
Biggest chunk. Parallelize schema / AI / UI.

**1a · Schema** — NEW migration file (never edit the existing one):
`apps/database/supabase/migrations/20260620120000_problem_codes.sql`
- `problem_codes(id, lead_id, code, family, confidence, evidence, resolved_at, created_at)`
- RLS: copy the existing `strategies` policy pattern verbatim (`exists(... leads.installer_id = auth.uid())`)
- index on `(lead_id)`
- Apply → `pnpm gen-types-local`

**1b · Taxonomy as data** — `lib/problem-codes.ts`: the 40 codes (code → family, label, counter-strategy, channel, message-angle). Content, not logic — a PM can own it.

**1c · AI** — extend `lib/ai/schemas.ts` with `problemCodes: { code, confidence, evidence }[]`; update `lib/ai/prompts.ts` to return a priority-ordered code stack with verbatim evidence; persist in `data/user/strategies.ts`.

**1d · UI** — `components/strategy/problem-code-chips.tsx`: colored chips per family. Render on lead detail + as a column in `leads-table.tsx`.

**Done when:** a strategy also produces & displays a stack like `P2 + T2 + C1`, hover-evidence tooltips, persisted in DB.

---

### Phase 2 — The Oracle (Differentiator #2, the wow) · hours 7–12

**2a · Schema** — `predictions(lead_id, sign_prob, ghost_risk, predicted_code, recommended_action, evidence, created_at)`, same RLS pattern.

**2b · AI action** — `generateOracle(leadId)`: lead + quote + code stack → sign_prob, ghost_risk (0–100), single predicted blocking code, one recommended action (channel + timing + angle) + evidence. Strict JSON via existing `lib/ai/provider.ts`.
**⚠️ Skip pgvector/RAG** — feed structured rows straight into the prompt. RAG over-engineering is an explicit risk.

**2c · UI** — `components/strategy/oracle-panel.tsx`: two gauges (recharts, already a dep), predicted-objection chip, "one recommended action" card with a CTA that jumps to that channel's step. Top of the lead detail page.

**Done when:** open a lead → *"68% sign / 41% ghost, blocker P2, recommended: WhatsApp voice note today"* with evidence. **Demo beat #2.**

---

### Phase 3 — Interactions + engagement signals · hours 12–15

- **3a** `interactions(lead_id, channel, direction, content, sentiment, occurred_at)`; log a row on every (real or mock) send.
- **3b** Derive **E1/E2/E3** (going cold / re-engaged / high-intent) from recency — plain SQL/TS, no AI.
- **3c** Dashboard: engagement badge + "needs action today" sort in `leads-table.tsx`. Wire the beat where firing a touch flips **E1→E2** and the Oracle updates.

**Done when:** sending a touch logs an interaction and visibly changes engagement state.

---

### Phase 4 — Polish & demo-proof (CUT-LINE) · hours 15–19

- DE/EN toggle on generated content (prompt-driven, don't hand-author twice)
- Loading skeletons on Oracle + strategy (copy `strategy-skeleton.tsx`)
- **Pre-cache the demo voice-note MP3** — wow moment must never depend on a live call
- Seed realism: 8 leads across all 4 personas + varied code stacks
- `pnpm typecheck && pnpm lint && pnpm test` green · run `pnpm test-db` for new RLS

> **Surveys (FR-6) + full cadence engine are the cut candidates** — below the Oracle in judging value. Build only if you reach here with time to spare.

---

### Phase 5 — Submit · hours 19–20
- README (setup + APIs + tools — **required by rules**)
- 2-min Loom (solution + live walkthrough)
- Record a **fallback screen capture** of the happy path
- Freeze features · public repo · opt-in **before 14:00**

---

## 👥 Team split

| Who | Owns |
|---|---|
| **Eng 1 (AI)** | 1c code-diagnosis + 2b Oracle prompts/actions/schemas |
| **Eng 2 (data/integrations)** | 1a/1b migrations + Phase 3 interactions/signals |
| **Eng 3 (frontend)** | 1d chips + 2c Oracle panel + 3c dashboard |
| **PM 1** | 40-code content library + DE/EN message copy |
| **PM 2** | seed realism + demo script + Loom + README |

---

## ⚠️ Two standing flags

1. **Node 24 vs our 22** — repo declares `engines: node >=24`; dev works on 22 but if a Next 16 build throws an engine error, get one machine on Node 24 as the build/submit box.
2. **PRD says Next 14, repo is Next 16** — build to the repo (16). The PRD framework line is stale.

---

## 🧯 Quick unblocks

- `next-env.d.ts` keeps blocking `git pull` → run once: `git update-index --skip-worktree apps/web/next-env.d.ts`
- Supabase weirdness → `pnpm database#stop` then `#start` (Docker reset)
- Git stderr showing red in PowerShell is normal, not an error
