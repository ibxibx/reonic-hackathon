# The Oracle — Complete Context Pack (for building a MEGA prompt)

> Paste this whole file into Claude (claude.ai) as context, then ask it to **design / overengineer the Oracle**. Everything Claude needs — domain, stack, every DB table, every variable, dependencies, current code, and the unused signal surface — is below. Nothing external required.

---

## 0. What the Oracle is

**App:** *RayCiprocity* — a Solar AI Sales Copilot. It helps a solar installer close residential leads with (a) AI-generated, persona-aware, multi-channel outreach and (b) predictive prioritization.

**The Oracle** is the per-lead predictive panel on the lead detail page. For one homeowner it currently outputs:
- `signProbability` (0–100) — chance the lead signs if handled well
- `ghostRisk` (0–100) — chance they go quiet without a timely relevant touch
- `predictedCode` — a short, *free-form* provisional blocker code (e.g. `P2`, `F1`, `T2`, `C1`)
- `recommendedAction` — exactly one next move (channel + timing + angle)
- `evidence` — 2–4 specific facts, separating fact from inference

Each run is saved as an append-only snapshot in the `predictions` table and rendered as two radial gauges + a recommended-action card that deep-links into the outreach timeline.

---

## 1. Tech stack & dependencies (exact versions)

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React Server Components, Server Actions, Turbopack) |
| UI | **React 19**, TypeScript 6, Tailwind v4, shadcn/ui + Radix, lucide-react, **recharts** (gauges), **sonner** (toasts) |
| AI SDK | **Vercel AI SDK** `ai@^6.0.208` + **`@ai-sdk/openai@^3.0.72`** — uses `generateObject({ model, schema, system, prompt })` |
| Model | `process.env.OPENAI_MODEL || 'gpt-4o'` (provider was swapped from Anthropic → OpenAI) |
| Validation | **zod `^4.4.3`** — schema passed to `generateObject` (structured output, model retries on mismatch) |
| Server actions | **next-safe-action `^8.5.2`** (`authActionClient` injects `ctx.userId`, validates zod input) |
| DB / Auth / Storage | **Supabase** (Postgres + Row Level Security + GoTrue auth + Storage bucket for voice notes) |
| Other integrations (present, mockable) | ElevenLabs (TTS voice notes), Resend (email), Twilio (SMS) — gated by `MOCK_EMAIL`/`MOCK_SMS` |

AI call settings used today: `maxRetries: 1`, `abortSignal: AbortSignal.timeout(20000)` (20s).

---

## 2. Data model — every table, column, constraint (Postgres)

All tables are in `public`, RLS-enabled. **RLS pattern:** every row is scoped to the signed-in installer via `leads.installer_id = auth.uid()` (profiles scope on `id = auth.uid()`). Select/insert/update/delete policies all enforce this.

**Enums:**
- `lead_status`: `new | contacted | negotiating | closed | ghosted`
- `message_channel`: `email | sms | call | voice`
- `message_status`: `draft | sent | failed`

