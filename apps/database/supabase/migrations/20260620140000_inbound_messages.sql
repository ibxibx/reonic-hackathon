-- Migration: inbound_messages (demo — customer reply triage)
-- A customer reply lands here, gets AI-categorized, and the dashboard reacts.
-- One row per inbound reply (history kept). RLS copies the strategies pattern.

create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null,
  category text not null check (
    category in ('interested', 'objection', 'ghost_risk', 'ready_to_close')
  ),
  confidence numeric(5, 2) check (
    confidence is null or confidence between 0 and 1
  ),
  reasoning text,
  suggested_next_step text,
  created_at timestamptz not null default now()
);

create index inbound_messages_lead_id_idx on public.inbound_messages(lead_id);

alter table public.inbound_messages enable row level security;

create policy "inbound_messages_select_own" on public.inbound_messages
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = inbound_messages.lead_id and leads.installer_id = auth.uid())
);

create policy "inbound_messages_insert_own" on public.inbound_messages
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = inbound_messages.lead_id and leads.installer_id = auth.uid())
);

create policy "inbound_messages_update_own" on public.inbound_messages
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = inbound_messages.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = inbound_messages.lead_id and leads.installer_id = auth.uid())
);

create policy "inbound_messages_delete_own" on public.inbound_messages
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = inbound_messages.lead_id and leads.installer_id = auth.uid())
);
