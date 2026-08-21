-- medipulse-psych.sql — Mental health module
-- Adds: mh_assessments (one row per encounter: mental status exam, risk,
--        session note), mh_screenings (append-only PHQ-9 / GAD-7 scores),
--        and built-in psychiatry/psychology note templates.
-- Run in the Supabase SQL Editor after medipulse-psych-profession.sql.
-- NOTE: verify the RLS shape matches your existing clinical tables first:
--   select * from pg_policies where tablename = 'eye_exams';

-- ------------------------------------------------------------------
-- mh_assessments — one row per encounter (upserted from the tab)
-- ------------------------------------------------------------------
create table if not exists public.mh_assessments (
  id                uuid primary key default gen_random_uuid(),
  encounter_id      uuid not null references public.encounters(id) on delete cascade,
  patient_record_id uuid not null references public.patients(id) on delete cascade,

  -- mental status exam
  appearance      text, behavior      text, speech        text,
  mood            text, affect        text,
  thought_process text, thought_content text, perception  text,
  cognition       text, insight       text, judgment      text,
  mse_notes       text,

  -- risk assessment
  risk_level text not null default 'none'
    check (risk_level in ('none','low','moderate','high')),
  suicidal_ideation text not null default 'none'
    check (suicidal_ideation in ('none','passive','active_no_plan','active_with_plan','active_with_intent')),
  self_harm          text,
  harm_to_others     text,
  protective_factors text,
  safety_plan        text,

  -- session note
  presenting_concerns text,
  interventions       text,
  patient_response    text,
  homework            text,
  goals_plan          text,

  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (encounter_id)
);
create index if not exists mh_assessments_patient_idx
  on public.mh_assessments (patient_record_id, recorded_at desc);

-- ------------------------------------------------------------------
-- mh_screenings — append-only, one row per administered instrument
-- ------------------------------------------------------------------
create table if not exists public.mh_screenings (
  id                uuid primary key default gen_random_uuid(),
  patient_record_id uuid not null references public.patients(id) on delete cascade,
  encounter_id      uuid references public.encounters(id) on delete set null,
  instrument text not null check (instrument in ('phq9','gad7')),
  responses  jsonb not null,
  total      int   not null,
  severity   text  not null,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  -- score ranges are fixed by the instruments themselves
  constraint mh_screenings_total_range check (
    (instrument = 'phq9' and total between 0 and 27) or
    (instrument = 'gad7' and total between 0 and 21)
  )
);
create index if not exists mh_screenings_patient_idx
  on public.mh_screenings (patient_record_id, instrument, recorded_at);

-- ------------------------------------------------------------------
-- RLS — clinicians only (doctor/admin), scoped to accessible patients.
-- mh_screenings gets no update/delete policies: append-only.
-- ------------------------------------------------------------------
alter table public.mh_assessments enable row level security;
alter table public.mh_screenings  enable row level security;

drop policy if exists "clinicians read mh assessments"   on public.mh_assessments;
drop policy if exists "clinicians insert mh assessments" on public.mh_assessments;
drop policy if exists "clinicians update mh assessments" on public.mh_assessments;
drop policy if exists "clinicians read mh screenings"    on public.mh_screenings;
drop policy if exists "clinicians insert mh screenings"  on public.mh_screenings;

create policy "clinicians read mh assessments" on public.mh_assessments
  for select using (is_clinician() and can_access_patient(patient_record_id));
create policy "clinicians insert mh assessments" on public.mh_assessments
  for insert with check (is_clinician() and can_access_patient(patient_record_id));
create policy "clinicians update mh assessments" on public.mh_assessments
  for update using (is_clinician() and can_access_patient(patient_record_id));

create policy "clinicians read mh screenings" on public.mh_screenings
  for select using (is_clinician() and can_access_patient(patient_record_id));
create policy "clinicians insert mh screenings" on public.mh_screenings
  for insert with check (is_clinician() and can_access_patient(patient_record_id));