```sql
profiles(
  id uuid PK -> auth.users(id),
  company_name text not null default '',
  created_at timestamptz
)

leads(
  id uuid PK,
  installer_id uuid not null -> profiles(id),
  name text not null, email text not null, phone text not null, address text not null,
  roof_type text,                      -- 'shingle'|'tile'|'metal'|'flat'|'other' (not enum-constrained)
  monthly_bill numeric(12,2) not null check (>= 0),
  status lead_status not null default 'new',
  created_at timestamptz
)

quotes(
  id uuid PK,
  lead_id uuid not null UNIQUE -> leads(id),   -- exactly one quote per lead
  system_size_kw numeric(10,2) not null check (> 0),
  total_cost numeric(12,2) not null check (>= 0),
  financing_type text not null,               -- 'cash'|'loan'|'lease'|'PPA'
  notes text,
  created_at timestamptz
)

strategies(
  id uuid PK,
  lead_id uuid not null -> leads(id),          -- can have multiple; latest by created_at is "current"
  persona_detected text not null check in ('family','investor','environmentalist','skeptic'),
  persona_confidence numeric(5,2) check (null or between 0 and 1),
  signals text[] not null default '{}',
  strategy_summary text not null,
  rationale text not null,
  created_at timestamptz
)

messages(                                       -- the per-strategy multi-channel outreach sequence
  id uuid PK,
  lead_id uuid not null -> leads(id),
  strategy_id uuid not null -> strategies(id),
  channel_type message_channel not null,
  subject text, content text not null, goal text,
  sequence_order integer not null check (> 0),
  audio_path text,                              -- voice-note object path in storage
  status message_status not null default 'draft',
  sent_at timestamptz, error_message text, provider_message_id text,
  created_at timestamptz,
  UNIQUE (strategy_id, channel_type)            -- one message per channel per strategy
)

predictions(                                    -- ORACLE OUTPUT (append-only snapshots)
  id uuid PK,
  lead_id uuid not null -> leads(id),
  sign_prob numeric(5,2) not null check (0..100),
  ghost_risk numeric(5,2) not null check (0..100),
  predicted_code text,                          -- nullable in DB; free-form
  recommended_action text not null,
  evidence text not null,
  created_at timestamptz
)

lead_orchestration(                             -- execution position of the outreach sequence
  id uuid PK,
  lead_id uuid not null UNIQUE -> leads(id),
  strategy_id uuid -> strategies(id),
  current_step integer not null default 0 check (>= 0),
  total_steps integer not null default 0 check (>= 0),
  status text not null default 'not_started'
    check in ('not_started','in_progress','awaiting_reply','completed','paused'),
  next_action_at timestamptz,
  updated_at timestamptz
)
```

Storage: private bucket `voice-notes`, RLS-scoped to `auth.uid()` folder.

---

## 3. The Oracle today — exact current implementation

### 3a. Output schema (zod → structured output)
```ts
// apps/web/src/lib/ai/schemas.ts
export const oracleSchema = z.object({
  signProbability: z.number().int().min(0).max(100),
  ghostRisk:       z.number().int().min(0).max(100),
  predictedCode:   z.string().min(2).max(50),     // free-form, NOT enumerated
  recommendedAction: z.string().min(20).max(500),
  evidence:        z.string().min(40).max(1200),
});
export type GeneratedOracle = z.infer<typeof oracleSchema>;
```

### 3b. Prompt (verbatim)
```ts
// apps/web/src/lib/ai/prompts.ts  → buildOraclePrompt(lead, quote, strategy|null)
`You are the Oracle for a solar installer. Assess this homeowner's likelihood of
signing and going quiet. Be decisive but calibrated: these are sales prioritization
signals, not facts or guarantees.

## Homeowner data
- Name: ${lead.name}
- Address: ${lead.address}
- Roof type: ${lead.roof_type || 'Unknown'}
- Monthly electricity bill: $${lead.monthly_bill}
- Current lead status: ${lead.status}

## Quote data
- System size: ${quote.system_size_kw} kW
- Total cost: $${quote.total_cost}
- Financing type: ${quote.financing_type}
- Notes: ${quote.notes || 'None'}

## Existing strategy signals
- Persona: ${strategy?.persona_detected || 'Not generated'}
- Signals: ${strategy?.signals.join('; ') || 'None'}
- Strategy summary: ${strategy?.strategy_summary || 'None'}

## Task
- signProbability: integer 0-100 chance the lead signs if handled well.
- ghostRisk: integer 0-100 chance the lead stops responding without a timely relevant touch.
- predictedCode: a concise provisional blocker code such as P2, F1, T2, or C1.
- recommendedAction: exactly one action with channel, timing, and angle.
- evidence: 2-4 specific facts, clearly separating facts from inference.

## Rules
- Use only the supplied data. Do not invent incentives, conversations, rates, deadlines, or intent.
- There are no interaction records yet; do not claim a message was opened, ignored, or answered.
- Use middle-range probabilities when evidence is limited.
- Return only valid JSON matching the schema.`
```

