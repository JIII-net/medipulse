-- medipulse-security-fixes.sql — findings from the full-system check (2026-10-25)
--
--   1. grant_patient_access(patient, doctor) could be called by anyone
--      through the API, letting any account give any doctor access to any
--      patient's records. Only triggers and other functions call it.
--   2. get_or_create_patient_record's check let a caller with no session
--      through (NULL <> id is NULL, not true), so anyone could create
--      patient records for arbitrary accounts.
--   3. redeem_invite / redeem_admin_invite ran without a session.
--   4. Trigger functions were callable through the API (they refuse, but
--      shouldn't be exposed), and six functions had no fixed search_path.
--
-- Triggers don't need EXECUTE on their function, so revoking it from API
-- roles changes nothing for normal use. Run once; safe to run again.

begin;

-- 1. Internal only
revoke execute on function public.grant_patient_access(uuid, uuid) from public, anon, authenticated;

-- 2. Needs a signed-in caller: the patient themselves, or staff
create or replace function public.get_or_create_patient_record(p_profile_id uuid, p_full_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id uuid;
  parts text[];
  fname text;
  lname text;
begin
  -- Authorization: only the patient themselves, or staff, may call this.
  if auth.uid() is null or (auth.uid() <> p_profile_id and not is_staff()) then
    raise exception 'Not authorized to create a patient record for this account';
  end if;

  select id into existing_id from patients where profile_id = p_profile_id;
  if existing_id is not null then
    return existing_id;
  end if;

  parts := regexp_split_to_array(trim(coalesce(p_full_name, 'Patient')), '\s+');
  if array_length(parts, 1) > 1 then
    lname := parts[array_length(parts, 1)];
    fname := array_to_string(parts[1:array_length(parts, 1) - 1], ' ');
  else
    fname := parts[1];
    lname := parts[1];
  end if;

  insert into patients (profile_id, first_name, last_name, sex, created_by)
  values (p_profile_id, fname, lname, 'unknown', auth.uid())
  returning id into new_id;

  return new_id;
end $$;
revoke execute on function public.get_or_create_patient_record(uuid, text) from public, anon;
grant execute on function public.get_or_create_patient_record(uuid, text) to authenticated;

-- 3. Signed-in only (sign-up creates the session first, then redeems)
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.redeem_admin_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.redeem_admin_invite(text) to authenticated;
-- Staff-only actions: no reason to be reachable without a session.
revoke execute on function public.register_patient(jsonb) from public, anon;
revoke execute on function public.checkin_patient_by_qr(text, text, uuid, text, text) from public, anon;
revoke execute on function public.issue_queue_number(text, text) from public, anon;
revoke execute on function public.review_payment_proof(uuid, boolean, text) from public, anon;
revoke execute on function public.submit_payment_proof(uuid, text, numeric, text, text, text) from public, anon;
revoke execute on function public.sign_consent_document(uuid, uuid, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.register_patient(jsonb) to authenticated;
grant execute on function public.checkin_patient_by_qr(text, text, uuid, text, text) to authenticated;
grant execute on function public.issue_queue_number(text, text) to authenticated;
grant execute on function public.review_payment_proof(uuid, boolean, text) to authenticated;
grant execute on function public.submit_payment_proof(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function public.sign_consent_document(uuid, uuid, text, text, uuid, uuid, text) to authenticated;

-- 4. Trigger functions are never called through the API
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

alter function public.assign_invoice_no() set search_path = public;
alter function public.assign_or_no() set search_path = public;
alter function public.assign_mrn() set search_path = public;
alter function public.block_signed_note_edits() set search_path = public;
alter function public.get_user_role() set search_path = public;
alter function public.try_uuid(text) set search_path = public;

commit;
