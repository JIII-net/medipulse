-- medipulse-referrals.sql — referral codes, as in 4POS
--
-- Two kinds of code, one per sign-up, never both:
--   * 4PP…  a 4Keys Partner Portal partner. The new practice gets a welcome
--           discount on its first invoice, and its first paid invoice is
--           reported to 4PP once (partner-portal edge function) so the
--           partner earns their fee there.
--   * 4MED… another doctor's own code (4MED + their initials). The new
--           practice gets a welcome discount on its first invoice; when it
--           pays that invoice, the referring doctor earns credit (a share of
--           the price before the discount, capped). Credit comes off the
--           doctor's next 4MED invoices. It is never cash and never expires.
--
-- An admin sets the rates in platform_settings (Admin → Referrals).
-- Money rules live here: doctors can't edit codes or credit, credit is
-- reserved when an invoice is issued and taken when it is paid, and the
-- referrer is rewarded only when an admin records the payment.
--
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

-- ===================================================================
-- 1. Settings
-- ===================================================================
insert into public.platform_settings (key, value) values
  ('referral_enabled', 'true'),
  ('referral_partner_discount', '0.10'),
  ('referral_doctor_discount', '0.10'),
  ('referral_reward_rate', '0.10'),
  ('referral_reward_cap', '3000')
on conflict (key) do nothing;

-- The sign-up form shows the discount before anyone is signed in.
drop policy if exists "referral settings are public" on public.platform_settings;
create policy "referral settings are public" on public.platform_settings
  for select using (key like 'referral\_%');

create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare v text;
begin
  select value into v from platform_settings where key = p_key;
  return coalesce(nullif(btrim(v), '')::numeric, p_default);
exception when others then
  return p_default;
end $$;

create or replace function public.referrals_enabled() returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select lower(value) from platform_settings where key = 'referral_enabled'), 'true') <> 'false'
$$;

-- ===================================================================
-- 2. Every doctor has a code: 4MED + initials, unique
-- ===================================================================
alter table public.doctors add column if not exists referral_code text;
create unique index if not exists doctors_referral_code_key on public.doctors (referral_code) where referral_code is not null;

create or replace function public.ensure_doctor_referral_code(p_doctor uuid) returns text
language plpgsql security definer
set search_path = public
as $$
declare v_code text; v_name text; v_init text; v_candidate text; n int := 1;
begin
  select referral_code into v_code from doctors where id = p_doctor;
  if v_code is not null then return v_code; end if;
  select full_name into v_name from profiles where id = p_doctor;
  -- "Dr. Maria Santos" and "Dra.Maria Santos" are MS, not DMS
  v_name := regexp_replace(coalesce(v_name, ''), '^\s*(dra|dr|doc|doctor)(\.\s*|\s+)', '', 'i');
  select coalesce(string_agg(upper(left(w, 1)), '' order by ord), '') into v_init
    from regexp_split_to_table(regexp_replace(v_name, '[^A-Za-z ]', '', 'g'), '\s+') with ordinality as t(w, ord)
   where w <> '';
  v_init := left(case when v_init = '' then 'X' else v_init end, 5);
  v_candidate := '4MED' || v_init;
  loop
    exit when not exists (select 1 from doctors where referral_code = v_candidate);
    n := n + 1;
    v_candidate := '4MED' || v_init || n;
  end loop;
  update doctors set referral_code = v_candidate where id = p_doctor and referral_code is null;
  select referral_code into v_code from doctors where id = p_doctor;
  return v_code;
end $$;

create or replace function public.trg_doctor_referral_code() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.ensure_doctor_referral_code(new.id);
  return null;
end $$;
drop trigger if exists zzz_doctor_referral_code on public.doctors;
create trigger zzz_doctor_referral_code after insert on public.doctors
  for each row execute function public.trg_doctor_referral_code();

do $$
declare r record;
begin
  for r in select id from public.doctors where referral_code is null order by created_at, id loop
    perform public.ensure_doctor_referral_code(r.id);
  end loop;
end $$;

-- The approval guard (medipulse-doctor-approval.sql) also keeps the code 4MED's.
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
    new.referral_code := null;
  elsif new.license_verified is distinct from old.license_verified
     or new.verified_at is distinct from old.verified_at then
    raise exception 'Only 4MED can verify a PRC license';
  elsif new.prc_license is distinct from old.prc_license then
    raise exception 'To change your PRC license number, contact 4MED';
  elsif new.referral_code is distinct from old.referral_code then
    raise exception 'Referral codes are set by 4MED';
  end if;
  return new;