### 3c. Provider call
```ts
// apps/web/src/lib/ai/provider.ts
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateOracle(systemPrompt: string): Promise<GeneratedOracle> {
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const result = await generateObject({
    model: openai(model),
    schema: oracleSchema,
    system: systemPrompt,
    prompt: 'Generate the Oracle prediction for this lead.',
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(20000),
  });
  return result.object;  // throws AppError('AI_GENERATION_ERROR', 500) on failure
}
```

### 3d. Server action (input → fetch → AI → persist)
```ts
// apps/web/src/data/user/oracle.ts  — 'use server'
generateOracleAction = authActionClient
  .schema(z.object({ leadId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    // 1. load lead (must belong to ctx.userId), 2. its quote (.single),
    // 3. latest strategy (.order created_at desc .limit 1 .maybeSingle)
    const oracle = await generateOracle(buildOraclePrompt(lead, quote, strategy));
    // 4. INSERT into predictions { lead_id, sign_prob, ghost_risk, predicted_code,
    //    recommended_action, evidence }
    // 5. revalidatePath(`/leads/${leadId}`) and `/strategy`
    return { predictionId };
  });
```

### 3e. Read + render
- `getLatestPredictionForLead(leadId)` → newest `predictions` row (or null).
- `<OraclePanel leadId prediction>` on the lead detail page (`/leads/[id]`): two radial gauges (sign% in chart-2 green, ghost% in destructive red), `predictedCode` as a mono badge ("Predicted blocker"), `evidence` text, the one `recommendedAction`, and a deep-link that regex-maps the action text to a channel (`voice|email|sms|call`) and jumps to `…/strategy#timeline-step-{channel}`.

---

## 4. The Oracle's available signal surface (KEY for overengineering)

**Currently fed to the model:** lead (name, address, roof_type, monthly_bill, status) · quote (system_size_kw, total_cost, financing_type, notes) · latest strategy (persona_detected, signals[], strategy_summary).

**Available in the DB but NOT yet used by the Oracle** — this is the overengineering surface:
- **`messages`** — the actual outreach: per-channel `status` (draft/sent/failed), `sent_at`, `sequence_order`, `goal`, `content`, `provider_message_id`, `error_message`. (Real engagement signal the prompt currently *forbids* itself from using: "There are no interaction records yet.")
- **`lead_orchestration`** — `current_step` / `total_steps` / `status` (not_started…completed) / `next_action_at`: exactly *where* the lead is in the sequence and whether we're awaiting reply.
- **Prediction history** — `predictions` is append-only; multiple snapshots per lead enable **trend/drift** (is sign_prob rising or falling over time?). Today only the latest is read.
- **`persona_confidence`**, multiple historical `strategies`, `created_at` recency/age of every entity.
- **Portfolio context** — all of an installer's leads (relative ranking, comparables by bill/size/region).
- **Voice notes** — `audio_path` audio assets.
- **Derived/external** (none wired yet): solar economics (payback period, IRR, $/kW, savings vs `monthly_bill`), address → region/irradiance, time-since-last-touch, response latency.

---

## 5. Domain constants (apps/web/src/lib/solar.ts)
```
LEAD_STATUSES   = new | contacted | negotiating | closed | ghosted
ROOF_TYPES      = shingle | tile | metal | flat | other
FINANCING_TYPES = cash | loan | lease | PPA
PERSONAS        = family | investor | environmentalist | skeptic
MESSAGE_CHANNELS= email | sms | call | voice
MESSAGE_STATUSES= draft | sent | failed
formatCurrency  = Intl.NumberFormat en-US USD, 0 decimals
```
Persona meaning: **family** (stability, predictable cost), **investor** (ROI/payback/asset value), **environmentalist** (sustainability/CO₂/independence), **skeptic** (proof/transparency/references).

---

## 6. Realistic example data (from seed) — feed these as test cases

Installer `RayCiprocity Demo Co`. Leads (all USD bill, German + US homeowners):

