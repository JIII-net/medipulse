-- medipulse-consent.sql — consent documents and e-signatures
-- Adds consent_documents (clinic-wide built-ins + per-doctor forms),
-- consent_signatures (append-only, immutable), the signing RPC, and a
-- standard set of Philippine-clinic forms.
-- Run in the Supabase SQL Editor after medipulse-storage.sql.

-- ------------------------------------------------------------------
-- 1. consent_documents
--    doctor_id NULL = clinic-wide built-in, the same convention
--    note_templates uses.
-- ------------------------------------------------------------------
create table if not exists public.consent_documents (
  id        uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade,
  title     text not null,
  body      text not null,
  version   integer not null default 1,
  active    boolean not null default true,
  required_before_consult boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists consent_documents_active_idx on public.consent_documents (active, doctor_id);

alter table public.consent_documents enable row level security;

drop policy if exists "anyone signed in reads active consent docs" on public.consent_documents;
drop policy if exists "doctors manage own consent docs"            on public.consent_documents;

-- Patients must be able to read a form BEFORE they have any relationship
-- with the clinic, so there is nothing to scope by — every signed-in user
-- can read active documents.
-- CONSEQUENCE: never put anything confidential in consent_documents.body.
create policy "anyone signed in reads active consent docs" on public.consent_documents
  for select to authenticated
  using (active or (doctor_id is not null and doctor_id = auth.uid()));

-- A doctor owns their own forms; built-ins (doctor_id null) are seeded
-- here and are not editable from the app.
create policy "doctors manage own consent docs" on public.consent_documents
  for all to authenticated
  using (doctor_id is not null and doctor_id = auth.uid())
  with check (doctor_id is not null and doctor_id = auth.uid());

-- ------------------------------------------------------------------
-- 2. consent_signatures — append-only and immutable
--    Foreign keys deliberately do NOT cascade: a signature is evidence,
--    so a patient/appointment/document that has one cannot be deleted.
-- ------------------------------------------------------------------
create table if not exists public.consent_signatures (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.consent_documents(id),
  document_version  integer not null,
  patient_record_id uuid not null references public.patients(id),
  appointment_id    uuid references public.appointments(id),
  encounter_id      uuid references public.encounters(id),
  signed_name    text not null,
  signature_path text not null,
  signed_at      timestamptz not null default now(),
  signed_by      uuid not null references public.profiles(id),
  user_agent     text
);
create index if not exists consent_signatures_patient_idx
  on public.consent_signatures (patient_record_id, signed_at desc);

alter table public.consent_signatures enable row level security;

drop policy if exists "staff read consent signatures"   on public.consent_signatures;
drop policy if exists "patient reads own signatures"    on public.consent_signatures;

create policy "staff read consent signatures" on public.consent_signatures
  for select using (public.is_staff() and public.can_access_patient(patient_record_id));

create policy "patient reads own signatures" on public.consent_signatures
  for select using (
    exists (select 1 from public.patients p
            where p.id = consent_signatures.patient_record_id
              and p.profile_id is not null
              and p.profile_id = auth.uid())
  );

-- Writes go only through the RPC below; no insert policy.
-- Nothing may ever change or remove a signature.
create or replace function public.block_consent_signature_changes() returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Signed consent records are immutable';
end $$;

drop trigger if exists consent_signatures_immutable on public.consent_signatures;
create trigger consent_signatures_immutable
  before update or delete on public.consent_signatures
  for each row execute function public.block_consent_signature_changes();

-- ------------------------------------------------------------------
-- 3. sign_consent_document
--    Signed by the patient in the portal, or by staff on a clinic
--    tablet while the patient is in front of them.
-- ------------------------------------------------------------------
create or replace function public.sign_consent_document(
  p_document_id       uuid,
  p_patient_record_id uuid,
  p_signed_name       text,
  p_signature_path    text,
  p_appointment_id    uuid default null,
  p_encounter_id      uuid default null,
  p_user_agent        text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  d        record;
  is_self  boolean;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into d from public.consent_documents where id = p_document_id;
  if not found or not d.active then
    raise exception 'Consent document not found or no longer in use';
  end if;

  select exists (
    select 1 from public.patients p
    where p.id = p_patient_record_id
      and p.profile_id is not null
      and p.profile_id = auth.uid()
  ) into is_self;

  -- is_staff() alone would mean "any staff on the platform" inside a
  -- definer function, so pair it with the patient scope check.
  if not (is_self or (public.is_staff() and public.can_access_patient(p_patient_record_id))) then
    raise exception 'Not allowed to sign for this patient';
  end if;

  -- Mirrors the storage policy: you may only attach a file from your own
  -- folder, so a path belonging to someone else cannot be claimed.
  if split_part(p_signature_path, '/', 1) <> auth.uid()::text then
    raise exception 'Signature must be uploaded to your own folder';
  end if;

  if btrim(coalesce(p_signed_name, '')) = '' then
    raise exception 'A signed name is required';
  end if;

  insert into public.consent_signatures (
    document_id, document_version, patient_record_id, appointment_id,
    encounter_id, signed_name, signature_path, signed_by, user_agent
  ) values (
    p_document_id, d.version, p_patient_record_id, p_appointment_id,
    p_encounter_id, btrim(p_signed_name), p_signature_path, auth.uid(), p_user_agent
  ) returning id into new_id;

  return new_id;
end $$;

revoke all on function public.sign_consent_document(uuid, uuid, text, text, uuid, uuid, text) from public;
grant execute on function public.sign_consent_document(uuid, uuid, text, text, uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 4. Built-in forms (doctor_id NULL = available to every practice)
--    Review the wording with your own counsel before going live —
--    these are a solid, standard starting point, not legal advice.
-- ------------------------------------------------------------------
insert into public.consent_documents (doctor_id, title, body, required_before_consult, active)
select null, v.title, v.body, v.required, true
from (values
(
  'Consent to Treatment', true,
$doc$CONSENT TO MEDICAL TREATMENT

1. Consent. I voluntarily consent to the medical and health care services provided by this clinic and its health professionals, including examination, diagnostic tests, and treatment that they judge necessary or advisable for my care.

2. Explanation. My condition, the proposed treatment, its purpose, expected benefits, common risks and side effects, and any reasonable alternatives — including the option of no treatment — will be explained to me in language I understand. I may ask questions at any time.

3. No guarantee. I understand that medicine is not an exact science and that no one has promised or guaranteed any particular result or cure.

4. Right to refuse or withdraw. I may refuse any test or treatment, or withdraw this consent, at any time before or during care. My clinician will explain the likely consequences of refusing, and refusing will not affect my right to be treated with respect.

5. Students and assistants. Trainees or assisting staff may take part in my care under supervision. I may ask that they not be present.

6. Emergencies. If an emergency arises during care and I am unable to give consent, I authorise the clinician to provide treatment reasonably necessary to preserve my life or health.

7. Accuracy of information. I confirm that the health information I have given, including my medicines, allergies and past conditions, is true and complete to the best of my knowledge, and I will report any changes.

8. Financial responsibility. I understand the fees for the services I receive and accept responsibility for paying them, including any part not covered by insurance or PhilHealth.

By signing, I confirm that I have read and understood this form, that my questions have been answered, and that I consent to treatment.$doc$
),
(
  'Data Privacy Consent (RA 10173)', true,
$doc$PRIVACY NOTICE AND CONSENT — Data Privacy Act of 2012 (RA 10173)

1. Who handles your data. This clinic and its health professionals act as the personal information controller for the records created about you.

2. What we collect. Your name, date of birth, sex, contact details and address; your medical history, allergies, diagnoses, test results, prescriptions and clinical notes; billing details including PhilHealth, senior citizen or PWD identifiers; and identification you present at registration.

3. Why we collect it. To provide and coordinate your care; to keep the medical records required by law and professional standards; to bill you and process insurance or PhilHealth claims; to contact you about appointments, results and follow-up; and to meet reporting duties imposed by law, such as notifiable diseases.

4. Sensitive personal information. Health data is sensitive personal information under the Act. We process it on the basis of your consent, for the protection of your life and health, and for the lawful purposes of a medical practitioner in providing care, as the Act allows.

5. Who may see it. Only the clinicians and staff involved in your care and administration. We share your data outside the clinic only where you direct us to, where a law or lawful order requires it, or where it is necessary to protect your life and health in an emergency. We do not sell your data or use it for advertising.

6. How it is kept. Records are held electronically with access limited to authorised personnel, and are retained for the period required by law and professional regulation, after which they are securely disposed of.

7. Your rights. You have the right to be informed; to access your data; to correct inaccurate entries; to object to processing; to erasure or blocking in the circumstances the Act allows; to data portability; to damages for a violation; and to complain to the National Privacy Commission. Ask the clinic if you wish to exercise any of these rights.

8. Withdrawing consent. You may withdraw this consent at any time. Withdrawal does not affect processing already carried out, nor records we are legally required to keep.

By signing, I confirm that this notice was explained to me and I consent to the clinic collecting and processing my personal and health information for the purposes described.$doc$
),
(
  'Telehealth Consent', false,
$doc$CONSENT FOR TELEHEALTH CONSULTATION

1. What telehealth is. A telehealth consultation is a clinical visit carried out by video, voice or messaging rather than in person.

2. Benefits. It can save you travel and waiting time, and give you access to care when attending in person is difficult.

3. Limitations. Your clinician cannot physically examine you. Some conditions cannot be assessed safely at a distance, and you may be asked to attend in person for an examination or tests. Diagnosis and treatment may be delayed as a result.

4. Technology risks. Connections can fail or be of poor quality, and no electronic transmission can be guaranteed completely secure. If the connection drops during a consultation, your clinician will attempt to reconnect or contact you by phone.

5. Emergencies. Telehealth is not for emergencies. If you have chest pain, difficulty breathing, severe bleeding, thoughts of harming yourself, or any other urgent condition, go to the nearest emergency department or call emergency services.

6. Privacy. The same privacy protections apply as for an in-person visit. Please join the call from somewhere private. Do not record the consultation without your clinician's consent; they will likewise not record it without yours.

7. Records and fees. Notes, prescriptions and certificates from a telehealth visit are kept in your medical record exactly as for an in-person visit, and the consultation is chargeable.

8. Your choice. You may withdraw this consent and ask for an in-person appointment at any time.

By signing, I confirm the nature, benefits and limitations of telehealth were explained to me and I consent to being cared for this way.$doc$
),
(
  'Psychotherapy and Mental Health Consent', true,
$doc$INFORMED CONSENT FOR MENTAL HEALTH SERVICES

1. The service. Mental health care may include assessment, psychological testing, psychotherapy, and — where provided by a psychiatrist — medication. Your clinician will discuss the approach they recommend, roughly how long it may take, and what it is intended to achieve.

2. What to expect. Therapy works best when you take an active part. It can bring relief and better functioning, but it can also raise uncomfortable memories and feelings, particularly early on. Results cannot be guaranteed. You may ask about alternatives, including other treatments or no treatment, at any point.

3. Your right to decide. You may ask questions, decline any intervention, seek a second opinion, or end treatment at any time. If you stop, your clinician will offer to discuss it with you and, where appropriate, help arrange other care.

4. Confidentiality. What you say is kept confidential and is recorded in your clinical record, with access limited to those involved in your care.

5. LIMITS OF CONFIDENTIALITY. Your clinician may have to disclose information without your consent in these situations:
   (a) when there is a serious and imminent risk that you will take your own life or seriously harm yourself, so that steps can be taken to keep you safe;
   (b) when you make a credible threat of serious harm to an identifiable other person, so that the person and the authorities may be warned;
   (c) when there is reasonable ground to believe that a child, an older person, or a person with a disability is being abused or neglected, which the clinician is required to report;
   (d) when disclosure is ordered by a court or otherwise required by law;
   (e) when it is needed to obtain emergency medical treatment for you.
   Where disclosure becomes necessary, your clinician will, whenever it is safe and practical to do so, tell you first and share only what the situation requires.

6. Care involving others. If you are seen together with family or a partner, information shared in joint sessions may be known to everyone present. Where the patient is a minor, parents or guardians have rights of access to information, and your clinician will explain how they intend to balance this with the young person's need for privacy.

7. Between appointments. Your clinician is not available at all hours. If you are in crisis, contact the emergency services, go to the nearest emergency department, or use the crisis contacts your clinician gives you.

8. Records, fees and cancellations. Your record is kept as for any medical care. Fees, and any charge for missed or late-cancelled appointments, will be explained to you before treatment starts.

By signing, I confirm that these matters — including the limits of confidentiality in section 5 — were explained to me, that I have had the chance to ask questions, and that I consent to mental health care.$doc$
)
) as v(title, required, body)
where not exists (
  select 1 from public.consent_documents c
  where c.title = v.title and c.doctor_id is null
);
