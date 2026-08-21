-- medipulse-psych-profession.sql — 'psychiatrist' and 'psychologist' profession types
-- Adds the two new values to doctors.profession_type / specialties.profession_type
-- and seeds their specialty lists.
-- Run in the Supabase SQL Editor after medipulse-ophtho-profession.sql.
--
-- !!! RUN THIS FILE IN TWO PASSES !!!
-- Select PART 1 alone and Run it, then select PART 2 alone and Run it.
-- Reason: if profession_type is a Postgres ENUM, "alter type ... add value"
-- records the new label but Postgres refuses to USE it in the same
-- transaction, and the SQL Editor wraps a script in one transaction. Running
-- it all at once would fail PART 2 with "unsafe use of new value of enum type".
-- (Same caveat the docs already record for medipulse-practice.sql.)

-- ==================== PART 1 — run this alone first ====================
do $$
declare c record;
begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'public' and t.typname = 'profession_type' and t.typtype = 'e') then
    -- ENUM storage
    alter type public.profession_type add value if not exists 'psychiatrist';
    alter type public.profession_type add value if not exists 'psychologist';
  else
    -- text + CHECK storage: drop the existing profession_type checks and
    -- re-add them with the extended value list.
    for c in
      select conname, conrelid::regclass::text as tbl
      from pg_constraint
      where contype = 'c'
        and conrelid in ('public.doctors'::regclass, 'public.specialties'::regclass)
        and pg_get_constraintdef(oid) ilike '%profession_type%'
    loop
      execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    end loop;
    alter table public.doctors
      add constraint doctors_profession_type_check
      check (profession_type in ('doctor','dentist','ophthalmologist','psychiatrist','psychologist'));
    alter table public.specialties
      add constraint specialties_profession_type_check
      check (profession_type in ('doctor','dentist','ophthalmologist','psychiatrist','psychologist'));
  end if;
end $$;

-- ==================== PART 2 — run this alone, after PART 1 ====================
insert into public.specialties (name, profession_type, sort_order, active)
select v.name, v.ptype, v.ord, true
from (values
  ('General Adult Psychiatry',              'psychiatrist', 1),
  ('Child & Adolescent Psychiatry',         'psychiatrist', 2),
  ('Geriatric Psychiatry',                  'psychiatrist', 3),
  ('Addiction Psychiatry',                  'psychiatrist', 4),
  ('Consultation-Liaison Psychiatry',       'psychiatrist', 5),
  ('Forensic Psychiatry',                   'psychiatrist', 6),
  ('Clinical Psychology',                   'psychologist', 1),
  ('Counseling Psychology',                 'psychologist', 2),
  ('Child & Adolescent Psychology',         'psychologist', 3),
  ('Neuropsychology',                       'psychologist', 4),
  ('Psychological Assessment / Psychometrics','psychologist', 5),
  ('Family & Couples Therapy',              'psychologist', 6)
) as v(name, ptype, ord)
where not exists (
  select 1 from public.specialties s
  where s.name = v.name and s.profession_type = v.ptype
);