-- ------------------------------------------------------------------
-- Sign-lock: once the encounter's SOAP note is signed, the mental health
-- record for that encounter is locked, matching the clinical_notes rule.
-- ------------------------------------------------------------------
create or replace function public.block_mh_writes_after_sign() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.clinical_notes
             where encounter_id = new.encounter_id
               and type = 'soap' and signed_at is not null) then
    raise exception 'Encounter is signed; mental health records are locked';
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists mh_assessments_sign_lock on public.mh_assessments;
create trigger mh_assessments_sign_lock before update on public.mh_assessments
  for each row execute function public.block_mh_writes_after_sign();

-- ------------------------------------------------------------------
-- Built-in note templates (doctor_id NULL = available to everyone)
-- ------------------------------------------------------------------
insert into public.note_templates (doctor_id, name, specialty, subjective, objective, assessment, plan)
select null, v.name, v.specialty, v.subjective, v.objective, v.assessment, v.plan
from (values
  (
    'Initial psychiatric evaluation', 'Psychiatry',
    E'Chief complaint and history of present illness:\nOnset, duration, course, precipitants:\nPast psychiatric history (episodes, hospitalisations, prior medications and response):\nSubstance use (alcohol, tobacco, other):\nFamily psychiatric history:\nDevelopmental and social history:\nCurrent stressors and supports:',
    E'Mental status exam: see the Mental Health tab.\nPHQ-9 / GAD-7: see the Mental Health tab.\nVital signs:\nRelevant physical findings and labs:\nCurrent medications and allergies:',
    E'Working diagnosis:\nDifferential:\nRisk formulation (see Mental Health tab):\nBiopsychosocial formulation:',
    E'Medication started/adjusted, with rationale:\nPsychotherapy referral:\nLabs / monitoring ordered:\nPsychoeducation given, including side effects and expected time to response:\nSafety plan discussed:\nFollow-up interval:'
  ),
  (
    'Medication management follow-up', 'Psychiatry',
    E'Interval history since last visit:\nResponse to current medication:\nAdherence:\nSide effects reported:\nSleep, appetite, energy, concentration:\nSubstance use:',
    E'Mental status exam: see the Mental Health tab.\nScreener scores this visit vs last:\nWeight / vitals / relevant labs:\nCurrent regimen and doses:',
    E'Diagnosis:\nResponse: remission / partial response / no response / worsening\nAdherence and tolerability:\nCurrent risk level:',
    E'Medication continued / titrated / switched, with rationale:\nSide effects managed:\nLabs or monitoring due:\nNext review:'
  ),
  (
    'Psychotherapy intake', 'Psychology',
    E'Presenting concerns in the client''s own words:\nOnset, course and triggers:\nPrevious therapy and what helped:\nMedical and psychiatric history:\nSubstance use:\nFamily, relationships and living situation:\nWork or school functioning:\nStrengths, interests and supports:\nClient''s goals for therapy:',
    E'Mental status observations: see the Mental Health tab.\nBaseline screener scores (PHQ-9 / GAD-7):\nOther measures administered:',
    E'Clinical impression and case formulation:\nPredisposing, precipitating, perpetuating and protective factors:\nRisk assessment: see the Mental Health tab.',
    E'Treatment modality and rationale:\nAgreed goals (specific and measurable):\nSession frequency and expected duration:\nInformed consent and limits of confidentiality discussed:\nHomework agreed:\nNext session:'
  ),
  (
    'Therapy session note', 'Psychology',
    E'Client report since last session:\nHomework review:\nCurrent stressors:',
    E'Presentation and engagement in session:\nScreener scores, if re-administered:',
    E'Progress toward agreed goals:\nBarriers observed:\nRisk status this session:',
    E'Interventions used this session:\nClient response:\nHomework for next session:\nPlan and next appointment:'
  )
) as v(name, specialty, subjective, objective, assessment, plan)
where not exists (
  select 1 from public.note_templates t
  where t.name = v.name and t.doctor_id is null
);
