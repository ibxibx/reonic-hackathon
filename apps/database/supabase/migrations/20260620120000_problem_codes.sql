-- Demo-focused problem-code diagnosis snapshots for each lead.
create table public.problem_codes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  code text not null,
  family text not null,
  confidence numeric(5, 2) not null check (confidence between 0 and 1),
  evidence text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index problem_codes_lead_id_idx on public.problem_codes(lead_id);

alter table public.problem_codes enable row level security;

create policy "problem_codes_select_own" on public.problem_codes
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = problem_codes.lead_id and leads.installer_id = auth.uid())
);

create policy "problem_codes_insert_own" on public.problem_codes
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = problem_codes.lead_id and leads.installer_id = auth.uid())
);

create policy "problem_codes_update_own" on public.problem_codes
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = problem_codes.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = problem_codes.lead_id and leads.installer_id = auth.uid())
);

create policy "problem_codes_delete_own" on public.problem_codes
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = problem_codes.lead_id and leads.installer_id = auth.uid())
);
