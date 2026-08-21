-- medipulse-prepayment.sql — pay-before-you-book
-- Adds per-doctor prepayment settings, appointment payment state, the
-- payment_proofs table, and the RPCs that let a patient submit proof and
-- staff verify it.
-- Run in the Supabase SQL Editor after medipulse-storage.sql.
--
-- !! SECURITY, READ THIS !!
-- Patients can already update their own appointment row (the portal's
-- Cancel button does exactly that), and RLS cannot restrict WHICH columns
-- an update touches. Without the guard trigger at the bottom of this file,
-- any patient could set payment_status='verified' from the browser console
-- and skip paying. The trigger is the security boundary of this feature,
-- not optional hardening. Do not drop it.

-- ------------------------------------------------------------------
-- 1. Per-doctor settings
-- ------------------------------------------------------------------
alter table public.doctors add column if not exists require_prepayment      boolean not null default false;
alter table public.doctors add column if not exists prepayment_amount       numeric(10,2);
alter table public.doctors add column if not exists payment_instructions    text;
alter table public.doctors add column if not exists prepayment_hold_minutes integer not null default 1440;

-- ------------------------------------------------------------------
-- 2. Appointment payment state
--    Existing rows default to 'not_required', so nothing already booked
--    is affected.
-- ------------------------------------------------------------------
alter table public.appointments add column if not exists payment_status text not null default 'not_required';
alter table public.appointments add column if not exists payment_due_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_payment_status_check') then
    alter table public.appointments
      add constraint appointments_payment_status_check
      check (payment_status in ('not_required','awaiting_payment','proof_submitted','verified','rejected'));
  end if;
end $$;

create index if not exists appointments_payment_hold_idx
  on public.appointments (payment_status, payment_due_at);

-- ------------------------------------------------------------------
-- 3. payment_proofs
-- ------------------------------------------------------------------
create table if not exists public.payment_proofs (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references public.appointments(id) on delete cascade,
  patient_record_id uuid not null references public.patients(id) on delete cascade,
  storage_path text not null,
  amount       numeric(10,2) not null check (amount > 0),
  method       text not null check (method in ('gcash','maya','bank','card','cash')),
  reference_no text,
  note         text,
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  review_note  text
);
create index if not exists payment_proofs_appt_idx on public.payment_proofs (appointment_id, submitted_at desc);

alter table public.payment_proofs enable row level security;

drop policy if exists "staff read payment proofs"   on public.payment_proofs;
drop policy if exists "patient reads own proofs"    on public.payment_proofs;

-- Front desk handles billing, so is_staff() (not is_clinician()), scoped
-- to patients this practice can actually access.
create policy "staff read payment proofs" on public.payment_proofs
  for select using (public.is_staff() and public.can_access_patient(patient_record_id));

create policy "patient reads own proofs" on public.payment_proofs
  for select using (
    exists (select 1 from public.appointments a
            where a.id = payment_proofs.appointment_id
              and a.patient_id is not null
              and a.patient_id = auth.uid())
  );

-- Writes go exclusively through the RPCs below — no insert/update policy.

