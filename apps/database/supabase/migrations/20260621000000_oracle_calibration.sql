-- Migration: Oracle calibrated engine — additive + idempotent.
-- Enriches `predictions` with calibrated/model-backed columns and adds the
-- `model_calibration` table (installer-scoped, RLS) for persisted recalibration
-- params + corpus metadata. Single-owner (Orchestrator). Never drops or rewrites
-- existing columns; new columns are nullable or defaulted so the migration is
-- safe to re-run and safe on populated tables.

begin;

-- ── predictions: richer snapshot columns (all additive) ─────────────────────
alter table public.predictions
  add column if not exists sign_confidence numeric(5, 2),
  add column if not exists ghost_confidence numeric(5, 2),
  add column if not exists factors jsonb,
  add column if not exists blocker_code text,
  add column if not exists model_version text,
  add column if not exists calibrated boolean not null default false,
  add column if not exists mode text;

-- ── model_calibration: persisted recalibration params per installer ─────────
create table if not exists public.model_calibration (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references public.profiles(id) on delete cascade,
  target text not null check (target in ('sign', 'ghost')),
  method text not null check (method in ('platt', 'isotonic', 'none')),
  params jsonb not null default '{}'::jsonb,
  model_version text not null,
  n_labels integer not null default 0 check (n_labels >= 0),
  trained_on text not null default 'synthetic'
    check (trained_on in ('synthetic', 'real', 'mixed')),
  metrics jsonb,
  created_at timestamptz not null default now()
);

create index if not exists model_calibration_installer_idx
  on public.model_calibration(installer_id);

create index if not exists model_calibration_installer_target_idx
  on public.model_calibration(installer_id, target, created_at desc);

alter table public.model_calibration enable row level security;

-- Idempotent policy creation (CREATE POLICY has no IF NOT EXISTS pre-PG15-safe).
do $$ begin
  create policy "model_calibration_select_own" on public.model_calibration
  for select to authenticated using (installer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "model_calibration_insert_own" on public.model_calibration
  for insert to authenticated with check (installer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "model_calibration_update_own" on public.model_calibration
  for update to authenticated using (installer_id = auth.uid())
  with check (installer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "model_calibration_delete_own" on public.model_calibration
  for delete to authenticated using (installer_id = auth.uid());
exception when duplicate_object then null; end $$;

commit;
