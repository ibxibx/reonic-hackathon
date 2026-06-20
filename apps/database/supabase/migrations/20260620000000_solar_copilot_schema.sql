-- Migration: Solar Copilot schema (profiles, leads, quotes, strategies, messages)
-- Created: 2026-06-20 00:00:00 UTC

begin;

create extension if not exists pgcrypto with schema extensions;

-- Enums
create type public.lead_status as enum (
  'new',
  'contacted',
  'negotiating',
  'closed',
  'ghosted'
);

create type public.message_channel as enum (
  'email',
  'sms',
  'call',
  'voice'
);

create type public.message_status as enum (
  'draft',
  'sent',
  'failed'
);

-- Tablas
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  address text not null,
  roof_type text,
  monthly_bill numeric(12, 2) not null check (monthly_bill >= 0),
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  system_size_kw numeric(10, 2) not null check (system_size_kw > 0),
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  financing_type text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  persona_detected text not null check (
    persona_detected in ('family', 'investor', 'environmentalist', 'skeptic')
  ),
  persona_confidence numeric(5, 2) check (
    persona_confidence is null
    or persona_confidence between 0 and 1
  ),
  signals text[] not null default '{}',
  strategy_summary text not null,
  rationale text not null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  channel_type public.message_channel not null,
  subject text,
  content text not null,
  goal text,
  sequence_order integer not null check (sequence_order > 0),
  audio_path text,
  status public.message_status not null default 'draft',
  sent_at timestamptz,
  error_message text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (strategy_id, channel_type)
);

-- Índices
create index leads_installer_id_idx on public.leads(installer_id);
create index leads_installer_status_idx on public.leads(installer_id, status);
create index quotes_lead_id_idx on public.quotes(lead_id);
create index strategies_lead_id_idx on public.strategies(lead_id);
create index messages_lead_id_idx on public.messages(lead_id);
create index messages_strategy_id_idx on public.messages(strategy_id);

-- Trigger para crear profile automáticamente
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, company_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'company_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.quotes enable row level security;
alter table public.strategies enable row level security;
alter table public.messages enable row level security;

-- Policies: profiles
create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid())
with check (id = auth.uid());

-- Policies: leads
create policy "leads_select_own" on public.leads
for select to authenticated using (installer_id = auth.uid());

create policy "leads_insert_own" on public.leads
for insert to authenticated with check (installer_id = auth.uid());

create policy "leads_update_own" on public.leads
for update to authenticated using (installer_id = auth.uid())
with check (installer_id = auth.uid());

create policy "leads_delete_own" on public.leads
for delete to authenticated using (installer_id = auth.uid());

-- Policies: quotes
create policy "quotes_select_own" on public.quotes
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = quotes.lead_id and leads.installer_id = auth.uid())
);

create policy "quotes_insert_own" on public.quotes
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = quotes.lead_id and leads.installer_id = auth.uid())
);

create policy "quotes_update_own" on public.quotes
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = quotes.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = quotes.lead_id and leads.installer_id = auth.uid())
);

create policy "quotes_delete_own" on public.quotes
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = quotes.lead_id and leads.installer_id = auth.uid())
);

-- Policies: strategies
create policy "strategies_select_own" on public.strategies
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = strategies.lead_id and leads.installer_id = auth.uid())
);

create policy "strategies_insert_own" on public.strategies
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = strategies.lead_id and leads.installer_id = auth.uid())
);

create policy "strategies_update_own" on public.strategies
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = strategies.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = strategies.lead_id and leads.installer_id = auth.uid())
);

create policy "strategies_delete_own" on public.strategies
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = strategies.lead_id and leads.installer_id = auth.uid())
);

-- Policies: messages
create policy "messages_select_own" on public.messages
for select to authenticated using (
  exists (select 1 from public.leads
    where leads.id = messages.lead_id and leads.installer_id = auth.uid())
);

create policy "messages_insert_own" on public.messages
for insert to authenticated with check (
  exists (select 1 from public.leads
    where leads.id = messages.lead_id and leads.installer_id = auth.uid())
);

create policy "messages_update_own" on public.messages
for update to authenticated using (
  exists (select 1 from public.leads
    where leads.id = messages.lead_id and leads.installer_id = auth.uid())
) with check (
  exists (select 1 from public.leads
    where leads.id = messages.lead_id and leads.installer_id = auth.uid())
);

create policy "messages_delete_own" on public.messages
for delete to authenticated using (
  exists (select 1 from public.leads
    where leads.id = messages.lead_id and leads.installer_id = auth.uid())
);

-- Storage bucket privado para voice notes
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do update set public = false;

create policy "voice_notes_select_own" on storage.objects
for select to authenticated using (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "voice_notes_insert_own" on storage.objects
for insert to authenticated with check (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "voice_notes_update_own" on storage.objects
for update to authenticated using (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "voice_notes_delete_own" on storage.objects
for delete to authenticated using (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
