# DESIGN_CHANGELOG

Visual polish pass aligning the app to the **RAYciprocity Corporate Design System**
(`design/` on `main` — forest-green brand anchored on `#1B4332`, Inter type, soft
rounded cards, green-primary / outline-secondary / red-danger buttons, light theme).

**Hard rule honored:** presentation only. No data, copy, logic, routes, handlers,
IDs, or `data-*` selectors were changed. Verified via `git diff` (7 files, all
color / className / token values). Displayed numbers and text are byte-identical
before vs. after (see `screenshots/before` vs `screenshots/after`).

---

## Changes by file

### `apps/web/src/styles/globals.css` (token system — compounds across every screen)
- Added the **forest-green brand scale** as CSS variables `--brand-50 … --brand-900`
  (anchor `--brand-800: #1b4332`), exposed as Tailwind utilities via `@theme inline`
  (`bg-brand-600`, `text-brand-700`, …).
- Light theme: repointed shadcn semantic tokens to the brand —
  `--primary`→`#1b4332`, `--ring`/`--sidebar-ring`→`#2d6a4f`,
  `--accent`/`--sidebar-accent`→`#eaf6ee` (with green `*-foreground`),
  `--sidebar-primary`→`#1b4332`, `--chart-1…5`→green ramp.
- Subtle depth: page `--background`→`#f6f8f7`, `--card`/`--popover`→`#ffffff`,
  `--border`/`--input`→`#e2e8e4`, `--secondary`/`--muted`→soft green-grey.
- `--radius` `0.625rem → 0.75rem` for the softer card corners in the guide.
- `--destructive-foreground` set to near-white (was red-on-red) so danger buttons
  read correctly.
- Dark theme kept on-brand (green `--primary`/`--ring`/sidebar/charts) so the
  optional dark mode isn't left off-palette.

### `apps/web/src/app/(app-pages)/app-sidebar.tsx`
- Brand logo chip recolored from amber→orange (`from-amber-400 to-orange-500`) to
  the forest-green gradient `from-brand-500 to-brand-800` + `shadow-sm`.

### `apps/web/src/components/strategy/oracle-panel.tsx` (Oracle hero)
- **Bug fix (broken styling):** gauges, sparklines, legend dots, grid and tooltip
  cursor used `hsl(var(--token))`, but those tokens are `oklch(...)` — `hsl(oklch())`
  is invalid CSS, so the **gauges were rendering black**. Replaced the 8 wrapped
  references with correct concrete colors: sign = `#40916c` (green), ghost =
  `#dc2626` (red), border = `#e2e8e4`, muted = `#7a857e`. Risk now reads as red,
  positive as green — matching the driver-row semantics already in the component.

### `apps/web/src/app/DynamicLayoutProviders.tsx`
- Top progress bar recolored from off-brand `#0047ab` (blue) to `#2d6a4f` (brand green).

### `apps/web/src/app/(auth-pages)/login/Login.tsx` & `…/sign-up/Signup.tsx`
- Auth card elevated: tinted `bg-background` → white `bg-card`, added `border`,
  `shadow-xl`, `rounded-2xl`, `p-8`. It now reads as a proper centered card instead
  of floating against the page tint. (Login button turns green automatically via
  `--primary`.)

### `apps/web/src/components/ui/sidebar.tsx`
- Outline `SidebarMenuButton` shadow used `hsl(var(--sidebar-border/accent))`
  (invalid against the new hex tokens) → switched to `var(--…)` so the 1px ring
  renders.

---

## What was weak → what changed
- **Monochrome (black) primary everywhere** → forest-green brand on buttons, active
  nav, focus rings, links and charts via the token layer.
- **Off-brand amber logo** → green brand mark.
- **Oracle gauges rendered black** (invalid `hsl(oklch())`) → semantic green/red.
- **Login/signup floated in a void** → elevated, centered branded card.
- **Flat white-on-white surfaces** → subtle page tint + white cards + softer radius.

## Deliberately left (and why)
- **"Nextbase" wordmark** (auth header) and **"Login to NextBase"** title — these are
  text/copy; out of scope for a presentation-only pass. *Recommended follow-up:*
  rename to RAYciprocity (1-line copy change).
- **Floating dark "N" circle** in screenshots — that's the **Next.js dev-mode
  indicator**, not an app element; it disappears in a production build (or via
  `devIndicators` config). Not a CSS issue.
- **Lead status badge colors** (blue/violet/amber/emerald/red) — kept; they encode
  data meaning (lead status), not brand chrome.
- **Landing/marketing page desktop full-page capture** timed out (infinite marquee
  animation blocks Playwright `fullPage`); other breakpoints captured fine.

## Tokens added
`--brand-50 … --brand-900` (canonical forest-green ramp, anchor `#1b4332`) +
matching `--color-brand-*` Tailwind utilities.

## Deliverables
- `screenshots/before/` — pre-polish (desktop + mobile).
- `screenshots/after/` — post-polish, all 4 breakpoints (1440 / 1024 / 768 / 390)
  across landing, login, signup, dashboard, leads, lead detail (Noah + Lukas),
  strategy.

## Verify
- Stack: local Supabase (`db reset` → 5 demo leads + oracle tables) + `pnpm web#dev`
  on `:3000`; captures driven by a login-aware Playwright script
  (`demo-api@solar.test`).
- Iterations: before → tokens → (cache-bust restart) gauges+logo+auth card → final
  responsive sweep. ≥3 passes on the hero views.
