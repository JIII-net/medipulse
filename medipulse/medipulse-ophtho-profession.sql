-- medipulse-ophtho-profession.sql — "Ophthalmologist" as its own profession type
-- Adds 'ophthalmologist' alongside 'doctor' and 'dentist' on doctors.profession_type
-- and specialties.profession_type, moves the Ophthalmology specialty under it, and
-- seeds the eye subspecialties.
-- Run in the Supabase SQL Editor after medipulse-ophtho.sql.

-- 1. Allow the new profession_type value.
--    Handles both storage styles: a Postgres enum type, or text with a CHECK
--    constraint (drops any existing profession_type checks and re-adds them
--    with the new value included).
do $$
declare c record;
begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where t.typname = 'profession_type' and t.typtype = 'e') then
    alter type public.profession_type add value if not exists 'ophthalmologist';
  else
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
      check (profession_type in ('doctor','dentist','ophthalmologist'));
    alter table public.specialties
      add constraint specialties_profession_type_check
      check (profession_type in ('doctor','dentist','ophthalmologist'));
  end if;
end $$;

-- 2. Move "Ophthalmology" from the doctor list to the new profession,
--    and seed the eye subspecialties.
update public.specialties
set profession_type = 'ophthalmologist', sort_order = 1
where name = 'Ophthalmology';

insert into public.specialties (name, profession_type, sort_order, active)
select v.name, 'ophthalmologist', v.ord, true
from (values
  ('Ophthalmology', 1),
  ('Retina', 2),
  ('Glaucoma', 3),
  ('Cornea & External Disease', 4),
  ('Pediatric Ophthalmology', 5),
  ('Neuro-Ophthalmology', 6),
  ('Oculoplastics', 7)
) as v(name, ord)
where not exists (
  select 1 from public.specialties s
  where s.name = v.name and s.profession_type = 'ophthalmologist'
);

-- 3. Optional: reclassify existing doctors who already picked Ophthalmology
--    as ophthalmologists (uncomment to apply).
-- update public.doctors
-- set profession_type = 'ophthalmologist'
-- where profession_type = 'doctor'
--   and ('Ophthalmology' = any(coalesce(specialties, '{}')) or specialty = 'Ophthalmology');
