-- Oracle prediction snapshots for each lead.
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sign_prob numeric(5, 2) not null check (sign_prob between 0 and 100),
  ghost_risk numeric(5, 2) not null check (ghost_risk between 0 and 100),
  predicted_code text,
  recommended_action text not null,
  evidence text not null,
  created_at timestamptz not null default now()
);

create index predictions_lead_id_idx on public.predictions(lead_id);

alter table public.predictions enable row level security;

create policy "predictions_select_own" on public.predictions
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = predictions.lead_id and leads.installer_id = auth.uid())
);

create policy "predictions_insert_own" on public.predictions
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = predictions.lead_id and leads.installer_id = auth.uid())
);

create policy "predictions_update_own" on public.predictions
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = predictions.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = predictions.lead_id and leads.installer_id = auth.uid())
);

create policy "predictions_delete_own" on public.predictions
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = predictions.lead_id and leads.installer_id = auth.uid())
);
