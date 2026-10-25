-- medipulse-doctor-approval.sql — doctors wait for admin approval
--
-- A doctor who signs up can't use 4MED until a 4MED admin has checked
-- their PRC license: no staff access to patient data, no listing, no
-- bookings, no billing. Their 14-day trial starts on approval.
--
-- Also closes three holes the approval would otherwise not survive:
--   * any signed-in user could set their own profiles.role to 'admin';
--   * a doctor could set doctors.license_verified on their own row;
--   * a doctor could edit or delete their own subscription's status
--     and dates.
--
-- Run once in the Supabase SQL Editor; safe to run again.
--
-- The guard triggers below check current_user: direct API writes run as
-- 'authenticated' (or 'anon'), while the security-definer functions in
-- this file and the SQL Editor run as the owner, so trusted code passes.

begin;

-- ===================================================================
-- 1. Roles are set once, at signup, and never to admin
-- ===================================================================
create or replace function public.trg_guard_profile_role() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.get_user_role() = 'admin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role not in ('patient', 'doctor', 'secretary') then
      raise exception 'You can''t sign up with that role';
    end if;
  elsif new.role is distinct from old.role then
    raise exception 'Your account type can''t be changed';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role before insert or update on public.profiles
  for each row execute function public.trg_guard_profile_role();

-- ===================================================================
-- 2. Only 4MED decides whether a license is verified
-- ===================================================================
alter table public.doctors add column if not exists verified_at timestamptz;

-- A rejection and its reason. Kept off the doctors table, which is public.
create table if not exists public.doctor_license_reviews (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  reason text not null,
  rejected_at timestamptz not null default now(),
  rejected_by uuid references public.profiles(id)
);
alter table public.doctor_license_reviews enable row level security;
drop policy if exists "doctor reads own review" on public.doctor_license_reviews;
create policy "doctor reads own review" on public.doctor_license_reviews
  for select using (doctor_id = auth.uid() or public.get_user_role() = 'admin');

create or replace function public.trg_guard_doctor_verification() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.get_user_role() = 'admin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.license_verified := false;
    new.verified_at := null;
  elsif new.license_verified is distinct from old.license_verified
     or new.verified_at is distinct from old.verified_at then
    raise exception 'Only 4MED can verify a PRC license';
  elsif new.prc_license is distinct from old.prc_license then
    raise exception 'To change your PRC license number, contact 4MED';
  end if;
  return new;
end $$;
drop trigger if exists guard_doctor_verification on public.doctors;
create trigger guard_doctor_verification before insert or update on public.doctors
  for each row execute function public.trg_guard_doctor_verification();

-- Doctors keep choosing their plan and cycle; status and dates are 4MED's.
create or replace function public.trg_guard_subscription() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.get_user_role() = 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Contact 4MED to close your subscription';
  elsif tg_op = 'INSERT' then
    new.status := 'trialing';
    new.trial_ends_at := now() + interval '14 days';
    new.current_period_end := null;
  else
    new.status := old.status;
    new.trial_ends_at := old.trial_ends_at;
    new.current_period_end := old.current_period_end;
    new.doctor_id := old.doctor_id;
  end if;
  return new;
end $$;
drop trigger if exists guard_subscription on public.subscriptions;
create trigger guard_subscription before insert or update or delete on public.subscriptions
  for each row execute function public.trg_guard_subscription();

-- ===================================================================
-- 3. Staff powers need an approved practice
--    is_staff, is_clinician and my_doctor_ids gate nearly every RLS
--    policy on patient data, so this is where an unapproved doctor and
--    their secretaries lose access.
-- ===================================================================
create or replace function public.is_verified_doctor(d uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from doctors where id = d and license_verified)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer
set search_path = public
as $$
  select case get_user_role()
    when 'admin' then true
    when 'doctor' then is_verified_doctor(auth.uid())
    when 'secretary' then exists (
      select 1 from staff_assignments sa join doctors d on d.id = sa.doctor_id
       where sa.secretary_id = auth.uid() and d.license_verified)
    else false
  end
$$;

create or replace function public.is_clinician() returns boolean
language sql stable security definer
set search_path = public
as $$
  select get_user_role() = 'admin'
      or (get_user_role() = 'doctor' and is_verified_doctor(auth.uid()))
$$;

create or replace function public.my_doctor_ids() returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select auth.uid()
   where get_user_role() = 'admin'
      or (get_user_role() = 'doctor' and is_verified_doctor(auth.uid()))
  union
  select sa.doctor_id from staff_assignments sa join doctors d on d.id = sa.doctor_id
   where sa.secretary_id = auth.uid() and d.license_verified
$$;

-- ===================================================================
-- 4. Patients can only book approved doctors
-- ===================================================================
drop policy if exists "patient creates appointment" on public.appointments;
create policy "patient creates appointment" on public.appointments
  for insert with check (
    patient_id = auth.uid()
    and (patient_record_id is null or public.is_my_patient_record(patient_record_id))
    and public.is_verified_doctor(doctor_id)
  );

