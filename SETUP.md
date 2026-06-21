<p align="center">
  <img src="./design/logo_RayCi.png" alt="RayCiprocity" width="260">
</p>

<h1 align="center">RayCiprocity — Setup Guide</h1>

<p align="center"><em>AI Sales Copilot for renewable installers. Clone → run → log in, in about 10 minutes.</em></p>

---

This is a **pnpm + Turborepo monorepo** with two workspaces:

| Workspace | Stack | Role |
|---|---|---|
| `apps/web` | Next.js 16 (App Router, React 19, Turbopack) | the dashboard application |
| `apps/database` | Supabase (Postgres + Auth + Storage), run locally via Docker | schema, migrations, seed data |

Everything runs **locally** — there is no hosted instance to point at. The only external
services (OpenAI, ElevenLabs, Resend, Twilio) are **optional**; the app runs fully without
them and clearly simulates anything that needs a key.

## Demo login

Once the app is running and the database is seeded, sign in at <http://localhost:3000/login>:

```
Email:    demo-api@solar.test
Password: Password123!
```

This is a pre-seeded installer account (“RayCiprocity Demo Co”) with five demo leads. It
works out of the box — no manual account creation or fix-up required.

---

## 1. Prerequisites

Install these before you start:

| Requirement | Version | How to get it |
|---|---|---|
| **Node.js** | **24.x** | [nvm](https://github.com/nvm-sh/nvm): `nvm install 24 && nvm use 24` (the repo pins `24` in `.nvmrc`). |
| **pnpm** | **11.1.2** | Don't install globally — enable via Corepack (bundled with Node): `corepack enable && corepack prepare pnpm@11.1.2 --activate`. |
| **Docker** | running | [Docker Desktop](https://www.docker.com/products/docker-desktop/). The local Supabase stack runs in containers — **start Docker before step 3**. |
| **Git** | any | to clone the repo. |

> **Operating system:** the commands below are Bash. They work as-is on **macOS/Linux**
> and on **Windows via Git Bash** (installed with Git for Windows). The one Windows-only
> note is called out where relevant.

---

## 2. Quick start

From a terminal:

```bash
# 1. Clone
git clone https://github.com/ibxibx/reonic-hackathon.git
cd reonic-hackathon

# 2. Activate the pinned pnpm (one-time)
corepack enable && corepack prepare pnpm@11.1.2 --activate

# 3. One-shot setup: copies env files, installs deps, starts + seeds Supabase
#    (make sure Docker is running first — the first run pulls images, ~3–4 min)
./setup.sh

# 4. Start the app
corepack pnpm web#dev
```

Open <http://localhost:3000>, click **Login**, and sign in with the
[demo credentials](#demo-login) above.

That's it. The rest of this document explains each piece, the configuration options, and
how to troubleshoot — but the four commands above are the whole happy path.

> **What `setup.sh` does:** stops any stale Supabase containers, copies every
> `*.example` env file to its real counterpart (including `apps/web/.env.local`, which is
> the one the app reads), runs `pnpm i`, starts the local Supabase stack (which applies
> migrations and seeds the demo data), and generates local DB types.

---

## 3. Manual setup (step by step)

Use this if you'd rather run each step yourself, or if `setup.sh` is interrupted.

### 3.1 Install dependencies

```bash
corepack pnpm i
```

> **If install fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`:** the workspace enforces
> a “minimum release age” on dependencies (`pnpm-workspace.yaml`). Re-run once with the
> override — it does not change the committed config:
> ```bash
> corepack pnpm i --config.minimumReleaseAge=0
> ```

### 3.2 Configure environment

The app reads its environment from **`apps/web/.env.local`** (Next.js loads `.env*` from
the app directory, not the repo root). Create it from the template:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

The template already contains the **deterministic local Supabase URL and publishable key**,
so the app boots with no edits. Only two variables are strictly required; everything else
is optional (see [Configuration reference](#5-configuration-reference)).

> **Windows / PowerShell** (if not using Git Bash):
> `Copy-Item apps/web/.env.local.example apps/web/.env.local`

### 3.3 Start the local Supabase stack

Make sure **Docker is running**, then:

```bash
corepack pnpm database#start
```

The first run pulls Docker images (~3–4 min). Once up, the local services are:

| Service | URL |
|---|---|
| API gateway (Auth / REST / Storage) | <http://localhost:54321> |
| Postgres | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Studio (database GUI) | <http://localhost:54323> |
| Inbucket (captured emails) | <http://localhost:54324> |

### 3.4 Apply migrations & seed the demo data

`database#start` seeds automatically on a **fresh** database. If you've run it before (or
want a guaranteed-clean state with all tables and the five demo leads), reset:

```bash
corepack pnpm --filter database exec supabase db reset
```

This re-applies every migration in `apps/database/supabase/migrations` and runs
`apps/database/supabase/seed.sql`. It is **local-only and destructive** — never run it
against a remote project.

### 3.5 Run the app

```bash
corepack pnpm web#dev
```

Next.js (Turbopack) serves on <http://localhost:3000>. The startup log should include
`- Environments: .env.local`, confirming it found `apps/web/.env.local`. Sign in with the
[demo credentials](#demo-login).

> `corepack pnpm dev` runs every workspace in parallel; `corepack pnpm web#dev` runs only
> the web app.

---

## 4. First look — what to evaluate

You're signed in as **RayCiprocity Demo Co** with five leads, each in a different state:

| Lead | Status | Good for showing |
|---|---|---|
| **Lukas Becker** | negotiating | a healthy lead with a full, pre-generated strategy |
| **Noah Patel** | ghosted | the predictive **Oracle** — high ghost risk + next-best action |
| Ava Thompson | contacted | early-stage lead |
| Thomas Schneider | ghosted | another at-risk lead |
| Elena Brooks | closed | a won deal |

A suggested two-minute tour:

1. **Dashboard** — pipeline summary and recent leads.
2. **Leads → Lukas Becker → Strategy** — the detected persona, the diagnostic
   *problem-code* stack, and the multi-channel outreach timeline (Email → SMS → Call →
   Voice), each step with its rationale.
3. **Leads → Noah Patel → Run Oracle** — sign vs. ghost probability, the predicted
   blocker, and the single recommended action.

**No API keys needed for the above** — strategies are pre-seeded, the Oracle runs on a
local statistical model, and email/SMS are simulated (shown by an in-app banner). To
exercise the *live* AI features — generating a new strategy, the inbound-reply rewrite,
and ElevenLabs voice notes — add the optional keys in the next section.

---

## 5. Configuration reference

All variables live in `apps/web/.env.local`. Required to boot are in **bold**.

| Variable | Required | Enables / notes |
|---|---|---|
| **`NEXT_PUBLIC_SUPABASE_URL`** | ✅ | Local Supabase API. Default `http://localhost:54321/`. |
| **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** | ✅ | Public (anon) key — the local default is in the template. |
| `SUPABASE_PROJECT_REF` | — | Used by `gen-types-local`. Default `nextbase-oss-starter`. |
| `OPENAI_API_KEY` (+ `OPENAI_MODEL`) | optional | Strategy generation, diagnosis, inbound triage, and the Oracle's written narration. Without it, “Generate Strategy” returns an error and the Oracle falls back to a deterministic summary (the numbers still come from the model). |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | optional | Voice-note text-to-speech. |
| `RESEND_API_KEY` / `MOCK_EMAIL` | optional | Real email via Resend. With no key (or `MOCK_EMAIL=true`), email is **simulated**. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` / `MOCK_SMS` | optional | Real SMS via Twilio. With no credentials (or `MOCK_SMS=true`), SMS is **simulated**. |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Admin-only server operations. Copy from `corepack pnpm database#status` if needed. Never commit it. |

The AI provider is **OpenAI** (`gpt-4o`) via the Vercel AI SDK. The app degrades
gracefully whenever a key is absent, so a missing integration never hard-fails the demo.

---

## 6. Common commands

```bash
# Database (local Supabase)
corepack pnpm database#start       # start the stack
corepack pnpm database#stop        # stop it
corepack pnpm database#status      # show URLs + keys
corepack pnpm --filter database exec supabase db reset   # re-apply migrations + reseed
corepack pnpm gen-types-local      # regenerate DB types from the local schema

# App
corepack pnpm web#dev              # dev server (http://localhost:3000)

# Quality gates
corepack pnpm typecheck            # tsc --noEmit
corepack pnpm lint                 # oxlint
corepack pnpm test                 # vitest unit tests
corepack pnpm build                # production build
corepack pnpm test:e2e             # Playwright end-to-end (needs the app running)
```

---

## 7. Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| App returns 500: *“project's URL and Key are required”* | `apps/web/.env.local` is missing. Create it: `cp apps/web/.env.local.example apps/web/.env.local`. |
| `pnpm i` fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` | Dependency “minimum release age”. Re-run `corepack pnpm i --config.minimumReleaseAge=0`. |
| `supabase start` fails on ports / “container already exists” | A stale stack is running. `corepack pnpm database#stop`, then start again. |
| `supabase: command not found` | Run it through the workspace: `corepack pnpm --filter database exec supabase <cmd>`. |
| Leads or predictions look empty/stale | Re-seed: `corepack pnpm --filter database exec supabase db reset`, then refresh. |
| “Generate Strategy” errors | No `OPENAI_API_KEY`. Add one, or use the pre-seeded strategies. |
| Docker errors on startup | Start **Docker Desktop**, then `corepack pnpm database#start`. |
| Login fails with `invalid_credentials` | Should not happen on a current clone. If it does, re-seed with `db reset` (the seed sets the required auth fields). |

---

## 8. Project structure

```
reonic-hackathon/
├─ SETUP.md                      ← this file
├─ README.md                     ← product overview, architecture, business case
├─ setup.sh                      ← one-shot local setup script
├─ apps/
│  ├─ web/                       ← Next.js application
│  │  ├─ .env.local.example      ← copy to .env.local (the file Next reads)
│  │  └─ src/
│  │     ├─ app/                 ← routes: dashboard, leads, settings, auth
│  │     ├─ data/user/           ← server actions (leads, strategy, oracle, inbound)
│  │     ├─ lib/oracle/          ← the sign/ghost predictor
│  │     ├─ lib/ai/              ← LLM provider, prompts, schemas
│  │     └─ supabase-clients/    ← browser / server / middleware clients
│  └─ database/
│     └─ supabase/               ← config.toml, migrations/, seed.sql
└─ packages/                     ← shared TypeScript config
```

For the product story, architecture diagram, and the full feature spec, see
[`README.md`](./README.md) and [`prd/PRD.md`](./prd/PRD.md).
