-- medipulse-release-2026-10.sql — October release
-- Waitlist offers · doctor profile pages and reviews · family accounts ·
-- patient files and records · subscription invoicing · no-show credit.
--
-- Run once in the Supabase SQL Editor. Safe to run again: every statement
-- is guarded or uses create-or-replace. It also carries the payment-hold
-- changes from medipulse-downpayment-hold.sql (section 0), which had not
-- been applied to the live database.
--
-- Security notes, read before editing:
--   * Patients may only ever CANCEL their own appointment (the guard
--     trigger from medipulse-prepayment.sql). Everything here that moves an
--     appointment or money goes through a security-definer function that
--     checks ownership itself and sets medipulse.appt_guard_bypass.
--   * is_my_patient_record() is the single definition of "this patient
--     record belongs to me or to someone I look after". Policies use it.

begin;

-- ===================================================================
-- 0. Payment holds (from medipulse-downpayment-hold.sql)
-- ===================================================================
alter table public.appointments drop constraint if exists appointments_payment_status_check;
alter table public.appointments
  add constraint appointments_payment_status_check
  check (payment_status in ('not_required','awaiting_payment','proof_submitted','verified','rejected','expired'));

create or replace function public.expire_unpaid_holds() returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('medipulse.appt_guard_bypass', 'on', true);
  update public.appointments
     set status = 'canceled',
         payment_status = 'expired'
   where payment_status = 'awaiting_payment'
     and payment_due_at is not null
     and payment_due_at < now()
     and status in ('booked', 'confirmed');
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.expire_unpaid_holds() to authenticated;

-- ===================================================================
-- 1. Shared helpers
-- ===================================================================

-- Family accounts: a dependent's record is looked after by a guardian.
alter table public.patients add column if not exists guardian_profile_id uuid references public.profiles(id);
alter table public.patients add column if not exists guardian_relationship text;
create index if not exists patients_guardian_idx on public.patients (guardian_profile_id);

-- "This patient record is mine, or belongs to someone I look after."
create or replace function public.is_my_patient_record(p uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from patients
     where id = p
       and deleted_at is null
       and (profile_id = auth.uid() or guardian_profile_id = auth.uid())
  )
$$;
grant execute on function public.is_my_patient_record(uuid) to authenticated;

-- Folder names in storage are record ids; never let a bad name throw.
create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- Who to text/email about a patient record: the record itself, else the
-- account that looks after it.
create or replace function public.patient_contact(p uuid, out phone text, out email text)
language sql stable security definer
set search_path = public
as $$
  select coalesce(pt.phone, gp.phone, sp.phone),
         coalesce(pt.email, gu.email, su.email)
    from patients pt
    left join profiles sp on sp.id = pt.profile_id
    left join auth.users su on su.id = pt.profile_id
    left join profiles gp on gp.id = pt.guardian_profile_id
    left join auth.users gu on gu.id = pt.guardian_profile_id
   where pt.id = p
$$;