-- ------------------------------------------------------------------
-- 4. submit_payment_proof — patient (or staff) attaches proof
-- ------------------------------------------------------------------
create or replace function public.submit_payment_proof(
  p_appointment_id uuid,
  p_storage_path   text,
  p_amount         numeric,
  p_method         text,
  p_reference_no   text default null,
  p_note           text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  a        record;
  is_owner boolean;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into a from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'Appointment not found';
  end if;

  -- patient_id is nullable (staff-created bookings have no portal login),
  -- so null must never be treated as a match.
  is_owner := a.patient_id is not null and a.patient_id = auth.uid();

  -- A definer function bypasses RLS, so is_staff() alone would mean "any
  -- staff on the platform" — pair it with the patient scope check.
  if not (is_owner or (public.is_staff() and public.can_access_patient(a.patient_record_id))) then
    raise exception 'Not allowed to submit payment for this appointment';
  end if;

  -- The uploader may only register a file from their own storage folder;
  -- this mirrors the bucket policy so a stolen path cannot be claimed.
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'Payment proof must be uploaded to your own folder';
  end if;

  insert into public.payment_proofs (
    appointment_id, patient_record_id, storage_path, amount, method,
    reference_no, note, submitted_by
  ) values (
    p_appointment_id, a.patient_record_id, p_storage_path, p_amount, p_method,
    nullif(btrim(p_reference_no), ''), nullif(btrim(p_note), ''), auth.uid()
  ) returning id into new_id;

  -- This function is trusted; tell the guard trigger to stand down for
  -- the rest of THIS transaction only (set_config with is_local = true).
  perform set_config('medipulse.appt_guard_bypass', 'on', true);

  update public.appointments
     set payment_status = 'proof_submitted'
   where id = p_appointment_id;

  return new_id;
end $$;

revoke all on function public.submit_payment_proof(uuid, text, numeric, text, text, text) from public;
grant execute on function public.submit_payment_proof(uuid, text, numeric, text, text, text) to authenticated;

-- ------------------------------------------------------------------
-- 5. review_payment_proof — staff verify or reject
-- ------------------------------------------------------------------
create or replace function public.review_payment_proof(
  p_proof_id uuid,
  p_approve  boolean,
  p_note     text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare pr record;
begin
  select * into pr from public.payment_proofs where id = p_proof_id;
  if not found then
    raise exception 'Payment proof not found';
  end if;

  if not (public.is_staff() and public.can_access_patient(pr.patient_record_id)) then
    raise exception 'Only clinic staff can review payments';
  end if;

  update public.payment_proofs
     set status      = case when p_approve then 'verified' else 'rejected' end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(p_note), '')
   where id = p_proof_id;

  perform set_config('medipulse.appt_guard_bypass', 'on', true);

  if p_approve then
    update public.appointments
       set payment_status = 'verified',
           status = case when status = 'booked' then 'confirmed' else status end,
           payment_due_at = null
     where id = pr.appointment_id;
  else
    update public.appointments
       set payment_status = 'rejected'
     where id = pr.appointment_id;
  end if;
end $$;

revoke all on function public.review_payment_proof(uuid, boolean, text) from public;
grant execute on function public.review_payment_proof(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------
-- 6. expire_unpaid_holds — release slots nobody paid for
--    Safe to call repeatedly; only touches lapsed, still-unpaid holds.
-- ------------------------------------------------------------------
create or replace function public.expire_unpaid_holds() returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('medipulse.appt_guard_bypass', 'on', true);
  update public.appointments
     set status = 'canceled'
   where payment_status = 'awaiting_payment'
     and payment_due_at is not null
     and payment_due_at < now()
     and status in ('booked', 'confirmed');
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.expire_unpaid_holds() to authenticated;

-- ------------------------------------------------------------------
-- 7. THE GUARD — patients may only ever cancel
--    Without this, the permissive patient UPDATE policy on appointments
--    lets a patient set their own payment_status to 'verified'.
-- ------------------------------------------------------------------
create or replace function public.guard_appointment_patient_update() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- The trusted RPCs above set this transaction-local flag before they
  -- touch an appointment. Without it a patient calling submit_payment_proof
  -- would be blocked by this very trigger.
  if coalesce(current_setting('medipulse.appt_guard_bypass', true), '') = 'on' then
    return new;
  end if;

  -- Staff (and anything running server-side with no auth context) are
  -- unaffected.
  if public.is_staff() or auth.uid() is null then
    return new;
  end if;

  -- For everyone else the ONLY permitted change is cancelling.
  if new.status = 'canceled'
     and old.payment_status is not distinct from new.payment_status
     and old.payment_due_at  is not distinct from new.payment_due_at
     and old.starts_at       is not distinct from new.starts_at
     and old.ends_at         is not distinct from new.ends_at
     and old.doctor_id       is not distinct from new.doctor_id
     and old.fee_charged     is not distinct from new.fee_charged
     and old.patient_record_id is not distinct from new.patient_record_id then
    return new;
  end if;

  raise exception 'Patients may only cancel an appointment';
end $$;

drop trigger if exists appointments_patient_update_guard on public.appointments;
create trigger appointments_patient_update_guard
  before update on public.appointments
  for each row execute function public.guard_appointment_patient_update();

-- ------------------------------------------------------------------
-- 8. taken_slots — DO NOT paste a blind rewrite
--    Expired unpaid holds should stop blocking the calendar. The function
--    lives only in your database, so read it first:
--
--      select prosrc from pg_proc where proname = 'taken_slots';
--
--    then add this to its WHERE clause, keeping everything else (and the
--    return shape) exactly as it is:
--
--      and not (payment_status = 'awaiting_payment'
--               and payment_due_at is not null
--               and payment_due_at < now())
--
--    Until then, run select public.expire_unpaid_holds(); to release
--    lapsed holds — expired holds become 'canceled', which taken_slots
--    already excludes if it filters on status.
-- ------------------------------------------------------------------
