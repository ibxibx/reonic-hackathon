-- Migration: lead_orchestration (Phase 2.5 Orchestrator)
-- Per-lead strategy-execution state. DB is the source of truth for "which step
-- of the multi-channel sequence is this lead currently on". AI defines what each
-- step IS (the strategy); this table only tracks execution position + status.
-- One row per active lead. RLS copies the strategies policy pattern verbatim.

create table public.lead_orchestration (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  current_step integer not null default 0 check (current_step >= 0),
  total_steps integer not null default 0 check (total_steps >= 0),
  status text not null default 'not_started' check (
    status in ('not_started', 'in_progress', 'awaiting_reply', 'completed', 'paused')
  ),
  next_action_at timestamptz,
  updated_at timestamptz not null default now(),
  -- one orchestration row per lead
  unique (lead_id)
);

create index lead_orchestration_lead_id_idx on public.lead_orchestration(lead_id);

alter table public.lead_orchestration enable row level security;

-- Policies: lead_orchestration (verbatim copy of the strategies pattern)
create policy "lead_orchestration_select_own" on public.lead_orchestration
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = lead_orchestration.lead_id and leads.installer_id = auth.uid())
);

create policy "lead_orchestration_insert_own" on public.lead_orchestration
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = lead_orchestration.lead_id and leads.installer_id = auth.uid())
);

create policy "lead_orchestration_update_own" on public.lead_orchestration
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = lead_orchestration.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = lead_orchestration.lead_id and leads.installer_id = auth.uid())
);

create policy "lead_orchestration_delete_own" on public.lead_orchestration
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = lead_orchestration.lead_id and leads.installer_id = auth.uid())
);