-- Queue an SMS (preferred) or email to a patient record's contact.
create or replace function public.notify_patient(p uuid, body text, appt uuid default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare c record;
begin
  select * into c from public.patient_contact(p);
  if c.phone is not null then
    insert into notifications (channel, recipient, body, related_appointment) values ('sms', c.phone, body, appt);
  elsif c.email is not null then
    insert into notifications (channel, recipient, body, related_appointment) values ('email', c.email, body, appt);
  end if;
end $$;

-- ===================================================================
-- 2. Family accounts
-- ===================================================================

drop policy if exists "guardian reads dependents" on public.patients;
create policy "guardian reads dependents" on public.patients
  for select using (guardian_profile_id = auth.uid());

-- A patient may only book for a record that is theirs or a dependent's.
-- (The old policy checked patient_id only, so any record id was accepted.)
drop policy if exists "patient creates appointment" on public.appointments;
create policy "patient creates appointment" on public.appointments
  for insert with check (
    patient_id = auth.uid()
    and (patient_record_id is null or public.is_my_patient_record(patient_record_id))
  );

create or replace function public.add_dependent(
  p_first_name text, p_last_name text, p_birthdate date, p_sex text, p_relationship text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(btrim(p_first_name), '') = '' or coalesce(btrim(p_last_name), '') = '' then
    raise exception 'First and last name are required';
  end if;
  insert into patients (first_name, last_name, birthdate, sex, guardian_profile_id, guardian_relationship, created_by)
  values (btrim(p_first_name), btrim(p_last_name), p_birthdate, coalesce(nullif(p_sex, ''), 'unknown'),
          auth.uid(), nullif(btrim(p_relationship), ''), auth.uid())
  returning id into new_id;
  return new_id;
end $$;
grant execute on function public.add_dependent(text, text, date, text, text) to authenticated;

create or replace function public.remove_dependent(p_id uuid) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update patients set deleted_at = now()
   where id = p_id and guardian_profile_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Not your dependent'; end if;
end $$;
grant execute on function public.remove_dependent(uuid) to authenticated;

-- Guardians see their dependents' visits, prescriptions, bills and forms.
drop policy if exists "guardian encounters" on public.encounters;
create policy "guardian encounters" on public.encounters
  for select using (public.is_my_patient_record(patient_record_id));

drop policy if exists "guardian rx" on public.prescriptions;
create policy "guardian rx" on public.prescriptions
  for select using (exists (select 1 from encounters e where e.id = prescriptions.encounter_id and public.is_my_patient_record(e.patient_record_id)));

drop policy if exists "guardian rx items" on public.prescription_items;
create policy "guardian rx items" on public.prescription_items
  for select using (exists (
    select 1 from prescriptions rx join encounters e on e.id = rx.encounter_id
     where rx.id = prescription_items.prescription_id and public.is_my_patient_record(e.patient_record_id)));

drop policy if exists "patient medcerts" on public.med_certificates;
create policy "patient medcerts" on public.med_certificates
  for select using (exists (select 1 from encounters e where e.id = med_certificates.encounter_id and public.is_my_patient_record(e.patient_record_id)));

drop policy if exists "guardian invoices" on public.invoices;
create policy "guardian invoices" on public.invoices
  for select using (public.is_my_patient_record(patient_record_id));

drop policy if exists "guardian consent signatures" on public.consent_signatures;
create policy "guardian consent signatures" on public.consent_signatures
  for select using (public.is_my_patient_record(patient_record_id));

-- ===================================================================
-- 3. Patient files (lab results, imaging, documents)
-- ===================================================================

create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_record_id uuid not null references public.patients(id),
  kind text not null default 'lab_result' check (kind in ('lab_result','imaging','prescription','certificate','referral','other')),
  title text not null,
  note text,
  storage_path text not null,
  visible_to_patient boolean not null default true,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists patient_files_record_idx on public.patient_files (patient_record_id, created_at desc);
alter table public.patient_files enable row level security;

drop policy if exists "staff manage patient files" on public.patient_files;
create policy "staff manage patient files" on public.patient_files
  for all using (public.is_staff() and public.can_access_patient(patient_record_id))
  with check (public.is_staff() and public.can_access_patient(patient_record_id));

drop policy if exists "patient reads own files" on public.patient_files;
create policy "patient reads own files" on public.patient_files
  for select using (visible_to_patient and public.is_my_patient_record(patient_record_id));

insert into storage.buckets (id, name, public) values ('patient-files', 'patient-files', false)
on conflict (id) do nothing;

-- Objects live at <patient_record_id>/<file>.
drop policy if exists "pf staff write" on storage.objects;
create policy "pf staff write" on storage.objects
  for insert with check (bucket_id = 'patient-files' and public.is_staff()
                         and public.can_access_patient(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "pf read" on storage.objects;
create policy "pf read" on storage.objects
  for select using (bucket_id = 'patient-files' and (
    (public.is_staff() and public.can_access_patient(public.try_uuid((storage.foldername(name))[1])))
    or exists (select 1 from public.patient_files f
                where f.storage_path = storage.objects.name and f.visible_to_patient
                  and public.is_my_patient_record(f.patient_record_id))));
drop policy if exists "pf staff delete" on storage.objects;
create policy "pf staff delete" on storage.objects
  for delete using (bucket_id = 'patient-files' and public.is_staff()
                    and public.can_access_patient(public.try_uuid((storage.foldername(name))[1])));

-- ===================================================================
-- 4. Doctor profile pages and reviews
-- ===================================================================

alter table public.doctors add column if not exists slug text;
alter table public.doctors add column if not exists photo_url text;
create unique index if not exists doctors_slug_key on public.doctors (slug) where slug is not null;

-- Give every existing doctor a link: name-based, plus 4 characters of the
-- id so two "Maria Santos" never collide.
update public.doctors d
   set slug = trim(both '-' from regexp_replace(lower(coalesce(p.full_name, 'doctor')), '[^a-z0-9]+', '-', 'g'))
              || '-' || left(replace(d.id::text, '-', ''), 4)
  from public.profiles p
 where p.id = d.id and d.slug is null;

insert into storage.buckets (id, name, public) values ('doctor-photos', 'doctor-photos', true)
on conflict (id) do nothing;
drop policy if exists "dp owner write" on storage.objects;
create policy "dp owner write" on storage.objects
  for insert with check (bucket_id = 'doctor-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dp owner update" on storage.objects;
create policy "dp owner update" on storage.objects
  for update using (bucket_id = 'doctor-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dp public read" on storage.objects;
create policy "dp public read" on storage.objects
  for select using (bucket_id = 'doctor-photos');

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id),
  appointment_id uuid not null unique references public.appointments(id),
  author_id uuid not null references public.profiles(id),
  author_name text,
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reviews_doctor_idx on public.reviews (doctor_id, created_at desc);
alter table public.reviews enable row level security;

drop policy if exists "reviews are public" on public.reviews;
create policy "reviews are public" on public.reviews for select using (not hidden or author_id = auth.uid() or public.get_user_role() = 'admin');
drop policy if exists "admin moderates reviews" on public.reviews;
create policy "admin moderates reviews" on public.reviews for update using (public.get_user_role() = 'admin');

-- Only the patient who had a completed visit may review it, once.
create or replace function public.submit_review(p_appointment_id uuid, p_rating integer, p_comment text default null) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare a record; new_id uuid; nm text;
begin
  select * into a from appointments where id = p_appointment_id;
  if not found or a.patient_id is distinct from auth.uid() then raise exception 'You can only review your own visits'; end if;
  if a.status <> 'completed' then raise exception 'You can review a visit once it is completed'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be 1 to 5'; end if;
  -- Shown publicly as first name and last initial.
  select split_part(btrim(full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(full_name), ' ', 2), ''), 1) || '.', '')
    into nm from profiles where id = auth.uid();
  insert into reviews (doctor_id, appointment_id, author_id, author_name, rating, comment)
  values (a.doctor_id, a.id, auth.uid(), nm, p_rating, nullif(btrim(p_comment), ''))
  returning id into new_id;
  return new_id;
end $$;
grant execute on function public.submit_review(uuid, integer, text) to authenticated;

create or replace function public.doctor_ratings() returns table (doctor_id uuid, avg_rating numeric, review_count bigint)
language sql stable security definer
set search_path = public
as $$
  select doctor_id, round(avg(rating)::numeric, 1), count(*) from reviews where not hidden group by doctor_id
$$;
grant execute on function public.doctor_ratings() to anon, authenticated;

-- ===================================================================
-- 5. Waitlist offers
-- ===================================================================

alter table public.waitlist add column if not exists profile_id uuid references public.profiles(id);
alter table public.waitlist add column if not exists mode text not null default 'clinic';
alter table public.waitlist add column if not exists location_id uuid;
alter table public.waitlist add column if not exists offered_starts_at timestamptz;
alter table public.waitlist add column if not exists offer_expires_at timestamptz;
alter table public.waitlist add column if not exists appointment_id uuid references public.appointments(id);
create index if not exists waitlist_queue_idx on public.waitlist (doctor_id, preferred_date, status, created_at);

-- The original table only knew waiting/scheduled/cancelled; offers add
-- offered, booked and expired. Both spellings of cancel stay valid.
alter table public.waitlist drop constraint if exists waitlist_status_check;
alter table public.waitlist add constraint waitlist_status_check
  check (status in ('waiting', 'offered', 'booked', 'expired', 'canceled', 'cancelled', 'scheduled'));

drop policy if exists "patient reads own waitlist" on public.waitlist;
create policy "patient reads own waitlist" on public.waitlist
  for select using (profile_id = auth.uid());

create or replace function public.join_waitlist(p_doctor_id uuid, p_date date, p_patient_record_id uuid, p_mode text default 'clinic', p_location_id uuid default null) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if not public.is_my_patient_record(p_patient_record_id) then raise exception 'Choose yourself or one of your dependents'; end if;
  if p_date < (now() at time zone 'Asia/Manila')::date then raise exception 'Pick today or a later date'; end if;
  select id into new_id from waitlist
   where doctor_id = p_doctor_id and preferred_date = p_date and patient_record_id = p_patient_record_id and status in ('waiting','offered');
  if new_id is not null then return new_id; end if;
  insert into waitlist (patient_record_id, doctor_id, preferred_date, profile_id, mode, location_id, status)
  values (p_patient_record_id, p_doctor_id, p_date, auth.uid(), coalesce(p_mode, 'clinic'), p_location_id, 'waiting')
  returning id into new_id;
  perform grant_patient_access(p_patient_record_id, p_doctor_id);
  return new_id;
end $$;
grant execute on function public.join_waitlist(uuid, date, uuid, text, uuid) to authenticated;

create or replace function public.leave_waitlist(p_id uuid) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update waitlist set status = 'canceled' where id = p_id and profile_id = auth.uid() and status in ('waiting','offered');
end $$;
grant execute on function public.leave_waitlist(uuid) to authenticated;

-- Offer a freed slot to the first person waiting for that doctor and day.
-- The offer holds the slot for 30 minutes (taken_slots counts it).
create or replace function public.offer_next_waitlist(p_doctor_id uuid, p_starts_at timestamptz) returns void
language plpgsql security definer
set search_path = public
as $$
declare w record; dname text;
begin
  if p_starts_at <= now() + interval '15 minutes' then return; end if;
  -- Someone already has, or is being offered, this time.
  if exists (select 1 from appointments where doctor_id = p_doctor_id and starts_at = p_starts_at and status not in ('canceled','no_show'))
     or exists (select 1 from waitlist where doctor_id = p_doctor_id and offered_starts_at = p_starts_at and status = 'offered' and offer_expires_at > now()) then
    return;
  end if;
  select * into w from waitlist
   where doctor_id = p_doctor_id and status = 'waiting'
     and preferred_date = (p_starts_at at time zone 'Asia/Manila')::date
   order by created_at limit 1 for update skip locked;
  if not found then return; end if;
  update waitlist set status = 'offered', offered_starts_at = p_starts_at, offer_expires_at = now() + interval '30 minutes' where id = w.id;
  select full_name into dname from profiles where id = p_doctor_id;
  perform public.notify_patient(w.patient_record_id,
    '4MED: A slot opened with ' || coalesce(dname, 'your doctor') || ' on ' ||
    to_char(p_starts_at at time zone 'Asia/Manila', 'Mon DD "at" FMHH12:MI AM') ||
    '. Open 4MED within 30 minutes to book it.');
end $$;

create or replace function public.trg_offer_freed_slot() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status in ('canceled') and old.status is distinct from new.status and new.starts_at > now() then
    perform public.offer_next_waitlist(new.doctor_id, new.starts_at);
  end if;
  return new;
end $$;
drop trigger if exists offer_freed_slot on public.appointments;
create trigger offer_freed_slot after update of status on public.appointments
  for each row execute function public.trg_offer_freed_slot();

-- Book the offered slot. Uses the doctor's payment rules like any booking.
create or replace function public.claim_waitlist_offer(p_id uuid) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare w record; d record; appt_id uuid; due timestamptz;
begin
  select * into w from waitlist where id = p_id for update;
  if not found or w.profile_id is distinct from auth.uid() then raise exception 'Offer not found'; end if;
  if w.status <> 'offered' or w.offer_expires_at < now() then raise exception 'This offer has expired'; end if;
  if exists (select 1 from appointments where doctor_id = w.doctor_id and starts_at = w.offered_starts_at and status not in ('canceled','no_show')) then
    update waitlist set status = 'expired' where id = p_id;
    raise exception 'Sorry, that slot was just taken';
  end if;
  select * into d from doctors where id = w.doctor_id;
  due := case when d.require_prepayment then least(w.offered_starts_at, now() + make_interval(mins => coalesce(d.prepayment_hold_minutes, 30))) end;
  insert into appointments (doctor_id, patient_id, patient_record_id, starts_at, ends_at, mode, fee_charged, location_id, source, type, payment_status, payment_due_at)
  values (w.doctor_id, auth.uid(), w.patient_record_id, w.offered_starts_at, w.offered_starts_at + interval '30 minutes',
          coalesce(w.mode, 'clinic')::visit_mode, d.consult_fee, w.location_id, 'waitlist', 'consultation',
          case when d.require_prepayment then 'awaiting_payment' else 'not_required' end, due)
  returning id into appt_id;
  update waitlist set status = 'booked', appointment_id = appt_id where id = p_id;
  return appt_id;
end $$;
grant execute on function public.claim_waitlist_offer(uuid) to authenticated;

-- Lapsed offers go to the next person in line.
create or replace function public.expire_waitlist_offers() returns integer
language plpgsql security definer
set search_path = public
as $$
declare w record; n integer := 0;
begin
  for w in select * from waitlist where status = 'offered' and offer_expires_at < now() for update skip locked loop
    update waitlist set status = 'expired' where id = w.id;
    perform public.offer_next_waitlist(w.doctor_id, w.offered_starts_at);
    n := n + 1;
  end loop;
  -- Days that have passed close their waitlists.
  update waitlist set status = 'expired' where status = 'waiting' and preferred_date < (now() at time zone 'Asia/Manila')::date;
  return n;
end $$;
grant execute on function public.expire_waitlist_offers() to authenticated;

-- Open times must also skip a slot that is currently offered to someone.
create or replace function public.taken_slots(d uuid, day date) returns setof timestamptz
language sql stable security definer
set search_path = public
as $$
  select starts_at from appointments
   where doctor_id = d
     and starts_at >= day::timestamptz
     and starts_at < (day + 1)::timestamptz
     and status not in ('canceled','no_show')
  union
  select offered_starts_at from waitlist
   where doctor_id = d
     and status = 'offered' and offer_expires_at > now()
     and offered_starts_at >= day::timestamptz
     and offered_starts_at < (day + 1)::timestamptz
$$;

-- ===================================================================
-- 6. No-show credit
-- ===================================================================

alter table public.appointments add column if not exists credit_applied numeric(10,2) not null default 0;

create table if not exists public.patient_credits (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid references public.profiles(id),
  patient_record_id uuid references public.patients(id),
  doctor_id uuid not null references public.doctors(id),
  amount numeric(10,2) not null check (amount > 0),
  source_appointment_id uuid unique references public.appointments(id),
  expires_at timestamptz not null,
  used_appointment_id uuid references public.appointments(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists patient_credits_lookup_idx on public.patient_credits (patient_profile_id, doctor_id, expires_at);
alter table public.patient_credits enable row level security;

drop policy if exists "patient reads own credits" on public.patient_credits;
create policy "patient reads own credits" on public.patient_credits
  for select using (patient_profile_id = auth.uid());
drop policy if exists "staff reads practice credits" on public.patient_credits;
create policy "staff reads practice credits" on public.patient_credits
  for select using (public.get_user_role() = 'admin' or doctor_id in (select public.my_doctor_ids()));

-- A verified downpayment on a missed visit becomes credit with the same
-- doctor for 90 days.
create or replace function public.trg_noshow_credit() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare amt numeric; dname text;
begin
  if new.status = 'no_show' and old.status is distinct from 'no_show' and new.payment_status = 'verified' and new.patient_id is not null then
    select coalesce(sum(amount), 0) into amt from payment_proofs where appointment_id = new.id and status = 'verified';
    amt := amt + coalesce(new.credit_applied, 0);
    if amt > 0 then
      insert into patient_credits (patient_profile_id, patient_record_id, doctor_id, amount, source_appointment_id, expires_at)
      values (new.patient_id, new.patient_record_id, new.doctor_id, amt, new.id, now() + interval '90 days')
      on conflict (source_appointment_id) do nothing;
      select full_name into dname from profiles where id = new.doctor_id;
      perform public.notify_patient(new.patient_record_id,
        '4MED: You missed your visit with ' || coalesce(dname, 'your doctor') || '. Your ₱' || to_char(amt, 'FM999,990') ||
        ' downpayment is now credit for your next booking with them, valid for 90 days.', new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists noshow_credit on public.appointments;
create trigger noshow_credit after update of status on public.appointments
  for each row execute function public.trg_noshow_credit();

-- Use available credit on a booking that is waiting for payment.
create or replace function public.apply_credit(p_appointment_id uuid) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare a record; d record; c record; need numeric; used numeric := 0; take numeric;
begin
  select * into a from appointments where id = p_appointment_id for update;
  if not found or a.patient_id is distinct from auth.uid() then raise exception 'Appointment not found'; end if;
  if a.payment_status <> 'awaiting_payment' then return 0; end if;
  select * into d from doctors where id = a.doctor_id;
  need := coalesce(d.prepayment_amount, d.consult_fee, 0) - coalesce(a.credit_applied, 0);
  for c in select * from patient_credits
            where patient_profile_id = auth.uid() and doctor_id = a.doctor_id
              and used_at is null and expires_at > now()
            order by expires_at for update loop
    exit when need <= 0;
    take := least(c.amount, need);
    update patient_credits set used_appointment_id = a.id, used_at = now(), amount = take where id = c.id;
    if c.amount > take then
      insert into patient_credits (patient_profile_id, patient_record_id, doctor_id, amount, expires_at)
      values (c.patient_profile_id, c.patient_record_id, c.doctor_id, c.amount - take, c.expires_at);
    end if;
    need := need - take;
    used := used + take;
  end loop;
  if used > 0 then
    perform set_config('medipulse.appt_guard_bypass', 'on', true);
    update appointments
       set credit_applied = coalesce(credit_applied, 0) + used,
           payment_status = case when need <= 0 then 'verified' else payment_status end,
           status = case when need <= 0 and status = 'booked' then 'confirmed' else status end,
           payment_due_at = case when need <= 0 then null else payment_due_at end
     where id = a.id;
  end if;
  return used;
end $$;
grant execute on function public.apply_credit(uuid) to authenticated;

-- ===================================================================
-- 7. Subscription invoicing (manual payment)
-- ===================================================================

create table if not exists public.platform_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists "settings readable" on public.platform_settings;
create policy "settings readable" on public.platform_settings for select using (auth.uid() is not null);
drop policy if exists "admin edits settings" on public.platform_settings;
create policy "admin edits settings" on public.platform_settings for all
  using (public.get_user_role() = 'admin') with check (public.get_user_role() = 'admin');
insert into public.platform_settings (key, value) values
  ('billing_payment_instructions', 'Pay your 4MED subscription by GCash or bank transfer, then reply to the invoice email with your reference number.'),
  ('billing_grace_days', '7')
on conflict (key) do nothing;

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  doctor_id uuid not null references public.doctors(id),
  subscription_id uuid not null references public.subscriptions(id),
  plan_id text,
  billing_cycle text,
  amount numeric(10,2) not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','paid','void')),
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  unique (subscription_id, period_start)
);
alter table public.subscription_invoices enable row level security;
drop policy if exists "doctor reads own invoices" on public.subscription_invoices;
create policy "doctor reads own invoices" on public.subscription_invoices
  for select using (doctor_id = auth.uid() or public.get_user_role() = 'admin');
drop policy if exists "admin manages invoices" on public.subscription_invoices;
create policy "admin manages invoices" on public.subscription_invoices
  for update using (public.get_user_role() = 'admin');

create sequence if not exists public.subscription_invoice_seq;

-- One time only: trials that ended before invoicing existed get a fresh
-- start (3 days to the first invoice, then the grace period), instead of
-- being invoiced back to July and locked at once. The flag keeps a re-run
-- of this file from pushing later trials out too.
do $$
begin
  if not exists (select 1 from public.platform_settings where key = 'billing_started_at') then
    update public.subscriptions set trial_ends_at = now() + interval '3 days'
     where status = 'trialing' and current_period_end is null and trial_ends_at < now();
    insert into public.platform_settings (key, value) values ('billing_started_at', now()::text);
  end if;
end $$;

-- Issue the next invoice 3 days before a trial or paid period ends, and
-- mark a subscription past due once its invoice is late.
create or replace function public.run_subscription_billing() returns integer
language plpgsql security definer
set search_path = public
as $$
declare s record; start_at timestamptz; end_at timestamptz; amt numeric; inv_id uuid; inv_no text; inv_due timestamptz; n integer := 0; grace int; email text;
begin
  select coalesce(nullif(value, '')::int, 7) into grace from platform_settings where key = 'billing_grace_days';
  grace := coalesce(grace, 7);
  for s in select sub.*, p.monthly_price from subscriptions sub join plans p on p.id = sub.plan_id
            where sub.status in ('trialing','active','past_due')
              and coalesce(sub.current_period_end, sub.trial_ends_at) is not null
              and coalesce(sub.current_period_end, sub.trial_ends_at) <= now() + interval '3 days' loop
    start_at := coalesce(s.current_period_end, s.trial_ends_at);
    if s.billing_cycle = 'annual' then
      end_at := start_at + interval '1 year';
      amt := round(s.monthly_price * 12 * 0.8);
    else
      end_at := start_at + interval '1 month';
      amt := s.monthly_price;
    end if;
    inv_id := null;
    insert into subscription_invoices (invoice_no, doctor_id, subscription_id, plan_id, billing_cycle, amount, period_start, period_end, due_at)
    values ('4MED-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('subscription_invoice_seq')::text, 4, '0'),
            s.doctor_id, s.id, s.plan_id, s.billing_cycle, amt, start_at, end_at, start_at + make_interval(days => grace))
    on conflict (subscription_id, period_start) do nothing
    returning id, invoice_no, due_at into inv_id, inv_no, inv_due;
    if inv_id is not null then
      n := n + 1;
      select u.email into email from auth.users u where u.id = s.doctor_id;
      if email is not null then
        insert into notifications (channel, recipient, body) values ('email', email,
          '4MED invoice ' || inv_no || ': ₱' || to_char(amt, 'FM999,990') || ' for your ' || s.plan_id ||
          ' plan, due ' || to_char(inv_due at time zone 'Asia/Manila', 'Mon DD, YYYY') ||
          '. ' || coalesce((select value from platform_settings where key = 'billing_payment_instructions'), ''));
      end if;
    end if;
  end loop;
  update subscriptions sub set status = 'past_due'
   where sub.status in ('trialing','active')
     and exists (select 1 from subscription_invoices i where i.subscription_id = sub.id and i.status = 'open' and i.due_at < now());
  return n;
end $$;

create or replace function public.mark_subscription_invoice_paid(p_id uuid, p_reference text default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare inv record;
begin
  if public.get_user_role() <> 'admin' then raise exception 'Only 4MED admins can record subscription payments'; end if;
  update subscription_invoices set status = 'paid', paid_at = now(), payment_reference = nullif(btrim(p_reference), '')
   where id = p_id and status = 'open' returning * into inv;
  if not found then raise exception 'Invoice not found or already settled'; end if;
  update subscriptions set status = 'active', current_period_end = greatest(coalesce(current_period_end, inv.period_start), inv.period_end)
   where id = inv.subscription_id;
end $$;
grant execute on function public.mark_subscription_invoice_paid(uuid, text) to authenticated;

-- Billing state of every practice the caller works in (doctor or secretary).
create or replace function public.my_billing_status() returns table (doctor_id uuid, status text, open_invoice_no text, open_amount numeric, due_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select s.doctor_id, s.status::text, i.invoice_no, i.amount, i.due_at
    from subscriptions s
    left join lateral (select * from subscription_invoices x where x.subscription_id = s.id and x.status = 'open' order by x.due_at limit 1) i on true
   where s.doctor_id in (select public.my_doctor_ids())
$$;
grant execute on function public.my_billing_status() to authenticated;

-- ===================================================================
-- 8. Internal functions stay internal
--    Supabase grants EXECUTE on new functions to anon and authenticated
--    by default. These are called only by triggers, cron or other
--    functions; patient_contact in particular returns phone and email.
-- ===================================================================
revoke execute on function public.patient_contact(uuid) from public, anon, authenticated;
revoke execute on function public.notify_patient(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.offer_next_waitlist(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.run_subscription_billing() from public, anon, authenticated;
revoke execute on function public.try_uuid(text) from anon;
revoke all on sequence public.subscription_invoice_seq from anon, authenticated;
-- Signed-in only, never anonymous (PUBLIC holds the default grant, so revoke it too).
revoke execute on function public.add_dependent(text, text, date, text, text) from public, anon;
revoke execute on function public.remove_dependent(uuid) from public, anon;
revoke execute on function public.join_waitlist(uuid, date, uuid, text, uuid) from public, anon;
revoke execute on function public.leave_waitlist(uuid) from public, anon;
revoke execute on function public.claim_waitlist_offer(uuid) from public, anon;
revoke execute on function public.submit_review(uuid, integer, text) from public, anon;
revoke execute on function public.apply_credit(uuid) from public, anon;
revoke execute on function public.mark_subscription_invoice_paid(uuid, text) from public, anon;
revoke execute on function public.my_billing_status() from public, anon;

-- ===================================================================
-- 9. Schedules
-- ===================================================================
create extension if not exists pg_cron;

create or replace function public.run_4med_minutely() returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.expire_unpaid_holds();
  perform public.expire_waitlist_offers();
end $$;
revoke execute on function public.run_4med_minutely() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = '4med-expire-unpaid-holds') then
    perform cron.unschedule('4med-expire-unpaid-holds');
  end if;
  if exists (select 1 from cron.job where jobname = '4med-minutely') then
    perform cron.unschedule('4med-minutely');
  end if;
  if exists (select 1 from cron.job where jobname = '4med-subscription-billing') then
    perform cron.unschedule('4med-subscription-billing');
  end if;
  perform cron.schedule('4med-minutely', '* * * * *', 'select public.run_4med_minutely()');
  -- 01:00 UTC is 9:00 AM in Manila.
  perform cron.schedule('4med-subscription-billing', '0 1 * * *', 'select public.run_subscription_billing()');
end $$;

commit;
