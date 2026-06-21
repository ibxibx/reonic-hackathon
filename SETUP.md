<p align="center">
  <img src="./design/logo_RayCi.png" alt="RayCiprocity logo" width="280">
</p>

# 🛠️ RayCiprocity — Local Setup Guide

Everything you need to run **RayCiprocity** (the AI Sales Copilot for renewable
installers) on your machine, from zero to a logged-in dashboard with seeded demo data.

This is a **pnpm + Turborepo monorepo**:

| Path | What it is |
|---|---|
| [`apps/web`](./apps/web) | Next.js 16 app (App Router, RSC, Turbopack, React 19) — the dashboard |
| [`apps/database`](./apps/database) | Local **Supabase** stack (Postgres + Auth + Storage) — migrations & seed |
| [`packages/`](./packages) | Shared config (TS config) |

> **Product/architecture context** lives in [`README.md`](./README.md); the full spec
> is in [`prd/PRD.md`](./prd/PRD.md); the Oracle predictor is documented in
> [`apps/web/src/lib/oracle/README.md`](./apps/web/src/lib/oracle/README.md) and
> [`ORACLE_EVAL.md`](./ORACLE_EVAL.md). This file is **just how to run it**.

---

## 🔑 Demo login

After setup + seed (below), sign in at <http://localhost:3000/login> with:

```
email:    demo-api@solar.test
password: Password123!
```

This is the seeded demo installer (company **"RayCiprocity Demo Co"**) with 5 demo
leads. ⚠️ The seed creates this user but leaves its auth record incomplete, so **login
fails until you run the one-time repair** in [Step 5](#5-seed--repair-the-demo-login).

---

## 0. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | **24.x** (`>=24`) | pinned in [`.nvmrc`](./.nvmrc) + `engines`. Use `nvm install 24 && nvm use 24`. |
| **pnpm** | **11.1.2** | don't `npm i -g` it — use Corepack: `corepack enable && corepack prepare pnpm@11.1.2 --activate`. |
| **Docker Desktop** | running | the local Supabase stack runs in Docker. Start it before Step 3. |
| **Git** | any | — |

> **Windows note:** all commands work in **Git Bash** or **PowerShell**. A couple of
> steps below give the PowerShell variant where it differs.

---

## 🚀 Quick start

There's a helper script, [`setup.sh`](./setup.sh), that does the boilerplate (copies env
templates, installs deps, starts Supabase). Run it, then do the **two manual steps it
doesn't cover** (the `apps/web/.env.local` file and the DB reset + login repair):

```bash
corepack enable && corepack prepare pnpm@11.1.2 --activate
./setup.sh                       # copies root env files, pnpm i, starts Supabase
# --- the two steps setup.sh does NOT do (see gotchas) ---
cp .env.development.local apps/web/.env.local          # Next reads env from apps/web, not root
corepack pnpm --filter database exec supabase db reset # apply migrations + seed the 5 leads
# repair the demo login (see Step 5), then:
corepack pnpm web#dev            # http://localhost:3000
```

Prefer to understand each step? Follow the **manual walkthrough** below.

---

## 📦 Manual walkthrough

### 1. Install dependencies

```bash
corepack enable && corepack prepare pnpm@11.1.2 --activate
pnpm i
```

> **⚠️ Gotcha — `ERR_PNPM_NO_MATURE_MATCHING_VERSION`.**
> [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) sets `minimumReleaseAge: 4320` (3 days),
> which blocks just-published packages. `ai`, `resend`, `twilio`, and
> `@ai-sdk/anthropic` are already excluded, but if a *different* fresh dependency trips
> the install, run it once with the override (it does **not** change the committed
> config):
> ```bash
> pnpm i --config.minimumReleaseAge=0
> ```

### 2. Environment variables

Only **two** variables are required to boot and render the app — the local Supabase
URL + publishable key. Everything else is optional and the app **degrades gracefully**
when a key is missing.

> **⚠️ Gotcha (the important one) — env file location.**
> `setup.sh` and the `.example` files put env at the **repo root**, but `next dev` runs
> inside `apps/web` and only loads `.env*` from **there**. A root-only `.env.local`
> means the app 500s with *"Your project's URL and Key are required…"*.
> **➡️ Create [`apps/web/.env.local`](./apps/web).**

Create `apps/web/.env.local` with at least:

```bash
# ── Required (local Supabase defaults — deterministic, safe to paste) ──
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321/
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_PROJECT_REF=nextbase-oss-starter

# ── Optional: AI (OpenAI). Without it, strategy/diagnosis error and the Oracle
#    falls back to a deterministic narration (numbers still come from the model). ──
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# ── Optional: voice notes (ElevenLabs) ──
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# ── Optional: real email/SMS. Leave MOCK_* = true to simulate (recommended for demo) ──
RESEND_API_KEY=
RESEND_FROM_EMAIL=RayCiprocity <sales@your-domain.com>
MOCK_EMAIL=true
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
MOCK_SMS=true

# ── Server-only admin key (never exposed to the client) ──
SUPABASE_SERVICE_ROLE_KEY=
```

Reference template: [`.env.development.local.example`](./.env.development.local.example)
(it already contains the local publishable key). `SUPABASE_SERVICE_ROLE_KEY` is only
needed for admin-only server operations — copy the **service_role / secret key** printed
by `supabase status` (or `pnpm database#status`); never commit it.

#### What each integration unlocks ([`lib/integration-status.ts`](./apps/web/src/lib/integration-status.ts))

| Variable(s) | Powers | If missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **everything** (boot, auth, data) | app won't render — **required** |
| `OPENAI_API_KEY` (+ `OPENAI_MODEL`) | strategy gen, diagnosis, archetype, Oracle narration | AI actions error; Oracle still shows model numbers with a deterministic write-up |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | voice-note TTS | voice step shows a clear message |
| `RESEND_API_KEY` (or `MOCK_EMAIL=true`) | sending email | **simulated** (a "Simulated send mode" banner appears) |
| `TWILIO_*` (or `MOCK_SMS=true`) | sending SMS | **simulated** |

> The provider used for AI is **OpenAI** (`gpt-4o`) via the Vercel AI SDK
> ([`lib/ai/provider.ts`](./apps/web/src/lib/ai/provider.ts)). You do **not** need any AI
> key just to log in and explore the seeded data and the Oracle gauges.

### 3. Start the local Supabase stack

Make sure **Docker Desktop is running**, then:

```bash
pnpm database#start          # = supabase start, inside apps/database
```

First run pulls Docker images (~3–4 min). When it's up you get these local services
(ports from [`apps/database/supabase/config.toml`](./apps/database/supabase/config.toml)):

| Service | URL |
|---|---|
| API (PostgREST/Auth/Storage gateway) | <http://localhost:54321> |
| Postgres | `postgresql://postgres:postgres@localhost:54322/postgres` |
| **Studio** (DB GUI) | <http://localhost:54323> |
| Inbucket (captured emails) | <http://localhost:54324> |

Stop it later with `pnpm database#stop`; check state with `pnpm database#status`.

### 4. Apply migrations & seed the database

`supabase start` seeds on a fresh DB, but the reliable way to get a clean, fully-migrated
state (all tables incl. `predictions` / `model_calibration` / `lead_orchestration`, plus
the 5 demo leads from [`apps/database/supabase/seed.sql`](./apps/database/supabase/seed.sql))
is a reset:

```bash
corepack pnpm --filter database exec supabase db reset
```

This drops the local DB, re-runs every migration in
[`apps/database/supabase/migrations`](./apps/database/supabase/migrations), and runs the
seed. It is **local-only and destructive** — never point it at a remote project.

### 5. Seed → repair the demo login

> **⚠️ Gotcha — the seeded login is broken as committed.** `seed.sql`'s raw
> `INSERT INTO auth.users` leaves `instance_id` and the token columns `NULL`, so GoTrue
> rejects the password with `invalid_credentials` even though the bcrypt hash is valid.
> **After every `db reset`, run this one-time repair:**

```bash
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c \
"UPDATE auth.users SET instance_id='00000000-0000-0000-0000-000000000000', confirmation_token='', recovery_token='', email_change='', email_change_token_new='', email_change_token_current='', reauthentication_token='', phone_change='', phone_change_token='' WHERE email='demo-api@solar.test';"
```

(The container name `supabase_db_nextbase-oss-starter` comes from `project_id` in
`config.toml`; confirm with `docker ps` if it differs.)

### 6. (Optional) Regenerate DB types

If you change the schema, regenerate the typed client:

