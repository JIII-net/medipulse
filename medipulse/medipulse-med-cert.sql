-- medipulse-med-cert.sql — fuller medical certificates
--
-- Work-from-home days (after any rest days), the date the period starts,
-- "fit to work", and what the certificate is for. Doctors can add their
-- PTR number, which prints under their PRC license number.
--
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

alter table public.med_certificates
  add column if not exists wfh_days integer not null default 0,
  add column if not exists starts_on date,
  add column if not exists fit_to_work boolean not null default false,
  add column if not exists purpose text;

do $$ begin
  alter table public.med_certificates add constraint med_certificates_wfh_days_check check (wfh_days between 0 and 365);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.med_certificates add constraint med_certificates_purpose_check check (char_length(purpose) <= 200);
exception when duplicate_object then null; end $$;

-- Printed on certificates and prescriptions with the PRC license number.
alter table public.doctors add column if not exists ptr_no text;
do $$ begin
  alter table public.doctors add constraint doctors_ptr_no_check check (char_length(ptr_no) <= 40);
exception when duplicate_object then null; end $$;

commit;
