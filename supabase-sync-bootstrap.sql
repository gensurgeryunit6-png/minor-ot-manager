-- Minor OT Manager Supabase sync bootstrap
-- Run once in Supabase Dashboard > SQL Editor for project pnncnljakqrqzocahxhs.
create table if not exists public.minor_ot_patients (
  patient_date date not null,
  token text not null,
  patient_data jsonb not null,
  updated_at timestamptz not null default now(),
  device_id text,
  primary key (patient_date, token)
);
alter table public.minor_ot_patients enable row level security;
grant select, insert, update, delete on public.minor_ot_patients to anon;
drop policy if exists minor_ot_public_all on public.minor_ot_patients;
create policy minor_ot_public_all on public.minor_ot_patients
for all to anon using (true) with check (true);
do $$
begin
  alter publication supabase_realtime add table public.minor_ot_patients;
exception when duplicate_object then null;
end $$;
