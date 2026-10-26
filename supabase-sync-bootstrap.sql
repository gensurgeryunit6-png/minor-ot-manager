-- Minor OT Manager Supabase schema (security-first bootstrap)
-- Run once in Supabase Dashboard > SQL Editor.
-- RLS is enabled and no public/anon access policy is created.
-- Do NOT grant anon read/write access to patient records.
create table if not exists public.minor_ot_patients (
  patient_date date not null,
  token text not null,
  patient_data jsonb not null,
  updated_at timestamptz not null default now(),
  device_id text,
  primary key (patient_date, token)
);
alter table public.minor_ot_patients enable row level security;
revoke all on public.minor_ot_patients from anon, authenticated;
do $$
begin
  alter publication supabase_realtime add table public.minor_ot_patients;
exception when duplicate_object then null;
end $$;

-- Before enabling app sync, configure Supabase Auth and RLS policies
-- that restrict records to authorized staff in your department.
-- A publishable key is not a user identity or an authorization mechanism.