end $$;

-- ===================================================================
-- 3. Referrals and the credit ledger
-- ===================================================================
create table if not exists public.doctor_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_doctor_id uuid not null references public.doctors(id) on delete cascade,
  referred_doctor_id uuid not null unique references public.doctors(id) on delete cascade,
  referred_name text not null,           -- shown to the referrer
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'voided')),
  reward_amount numeric(12,2),
  invoice_id uuid references public.subscription_invoices(id) on delete set null,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists doctor_referrals_referrer_idx on public.doctor_referrals (referrer_doctor_id, created_at desc);

create table if not exists public.partner_referrals (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  code text not null check (code ~ '^4PP[A-Z0-9]+$'),
  status text not null default 'pending' check (status in ('pending', 'recorded', 'rejected', 'failed')),
  invoice_id uuid references public.subscription_invoices(id) on delete set null,
  amount numeric(10,2),
  fee numeric(10,2),
  detail text,
  attempted_at timestamptz,
  recorded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Credit balance = the sum of a doctor's ledger rows.
create table if not exists public.referral_credit_ledger (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  amount numeric(12,2) not null,         -- + earned, − used
  kind text not null check (kind in ('earned', 'used', 'adjusted')),
  referral_id uuid references public.doctor_referrals(id) on delete set null,
  invoice_id uuid references public.subscription_invoices(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists referral_credit_ledger_doctor_idx on public.referral_credit_ledger (doctor_id, created_at desc);

alter table public.doctor_referrals enable row level security;
alter table public.partner_referrals enable row level security;
alter table public.referral_credit_ledger enable row level security;

drop policy if exists "referral parties read" on public.doctor_referrals;
create policy "referral parties read" on public.doctor_referrals for select
  using (referrer_doctor_id = auth.uid() or referred_doctor_id = auth.uid() or public.get_user_role() = 'admin');
drop policy if exists "partner referral read" on public.partner_referrals;
create policy "partner referral read" on public.partner_referrals for select
  using (doctor_id = auth.uid() or public.get_user_role() = 'admin');
drop policy if exists "admin removes partner referral" on public.partner_referrals;
create policy "admin removes partner referral" on public.partner_referrals for delete
  using (public.get_user_role() = 'admin' and status <> 'recorded');
drop policy if exists "credit owner reads" on public.referral_credit_ledger;
create policy "credit owner reads" on public.referral_credit_ledger for select
  using (doctor_id = auth.uid() or public.get_user_role() = 'admin');
-- No insert/update policies: only the functions below (and the partner-portal
-- edge function, with the service role) write these tables.

create or replace function public.referral_credit_balance(p_doctor uuid) returns numeric
language sql stable security definer
set search_path = public
as $$
  select greatest(coalesce(sum(amount), 0), 0) from referral_credit_ledger where doctor_id = p_doctor
$$;

-- ===================================================================
-- 4. A new practice enters a code once, before its first invoice
-- ===================================================================
create or replace function public.check_doctor_referral_code(p_code text) returns text
language sql stable security definer
set search_path = public
as $$
  select p.full_name from doctors d join profiles p on p.id = d.id
   where d.referral_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'))
$$;

create or replace function public.claim_referral_code(p_code text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')); v_ref uuid; v_name text; v_mine text;
begin
  if public.get_user_role() is distinct from 'doctor' or not exists (select 1 from doctors where id = auth.uid()) then
    raise exception 'Only a practice can use a referral code';
  end if;
  if exists (select 1 from subscription_invoices where doctor_id = auth.uid() and status <> 'void') then
    raise exception 'A referral code can only be added before your first invoice';
  end if;
  if exists (select 1 from doctor_referrals where referred_doctor_id = auth.uid())
     or exists (select 1 from partner_referrals where doctor_id = auth.uid()) then
    raise exception 'Your account already has a referral code';
  end if;
  if v_code ~ '^4PP[A-Z0-9]+$' then
    insert into partner_referrals (doctor_id, code) values (auth.uid(), v_code);
    return jsonb_build_object('kind', 'partner', 'code', v_code);
  elsif v_code ~ '^4MED[A-Z0-9]+$' then
    select id into v_ref from doctors where referral_code = v_code;
    if v_ref is null then raise exception 'That referral code doesn''t exist'; end if;
    if v_ref = auth.uid() then raise exception 'You can''t use your own referral code'; end if;
    select full_name into v_mine from profiles where id = auth.uid();
    insert into doctor_referrals (referrer_doctor_id, referred_doctor_id, referred_name, code)
    values (v_ref, auth.uid(), coalesce(v_mine, 'New practice'), v_code);
    select full_name into v_name from profiles where id = v_ref;
    return jsonb_build_object('kind', 'doctor', 'code', v_code, 'name', v_name);
  end if;
  raise exception 'Enter a 4MED or 4PP referral code';
end $$;

-- ===================================================================
-- 5. Invoices: welcome discount and credit
-- ===================================================================
alter table public.subscription_invoices add column if not exists gross numeric(10,2);
alter table public.subscription_invoices add column if not exists discount numeric(10,2) not null default 0;
alter table public.subscription_invoices add column if not exists credit_used numeric(10,2) not null default 0;
update public.subscription_invoices set gross = amount where gross is null;

-- Records a payment: the internal half of mark_subscription_invoice_paid,
-- also used when credit covers a whole invoice.
create or replace function public.settle_subscription_invoice(p_id uuid, p_reference text) returns void
language plpgsql security definer
set search_path = public
as $$
declare inv record; ref record; v_reward numeric; v_name text; v_email text;
begin
  update subscription_invoices set status = 'paid', paid_at = now(), payment_reference = nullif(btrim(p_reference), '')
   where id = p_id and status = 'open' returning * into inv;
  if not found then raise exception 'Invoice not found or already settled'; end if;
  update subscriptions set status = 'active', current_period_end = greatest(coalesce(current_period_end, inv.period_start), inv.period_end)
   where id = inv.subscription_id;

  -- a) Credit this invoice used comes off the doctor's balance
  if coalesce(inv.credit_used, 0) > 0 then
    insert into referral_credit_ledger (doctor_id, amount, kind, invoice_id, note)
    values (inv.doctor_id, -inv.credit_used, 'used', inv.id, 'Used on invoice ' || inv.invoice_no);
  end if;

  -- b) First paid invoice of a referred practice: reward the referrer
  select * into ref from doctor_referrals where referred_doctor_id = inv.doctor_id and status = 'pending' for update;
  if not found or coalesce(inv.gross, inv.amount, 0) <= 0 then return; end if;
  if exists (select 1 from subscription_invoices x where x.doctor_id = inv.doctor_id and x.status = 'paid' and x.id <> inv.id and coalesce(x.gross, x.amount, 0) > 0) then
    return;
  end if;
  v_reward := 0;
  if public.referrals_enabled() then
    v_reward := round(coalesce(inv.gross, inv.amount) * public.setting_num('referral_reward_rate', 0.10), 2);
    if public.setting_num('referral_reward_cap', 3000) > 0 then
      v_reward := least(v_reward, public.setting_num('referral_reward_cap', 3000));
    end if;
    v_reward := greatest(v_reward, 0);
  end if;
  update doctor_referrals set status = 'rewarded', reward_amount = v_reward, invoice_id = inv.id, rewarded_at = now() where id = ref.id;
  if v_reward > 0 then
    select full_name into v_name from profiles where id = inv.doctor_id;
    insert into referral_credit_ledger (doctor_id, amount, kind, referral_id, invoice_id, note)
    values (ref.referrer_doctor_id, v_reward, 'earned', ref.id, inv.id, coalesce(v_name, 'A practice you referred') || ' paid for their first plan');
    select u.email into v_email from auth.users u where u.id = ref.referrer_doctor_id;
    if v_email is not null then
      insert into notifications (channel, recipient, body) values ('email', v_email,
        '4MED: ' || coalesce(v_name, 'A practice you referred') || ' paid for their first plan. ₱' || to_char(v_reward, 'FM999,990.00') ||
        ' referral credit was added to your account and comes off your next 4MED invoice.');
    end if;
  end if;
end $$;

create or replace function public.mark_subscription_invoice_paid(p_id uuid, p_reference text default null) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can record subscription payments'; end if;
  perform public.settle_subscription_invoice(p_id, p_reference);
end $$;

-- Billing run: the welcome discount on a practice's first invoice, and
-- credit reserved on each invoice (taken only when it's paid).
create or replace function public.run_subscription_billing() returns integer
language plpgsql security definer
set search_path = public
as $$
declare s record; start_at timestamptz; end_at timestamptz; gross numeric; disc numeric; credit numeric; due numeric;
        inv_id uuid; inv_no text; inv_due timestamptz; n integer := 0; grace int; email text; extra text;
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
    -- Already issued for this period: nothing to do (and no credit to reserve).
    continue when exists (select 1 from subscription_invoices x where x.subscription_id = s.id and x.period_start = start_at);
    if s.billing_cycle = 'annual' then
      end_at := start_at + interval '1 year';
      gross := round(s.monthly_price * 12 * 0.8);
    else
      end_at := start_at + interval '1 month';
      gross := s.monthly_price;
    end if;

    disc := 0;
    if public.referrals_enabled() and not exists (select 1 from subscription_invoices x where x.doctor_id = s.doctor_id and x.status <> 'void') then
      if exists (select 1 from partner_referrals where doctor_id = s.doctor_id and status <> 'rejected') then
        disc := round(gross * public.setting_num('referral_partner_discount', 0.10), 2);
      elsif exists (select 1 from doctor_referrals where referred_doctor_id = s.doctor_id and status <> 'voided') then
        disc := round(gross * public.setting_num('referral_doctor_discount', 0.10), 2);
      end if;
    end if;
    disc := least(greatest(disc, 0), gross);

    -- Credit not already promised to another open invoice
    perform 1 from doctors where id = s.doctor_id for update;
    credit := greatest(public.referral_credit_balance(s.doctor_id)
                       - coalesce((select sum(credit_used) from subscription_invoices where doctor_id = s.doctor_id and status = 'open'), 0), 0);
    credit := least(credit, gross - disc);
    due := gross - disc - credit;

    inv_id := null;
    insert into subscription_invoices (invoice_no, doctor_id, subscription_id, plan_id, billing_cycle, gross, discount, credit_used, amount, period_start, period_end, due_at)
    values ('4MED-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('subscription_invoice_seq')::text, 4, '0'),
            s.doctor_id, s.id, s.plan_id, s.billing_cycle, gross, disc, credit, due, start_at, end_at, start_at + make_interval(days => grace))
    on conflict (subscription_id, period_start) do nothing
    returning id, invoice_no, due_at into inv_id, inv_no, inv_due;
    if inv_id is null then continue; end if;
    n := n + 1;

    if due <= 0 then
      -- Credit covers it: settled now, nothing to pay.
      perform public.settle_subscription_invoice(inv_id, 'Referral credit');
    end if;

    select u.email into email from auth.users u where u.id = s.doctor_id;
    if email is not null then
      extra := case when disc > 0 then ' (₱' || to_char(disc, 'FM999,990.00') || ' welcome discount)' else '' end
            || case when credit > 0 then ' (₱' || to_char(credit, 'FM999,990.00') || ' referral credit)' else '' end;
      insert into notifications (channel, recipient, body) values ('email', email,
        case when due <= 0
          then '4MED invoice ' || inv_no || ' for your ' || s.plan_id || ' plan is fully covered by your referral credit. Nothing to pay.'
          else '4MED invoice ' || inv_no || ': ₱' || to_char(due, 'FM999,990.00') || extra || ' for your ' || s.plan_id ||
               ' plan, due ' || to_char(inv_due at time zone 'Asia/Manila', 'Mon DD, YYYY') ||
               '. ' || coalesce((select value from platform_settings where key = 'billing_payment_instructions'), '')
        end);
    end if;
  end loop;
  update subscriptions sub set status = 'past_due'
   where sub.status in ('trialing','active')
     and exists (select 1 from subscription_invoices i where i.subscription_id = sub.id and i.status = 'open' and i.due_at < now());
  return n;
end $$;

-- ===================================================================
-- 6. Grants
-- ===================================================================
revoke execute on function public.setting_num(text, numeric) from public, anon;
revoke execute on function public.referrals_enabled() from public, anon;
revoke execute on function public.ensure_doctor_referral_code(uuid) from public, anon, authenticated;
revoke execute on function public.trg_doctor_referral_code() from public, anon, authenticated;
revoke execute on function public.referral_credit_balance(uuid) from public, anon, authenticated;
revoke execute on function public.settle_subscription_invoice(uuid, text) from public, anon, authenticated;
revoke execute on function public.run_subscription_billing() from public, anon, authenticated;
revoke execute on function public.claim_referral_code(text) from public, anon;
revoke execute on function public.mark_subscription_invoice_paid(uuid, text) from public, anon;
grant execute on function public.claim_referral_code(text) to authenticated;
grant execute on function public.mark_subscription_invoice_paid(uuid, text) to authenticated;
-- The sign-up form checks a doctor's code before the account exists.
grant execute on function public.check_doctor_referral_code(text) to anon, authenticated;

commit;