| Lead | status | bill/mo | system | cost | financing | quote notes (persona cue) |
|---|---|---|---|---|---|---|
| Thomas Schneider | ghosted | $190 | 6.90 kW | $16,300 | loan | family; wants security, predictable cost, regional references before signing |
| Lukas Becker | negotiating | $410 | 12.40 kW | $37,200 | cash | investor; asks IRR/payback/25-yr return; cash vs finance; wants battery |
| Ava Thompson | contacted | $315.50 | 8.90 kW | $31,250 | lease | low upfront, predictable payment |
| Noah Patel | ghosted | $510 | 13.10 kW | $48,600 | loan | needs reassurance on roof penetration + warranties |
| Elena Brooks | closed | $180 | 6.50 kW | $21,900 | PPA | closed comparing payment vs utility bill |

Existing strategies: Thomas→family (0.84), Lukas→investor (0.91), Ava→skeptic (0.74). Messages exist for these (email/sms/call/voice; Lukas's email is `sent`, rest `draft`).

---

## 7. Environment variables
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PROJECT_REF
SUPABASE_SERVICE_ROLE_KEY?            # admin-only, not used in app/src
OPENAI_API_KEY?, OPENAI_MODEL?        # the Oracle's model (default gpt-4o)
ELEVENLABS_API_KEY?, ELEVENLABS_VOICE_ID?
RESEND_API_KEY?, RESEND_FROM_EMAIL?, MOCK_EMAIL?
TWILIO_ACCOUNT_SID?, TWILIO_AUTH_TOKEN?, TWILIO_PHONE_NUMBER?, MOCK_SMS?
DEBUG_AGENTS?                          # set 'false' to silence dev agent logs
```

---

## 8. Conventions, constraints & gotchas
- **Structured output**: always `generateObject` + a zod schema; the model retries on schema mismatch. Numbers are validated (`.int().min().max()`).
- **No hallucinated facts**: prompts forbid inventing incentives, rates, deadlines, conversations, intent.
- **Predictions are immutable snapshots** (insert-only); "refresh" inserts a new row, latest wins.
- `predictedCode` is **free-form** today (no taxonomy) — P2/F1/T2/C1 are just suggestions in the prompt.
- **Auth/RLS**: every query is installer-scoped; server actions get `ctx.userId`; DB enforces via RLS too.
- **Dev logging**: `logStep/logError/startTimer` in `lib/ai/agent-log.ts`, tag `[agent:...]`, never logs secrets/prompts.
- **Sibling AI agents** (same pattern, reusable): `generateStrategy` (full multi-channel strategy) and `classifyArchetype` (first-pass persona classifier). The Oracle is the third agent.
- **Known runtime issue**: the `predictions` table comes from a separate migration; if it isn't applied the lead page errors (`PGRST205 Could not find table public.predictions`). An overengineered version should degrade gracefully when prerequisites/snapshots are missing.

---

## 9. The brief to give Claude (seed for the MEGA prompt)

> Using all the context above, design an **overengineered, production-grade Oracle** for this solar-sales copilot. Specifically produce:
> 1. **A formal blocker/objection taxonomy** to replace free-form `predictedCode` (codes + names + definitions; e.g. Price/Financing/Trust/Timing/Technical/Competition), with a zod enum and a DB migration.
> 2. **A calibrated probability model**: `signProbability` + `ghostRisk` with **confidence/uncertainty**, the factors that moved each score, and calibration guidance (avoid overconfidence on thin data).
> 3. **A richer feature/“sensorium” spec**: which of the *unused* signals in §4 to feed (messages engagement, orchestration position/`next_action_at`, prediction-history trend, solar economics derived from quote+bill, recency), how to summarize each into the prompt, and the new queries needed.
> 4. **A recommended-action engine**: rank the next best move across channels, tie it to the orchestration step + timeline, and justify channel/timing/angle per persona.
> 5. **The exact upgraded artifacts**: new `oracleSchema` (zod), new `buildOraclePrompt`, provider/action changes, DDL/migration changes, and the panel/UX changes (trend sparkline, factor breakdown, confidence band).
> 6. **Evaluation**: how to test calibration and action quality (golden cases from §6, backtesting against `status`/`messages` outcomes), guardrails against hallucination, and failure/empty-state behavior.
> Keep it consistent with the stack in §1 (Next.js 16 RSC + AI SDK `generateObject` + zod + Supabase RLS). Output runnable TypeScript/SQL where possible.
