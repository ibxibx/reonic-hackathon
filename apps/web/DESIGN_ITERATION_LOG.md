# Design Iteration Log — SunSync Solar Copilot (apps/web)

Screenshot-driven UI iteration toward production grade. Branch `feat/design-iteration`.
Screenshots in `apps/web/iteration-shots/passNN/` (gitignored). Capture tool: `tools/ui-capture.cjs`.

## Variables (adapted from the mega-prompt to this app)

| Var | Value |
|---|---|
| `DESIGN_FOLDER` | `apps/web` (Next.js 16 + Tailwind v4 + shadcn/Radix UI kit) |
| `APP_URL` | `http://localhost:3000` |
| `BRAND` | dark green `#1B4332` · mid green `#2D6A4F` · accent mint `#52B788` + neutral grey ramp 50→900 |
| `LOCALE` | **English** (user decision — overrides template's de-DE). English number/date formatting. |
| `MAX_PASSES` | 12 |

**Deviations from the template (this app is a solar-installer CRM, not a German MaStR data product):**
- **No map** → rubric category 7 (Map) is **N/A**, excluded from scoring and the gate.
- **Units** are the app's real ones (kW, %, $, lead counts), not GWh/a · Nm³/h · t CO₂.
- **Locale** kept English per user (template asked for German).

## Environment notes
- Dev server: `pnpm web#dev` (Turbopack) on :3000. Deps need `--config.minimumReleaseAge=0`. Env in `apps/web/.env.local`.
- Auth: demo `demo-api@solar.test` / `Password123!` (works; session active).
- **Data caveat (not a UI defect):** local DB is missing `public.predictions` (oracle migration not applied) → the strategy page's Oracle panel errors (`PGRST205`). Flagged, not fixed (backend/guardrail).

## Coverage matrix (routes × states × viewports 390 / 834 / 1440)

Public: `/` landing · `/login` · `/sign-up`
Auth: `/dashboard` (KPI cards + recent leads) · `/leads` (table) · `/leads/new` (form) · `/leads/[id]` (detail) · `/leads/[id]/strategy` (strategy + timeline + oracle) · `/settings`

States to force across passes: default · loading (skeleton) · empty · error · populated · hover · focus-visible · selected · disabled · dark mode.
Data-product specifics covered: populated/empty/loading/error **table**; chart with/without data (recharts); **form** with validation errors + mid-submit; **KPI card row**. (Map: N/A.)

## Rubric (score 1–10 each pass; category 7 Map = N/A)

1. Visual hierarchy & focus · 2. Layout & spacing · 3. Typography · 4. Colour & contrast ·
5. Components & states · 6. Data display · 7. ~~Map~~ (N/A) · 8. Empty/loading/error ·
9. Responsiveness · 10. Accessibility · 11. Motion & microinteractions · 12. Consistency/content/polish

## Scorecard (one column per pass)

| # | Category | P0 | P1 | P2 |
|---|---|---|---|---|
| 1 | Visual hierarchy & focus | 6 | 7 | 7 |
| 2 | Layout & spacing | 7 | 7 | 7 |
| 3 | Typography | 6 | 6 | 6 |
| 4 | Colour & contrast | 3 | 8 | 8 |
| 5 | Components & states | 6 | 7 | 7 |
| 6 | Data display | 5 | 6 | 6 |
| 7 | Map (N/A) | — | — | — |
| 8 | Empty/loading/error | 4 | 4 | 4 |
| 9 | Responsiveness | 4 | 4 | 6 |
| 10 | Accessibility | 5 | 6 | 6 |
| 11 | Motion & microinteractions | 6 | 6 | 6 |
| 12 | Consistency/content/polish | 4 | 6 | 7 |

**Gate status:** NOT met. Categories still <8: typography(6), data display(6), empty/error(4), responsiveness(6), a11y(6), motion(6), consistency(7). Open P1: D3 (lead-detail throws), residual mobile Actions h-scroll.

## Passes

### Pass 0 — baseline (neutral shadcn theme)

True branch state (the green first seen was stale Turbopack cache from the deleted `feat/design-dark-green-mint`; cleared `.next` and re-captured). Shots: `iteration-shots/pass00/`.

Top defects identified:
| ID | Cat | Sev | Defect | Root cause | Fix |
|---|---|---|---|---|---|
| D1 | 4 | P1 | No brand color anywhere — neutral greyscale + lone orange logo + ad-hoc amber/red/green badges | `globals.css` tokens are default neutral oklch | Author green token system (pass 1) |
| D2 | 9 | P1 | Leads table cut off at 390px (Status/Actions clipped, h-scroll) | table doesn't reflow/scroll-contain on mobile | Responsive table treatment |
| D3 | 8 | P1 | `/leads/[id]` white-screens with raw runtime error | oracle/predictions query throws, no graceful UI fallback (data gap: `predictions` table not migrated locally) | Make oracle/data fetch degrade to empty/error state |
| D4 | 12 | P1 | Wrong brand in copy: "Login to NextBase", landing is "Acme"/NextBase boilerplate | starter placeholders never replaced | Rebrand auth + landing copy |
| D5 | 10 | P1 | Focus ring is neutral grey, not brand; not clearly visible on green later | `--ring` neutral | Brand `--ring` in token system |
| D6 | 3/6 | P2 | Metrics/table figures use proportional (non-tabular) numerals | no `tabular-nums` | Wire tabular numerals on metrics/tables |

### Pass 1 — brand token system (D1, D5)

Authored the SunSync/RayCiprocity green token system in `globals.css` (single source of truth). Because every component reads tokens, this greened the **entire** app — including main's newer screens (strategy confidence bar, outreach timeline) — with **zero per-component edits**.

Changed (`globals.css`):
- `:root` + `.dark` rebuilt in OKLCH, anchored on `#1B4332 / #2D6A4F / #52B788`; neutrals faintly green-tinted.
- `--primary` mid-green, `--sidebar` dark-green, `--accent` pale mint, `--ring` brand-green (focus rings were grey → D5).
- Added semantic tokens `--success / --warning / --info` (+ foregrounds) and mapped them in `@theme inline` for `bg-*`/`text-*` utilities. Kept distinct from brand green (cat 4).
- Colour-blind-safe `--chart-1..5` (green/teal/amber/blue/violet).
- **Bug fix:** `--destructive-foreground` was the same red as `--destructive` (red-on-red text) → set to light (cat 4/10).

Verified: `pass01/` — dashboard, strategy (confidence bar now green), login all render branded. Cat 4: 3→8.

### Pass 2 — branding copy + mobile table (D4, D2)

- **D4 rebrand:** `PRODUCT_NAME` → "RayCiprocity"; app metadata title → "RayCiprocity — Solar AI Copilot"; auth wordmark + "Login/Register to NextBase" → "…RayCiprocity" (login/sign-up ×3 each). Verified `pass02/login@1440`, `signup@1440`.
- **D2 mobile table:** `leads-table` "Monthly bill" column moved to `sm:` so 390px shows Homeowner/Status without clipping. Verified `pass02/leads@390` (Status no longer cut). Residual: Actions column still scrolls past card edge at 390 — punch-list.

### Remaining punch list (gate not yet met)
- **D3 (P1):** `/leads/[id]` throws on missing `predictions` table — make oracle/data fetch degrade to an empty/error state (cat 8). NB: locally this is a migration gap (`supabase db reset` needed; DB writes were permission-blocked).
- **Cat 9:** stack leads rows into cards (or move Actions inline) at 390 to fully kill h-scroll.
- **Cat 3/6:** apply tabular numerals to KPI card values (table already done); verify type scale rhythm.
- **Cat 12:** marketing pages still starter boilerplate — landing "Build your SaaS product faster", Footer "Acme", Navbar/Banner "Nextbase". Out of core dashboard scope but tracked.
- **Cat 11/8:** dedicated dark-mode capture pass; force loading/empty/error states for table & strategy; verify hover/focus-visible across components.