```bash
pnpm gen-types-local         # writes apps/database/lib/database.types.ts from the local DB
```

### 7. Run the app

```bash
corepack pnpm web#dev        # Next.js 16 + Turbopack on http://localhost:3000
```

Confirm the startup log shows `- Environments: .env.local` (proof it found
`apps/web/.env.local`). Then open <http://localhost:3000/login> and sign in with the
[demo credentials](#-demo-login).

> `pnpm dev` (no `web#`) runs **all** workspace apps in parallel; `pnpm web#dev` runs just
> the web app.

---

## 🎬 First look (what to click)

You're signed in as **RayCiprocity Demo Co** with 5 leads, each in a different state:

| Lead | Status | Good for showing |
|---|---|---|
| **Lukas Becker** | negotiating | a healthy lead — high sign probability |
| **Noah Patel** | ghosted | the **Oracle** at work — high ghost risk + recommended action |
| Ava Thompson | contacted | early-stage |
| Thomas Schneider | ghosted | another at-risk lead |
| Elena Brooks | closed | a won deal |

1. **Dashboard** → pipeline stats + recent leads.
2. **Leads → Noah Patel** → in the **Oracle** panel click **Run Oracle**: it scores
   sign-vs-ghost, names the predicted blocker, and gives the one next action.
3. **Strategy** (on a lead with a strategy, e.g. Lukas) → the multi-channel outreach
   timeline. Email/SMS are **simulated** by default (the amber "Simulated send mode"
   banner explains why).

Full demo script: [`README.md` → Demo Flow Checklist](./README.md#-demo-flow-checklist-this-is-the-script).

---

## ✅ Quality gates

Run from the repo root (Turborepo fans out to the right package):

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # oxlint
pnpm test           # vitest (unit tests, incl. the Oracle model/calibration suite)
pnpm build          # production build (next build)
pnpm test:e2e       # Playwright end-to-end (needs the dev server / app)
```

The Oracle library is heavily unit-tested — see
[`apps/web/src/lib/oracle/README.md`](./apps/web/src/lib/oracle/README.md) §6 for the
focused commands.

---

## 🧯 Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| App 500s: *"project's URL and Key are required"* | Env at repo root only. **Create `apps/web/.env.local`** (Step 2). |
| Login fails: `invalid_credentials` | Seed auth record incomplete. **Run the repair** (Step 5). |
| `pnpm i` fails: `ERR_PNPM_NO_MATURE_MATCHING_VERSION` | `minimumReleaseAge`. Re-run `pnpm i --config.minimumReleaseAge=0` (Step 1). |
| `supabase start` errors on ports / "container already exists" | Stale stack. `pnpm database#stop` (or `supabase stop --no-backup` in `apps/database`), then start again. |
| `supabase` command not found | Run via the workspace: `corepack pnpm --filter database exec supabase <cmd>`. |
| Leads/predictions look empty or stale | Re-run **Step 4** (`db reset`) then **Step 5** (repair), then refresh. |
| AI buttons error ("Generate strategy", etc.) | No `OPENAI_API_KEY`. Add one, or just rely on seeded strategies + the Oracle's deterministic fallback. |
| Docker not running | Start **Docker Desktop**, then `pnpm database#start`. |

---

## 🗺️ Where things live

```
README.md                          ← product overview, architecture, ROI
SETUP.md                           ← you are here (how to run it)
prd/PRD.md                         ← full spec: features, 40-code taxonomy, schema, demo script
ACTION_PLAN.md                     ← build plan + shipped-status checklist
AGENTS.md                          ← automation/agent setup notes + setup.sh description
ORACLE_EVAL.md                     ← Oracle model evaluation & honesty disclosure
design/                            ← RAYciprocity corporate design system (brand, logo)
apps/web/                          ← Next.js app
  src/app/                         ← routes (dashboard, leads, settings, auth)
  src/lib/oracle/                  ← the sign/ghost predictor (+ its own README)
  src/lib/ai/                      ← LLM provider, prompts, schemas, taxonomy
  src/data/user/                   ← server actions (leads, strategy, oracle, inbound)
  src/supabase-clients/            ← browser/server/middleware Supabase clients
apps/database/supabase/            ← config.toml, migrations/, seed.sql
packages/                          ← shared TS config
```

---

*Questions about the product itself? Start with [`README.md`](./README.md). Happy
building. ☀️*