create or replace function public.join_waitlist(p_doctor_id uuid, p_date date, p_patient_record_id uuid, p_mode text default 'clinic', p_location_id uuid default null) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if not public.is_verified_doctor(p_doctor_id) then raise exception 'This doctor isn''t taking bookings on 4MED yet'; end if;
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

-- ===================================================================
-- 5. Approve, reject, resubmit
-- ===================================================================
create or replace function public.approve_doctor(p_doctor_id uuid) returns void
language plpgsql security definer
set search_path = public
as $$
declare email text;
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can approve doctors'; end if;
  update doctors set license_verified = true, verified_at = now() where id = p_doctor_id;
  if not found then raise exception 'Doctor not found'; end if;
  delete from doctor_license_reviews where doctor_id = p_doctor_id;
  -- The trial starts when they can actually use 4MED.
  update subscriptions s set trial_ends_at = now() + interval '14 days'
   where s.doctor_id = p_doctor_id and s.status = 'trialing' and s.current_period_end is null
     and not exists (select 1 from subscription_invoices i where i.subscription_id = s.id);
  select u.email into email from auth.users u where u.id = p_doctor_id;
  if email is not null then
    insert into notifications (channel, recipient, body) values ('email', email,
      '4MED: Your PRC license is verified. Your Clinic App is open, patients can now find and book you, and your 14-day trial starts today.');
  end if;
end $$;

create or replace function public.reject_doctor(p_doctor_id uuid, p_reason text) returns void
language plpgsql security definer
set search_path = public
as $$
declare email text;
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can review licenses'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Tell the doctor why, so they can fix it'; end if;
  update doctors set license_verified = false, verified_at = null where id = p_doctor_id;
  if not found then raise exception 'Doctor not found'; end if;
  insert into doctor_license_reviews (doctor_id, reason, rejected_at, rejected_by)
  values (p_doctor_id, btrim(p_reason), now(), auth.uid())
  on conflict (doctor_id) do update set reason = excluded.reason, rejected_at = excluded.rejected_at, rejected_by = excluded.rejected_by;
  select u.email into email from auth.users u where u.id = p_doctor_id;
  if email is not null then
    insert into notifications (channel, recipient, body) values ('email', email,
      '4MED: We couldn''t verify your PRC license yet. ' || btrim(p_reason) || ' Sign in to 4MED to correct it.');
  end if;
end $$;

-- A doctor whose license was not approved corrects the number and asks again.
create or replace function public.resubmit_license(p_prc_license text) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.get_user_role() is distinct from 'doctor' then raise exception 'Only doctors can do this'; end if;
  if coalesce(btrim(p_prc_license), '') = '' then raise exception 'Enter your PRC license number'; end if;
  update doctors set prc_license = btrim(p_prc_license)
   where id = auth.uid() and not license_verified;
  if not found then raise exception 'Your license is already verified'; end if;
  delete from doctor_license_reviews where doctor_id = auth.uid();
end $$;

-- Every practitioner with what an admin needs to check them.
create or replace function public.admin_doctor_applications()
returns table (id uuid, full_name text, email text, phone text, profession_type text, specialties text[],
               prc_license text, signed_up timestamptz, license_verified boolean, verified_at timestamptz,
               rejected_at timestamptz, rejection_reason text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can see applications'; end if;
  return query
    select d.id, p.full_name, u.email::text, p.phone, d.profession_type, d.specialties,
           d.prc_license, d.created_at, d.license_verified, d.verified_at, r.rejected_at, r.reason
      from doctors d
      join profiles p on p.id = d.id
      left join auth.users u on u.id = d.id
      left join doctor_license_reviews r on r.doctor_id = d.id
     where p.role = 'doctor'
     order by d.license_verified, d.created_at;
end $$;

-- ===================================================================
-- 6. Billing only for approved practices
--    (replaces the version in medipulse-release-2026-10.sql)
-- ===================================================================
create or replace function public.run_subscription_billing() returns integer
language plpgsql security definer
set search_path = public
as $$
declare s record; start_at timestamptz; end_at timestamptz; amt numeric; inv_id uuid; inv_no text; inv_due timestamptz; n integer := 0; grace int; email text;
begin
  select coalesce(nullif(value, '')::int, 7) into grace from platform_settings where key = 'billing_grace_days';
  grace := coalesce(grace, 7);
  for s in select sub.*, p.monthly_price from subscriptions sub
             join plans p on p.id = sub.plan_id
             join doctors d on d.id = sub.doctor_id and d.license_verified
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

-- ===================================================================
-- 7. Grants
-- ===================================================================
revoke execute on function public.run_subscription_billing() from public, anon, authenticated;
revoke execute on function public.approve_doctor(uuid) from public, anon;
revoke execute on function public.reject_doctor(uuid, text) from public, anon;
revoke execute on function public.resubmit_license(text) from public, anon;
revoke execute on function public.admin_doctor_applications() from public, anon;
grant execute on function public.approve_doctor(uuid) to authenticated;
grant execute on function public.reject_doctor(uuid, text) to authenticated;
grant execute on function public.resubmit_license(text) to authenticated;
grant execute on function public.admin_doctor_applications() to authenticated;
-- Booking checks call this as the patient (and the public profile page).
grant execute on function public.is_verified_doctor(uuid) to anon, authenticated;

commit;
