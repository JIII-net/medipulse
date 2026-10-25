-- medipulse-patient-profile.sql — what patients can see and keep
--
-- Visit summaries, their own details, receipts, and signing consent forms
-- for the dependents they look after. Everything here works for the
-- patient's own record and for records they're guardian of
-- (is_my_patient_record), and reads go through narrow functions rather
-- than opening the clinical tables to patients.
--
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

-- ===================================================================
-- 1. Visit summaries
--    Only for visits the doctor has signed off. Shows the reason for
--    the visit, the assessment (diagnosis), the plan and the follow-up
--    instruction; never the subjective/objective working notes.
-- ===================================================================
create or replace function public.my_visit_summaries(p_record_id uuid default null)
returns table (encounter_id uuid, appointment_id uuid, patient_record_id uuid, visit_at timestamptz,
               doctor_id uuid, doctor_name text, doctor_slug text, chief_complaint text,
               diagnosis text, plan text, follow_up_note text, signed_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.appointment_id, e.patient_record_id, coalesce(e.started_at, e.created_at),
         e.doctor_id, pr.full_name, d.slug, e.chief_complaint,
         n.assessment, n.plan, e.follow_up_note, n.signed_at
    from encounters e
    join lateral (
      select cn.assessment, cn.plan, cn.signed_at from clinical_notes cn
       where cn.encounter_id = e.id and cn.signed_at is not null
       order by cn.signed_at desc limit 1
    ) n on true
    left join doctors d on d.id = e.doctor_id
    left join profiles pr on pr.id = e.doctor_id
   where public.is_my_patient_record(e.patient_record_id)
     and (p_record_id is null or e.patient_record_id = p_record_id)
   order by coalesce(e.started_at, e.created_at) desc
$$;

-- ===================================================================
-- 2. My details
--    Patients keep their contact details and IDs current. Names, blood
--    type and allergies stay with the clinic.
-- ===================================================================
-- p_address has the clinic's shape: {line1, barangay, city, province, zip}.
create or replace function public.update_my_details(
  p_record_id uuid, p_phone text, p_email text, p_address jsonb, p_birthdate date, p_sex text,
  p_civil_status text, p_philhealth_no text, p_senior_citizen_id text, p_pwd_id text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_my_patient_record(p_record_id) then raise exception 'You can only update your own details or a dependent''s'; end if;
  if p_birthdate is not null and p_birthdate > (now() at time zone 'Asia/Manila')::date then raise exception 'Birthdate can''t be in the future'; end if;
  if nullif(btrim(p_sex), '') is not null and p_sex not in ('male', 'female', 'intersex', 'unknown') then raise exception 'Choose a valid sex'; end if;
  update patients set
    phone = nullif(btrim(p_phone), ''),
    email = nullif(btrim(p_email), ''),
    address = case when p_address is null then address else jsonb_build_object(
      'line1', coalesce(btrim(p_address->>'line1'), ''), 'barangay', coalesce(btrim(p_address->>'barangay'), ''),
      'city', coalesce(btrim(p_address->>'city'), ''), 'province', coalesce(btrim(p_address->>'province'), ''),
      'zip', coalesce(btrim(p_address->>'zip'), '')) end,
    birthdate = p_birthdate,
    sex = coalesce(nullif(btrim(p_sex), ''), sex),
    civil_status = nullif(btrim(p_civil_status), ''),
    philhealth_no = nullif(btrim(p_philhealth_no), ''),
    senior_citizen_id = nullif(btrim(p_senior_citizen_id), ''),
    pwd_id = nullif(btrim(p_pwd_id), ''),
    updated_at = now()
   where id = p_record_id;
end $$;

-- Allergies the clinic recorded, for the patient and their guardian.
drop policy if exists "patient reads own allergies" on public.allergies;
create policy "patient reads own allergies" on public.allergies
  for select using (public.is_my_patient_record(patient_id));

-- ===================================================================
-- 3. Receipts
--    Finalized and paid bills with their lines and payments.
-- ===================================================================
create or replace function public.my_receipts(p_record_id uuid default null)
returns table (invoice_id uuid, invoice_no text, patient_record_id uuid, issued_at timestamptz, status text,
               doctor_name text, doctor_prc text, clinic_name text, clinic_address text, clinic_phone text,
               is_senior_pwd boolean, subtotal numeric, senior_pwd_discount numeric, vat_exempt numeric,
               total_due numeric, items jsonb, payments jsonb)
language sql stable security definer
set search_path = public
as $$
  select i.id, i.invoice_no, i.patient_record_id, coalesce(i.finalized_at, i.created_at), i.status,
         pr.full_name, d.prc_license, loc.name, loc.address, loc.phone,
         coalesce(i.is_senior_pwd, false), i.subtotal, i.senior_pwd_discount, i.vat_exempt, i.total_due,
         coalesce((select jsonb_agg(jsonb_build_object('description', it.description, 'quantity', it.quantity,
                                                       'unit_price', it.unit_price, 'amount', it.amount) order by it.id)
                     from invoice_items it where it.invoice_id = i.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('method', pm.method, 'amount', pm.amount, 'or_number', pm.or_number,
                                                       'reference_no', pm.reference_no, 'paid_at', pm.paid_at) order by pm.paid_at)
                     from payments pm where pm.invoice_id = i.id), '[]'::jsonb)
    from invoices i
    left join profiles pr on pr.id = i.doctor_id
    left join doctors d on d.id = i.doctor_id
    left join encounters e on e.id = i.encounter_id
    left join appointments a on a.id = e.appointment_id
    left join lateral (
      select cl.name, cl.address, cl.phone from clinic_locations cl
       where cl.doctor_id = i.doctor_id
       order by (cl.id = a.location_id) desc nulls last, cl.created_at
       limit 1
    ) loc on true
   where public.is_my_patient_record(i.patient_record_id)
     and (p_record_id is null or i.patient_record_id = p_record_id)
     and i.status in ('final', 'partially_paid', 'paid')
   order by coalesce(i.finalized_at, i.created_at) desc
$$;

-- ===================================================================
-- 4. Guardians sign consent forms for their dependents
--    Same function as before; "is_self" becomes "mine or a dependent's".
-- ===================================================================
create or replace function public.sign_consent_document(p_document_id uuid, p_patient_record_id uuid, p_signed_name text, p_signature_path text, p_appointment_id uuid default null, p_encounter_id uuid default null, p_user_agent text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  d        record;
  is_mine  boolean;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into d from public.consent_documents where id = p_document_id;
  if not found or not d.active then
    raise exception 'Consent document not found or no longer in use';
  end if;

  -- The patient themselves, or the parent/guardian who looks after them.
  is_mine := public.is_my_patient_record(p_patient_record_id);

  -- is_staff() alone would mean "any staff on the platform" inside a
  -- definer function, so pair it with the patient scope check.
  if not (is_mine or (public.is_staff() and public.can_access_patient(p_patient_record_id))) then
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

-- ===================================================================
-- 5. Grants: signed-in patients only
-- ===================================================================
revoke execute on function public.my_visit_summaries(uuid) from public, anon;
revoke execute on function public.update_my_details(uuid, text, text, jsonb, date, text, text, text, text, text) from public, anon;
revoke execute on function public.my_receipts(uuid) from public, anon;
grant execute on function public.my_visit_summaries(uuid) to authenticated;
grant execute on function public.update_my_details(uuid, text, text, jsonb, date, text, text, text, text, text) to authenticated;
grant execute on function public.my_receipts(uuid) to authenticated;

commit;
