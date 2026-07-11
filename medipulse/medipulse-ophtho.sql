-- medipulse-ophtho.sql — Ophthalmology module
-- Adds: eye_exams (one row per encounter: visual acuity, IOP, refraction),
--        eye_conditions (append-only per-eye findings, analog of tooth_conditions),
--        and seeds the "Ophthalmology" specialty.
-- Run in the Supabase SQL Editor after medipulse-admin-setup.sql.
-- NOTE: before running, verify the RLS policy shape matches your
-- tooth_conditions policies (select * from pg_policies where tablename = 'tooth_conditions')
-- and adjust if your project's policies differ.

-- ------------------------------------------------------------------
-- eye_exams — one row per encounter (upserted from the Eye Exam tab)
-- ------------------------------------------------------------------
create table public.eye_exams (
  id                uuid primary key default gen_random_uuid(),
  encounter_id      uuid not null references public.encounters(id) on delete cascade,
  patient_record_id uuid not null references public.patients(id) on delete cascade,
  -- visual acuity (Snellen strings: '20/20'…'20/400', 'CF', 'HM', 'LP', 'NLP')
  va_uncorr_od  text,  va_uncorr_os  text,
  va_pinhole_od text,  va_pinhole_os text,
  va_corr_od    text,  va_corr_os    text,
  -- intraocular pressure, mmHg
  iop_od numeric(4,1) check (iop_od is null or (iop_od >= 0 and iop_od <= 80)),
  iop_os numeric(4,1) check (iop_os is null or (iop_os >= 0 and iop_os <= 80)),
  -- refraction / glasses prescription
  sphere_od numeric(5,2), cyl_od numeric(5,2),
  axis_od   int check (axis_od is null or (axis_od between 0 and 180)),
  add_od    numeric(4,2),
  sphere_os numeric(5,2), cyl_os numeric(5,2),
  axis_os   int check (axis_os is null or (axis_os between 0 and 180)),
  add_os    numeric(4,2),
  pd numeric(4,1),
  notes text,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (encounter_id)
);
create index eye_exams_patient_idx on public.eye_exams (patient_record_id, recorded_at);

-- ------------------------------------------------------------------
-- eye_conditions — append-only per-eye findings; latest row per eye wins
-- ------------------------------------------------------------------
create table public.eye_conditions (
  id                uuid primary key default gen_random_uuid(),
  patient_record_id uuid not null references public.patients(id) on delete cascade,
  eye    text not null check (eye in ('OD','OS')),
  status text not null,
  notes  text,
  encounter_id uuid references public.encounters(id) on delete set null,
  recorded_by  uuid not null references public.profiles(id),
  recorded_at  timestamptz not null default now()
);
create index eye_conditions_patient_idx on public.eye_conditions (patient_record_id, recorded_at desc);

-- ------------------------------------------------------------------
-- RLS — clinicians only (doctor/admin), scoped to accessible patients.
-- eye_conditions gets no update/delete policies: append-only, like
-- tooth_conditions.
-- ------------------------------------------------------------------
alter table public.eye_exams      enable row level security;
alter table public.eye_conditions enable row level security;

create policy "clinicians read eye exams" on public.eye_exams
  for select using (is_clinician() and can_access_patient(patient_record_id));
create policy "clinicians insert eye exams" on public.eye_exams
  for insert with check (is_clinician() and can_access_patient(patient_record_id));
create policy "clinicians update eye exams" on public.eye_exams
  for update using (is_clinician() and can_access_patient(patient_record_id));

create policy "clinicians read eye conditions" on public.eye_conditions
  for select using (is_clinician() and can_access_patient(patient_record_id));
create policy "clinicians insert eye conditions" on public.eye_conditions
  for insert with check (is_clinician() and can_access_patient(patient_record_id));

-- ------------------------------------------------------------------
-- Seed the specialty (also addable via Admin -> Specialties)
-- ------------------------------------------------------------------
insert into public.specialties (name, profession_type, sort_order, active)
select 'Ophthalmology', 'doctor',
       coalesce(max(sort_order), 0) + 1, true
from public.specialties where profession_type = 'doctor'
on conflict do nothing;

-- ------------------------------------------------------------------
-- OPTIONAL hardening: block eye_exams edits once the encounter's SOAP
-- note is signed (the app already disables the UI; this enforces it at
-- the DB level, matching the clinical_notes sign-lock philosophy).
-- Uncomment to enable.
-- ------------------------------------------------------------------
-- create or replace function public.block_eye_writes_after_sign() returns trigger
-- language plpgsql security definer as $$
-- begin
--   if exists (select 1 from public.clinical_notes
--              where encounter_id = new.encounter_id
--                and type = 'soap' and signed_at is not null) then
--     raise exception 'Encounter is signed; eye exam records are locked';
--   end if;
--   new.updated_at = now();
--   return new;
-- end $$;
-- create trigger eye_exams_sign_lock before update on public.eye_exams
--   for each row execute function public.block_eye_writes_after_sign();
