-- medipulse-email-confirmation.sql — accounts are built by the database
--
-- With "Confirm email" on, sign-up returns no session until the person
-- clicks the link in their email, so the browser can no longer create the
-- profile, practitioner record and subscription itself. A trigger on
-- auth.users now builds the whole account from the sign-up details in one
-- step, whether confirmation is on or off:
--   profile (role patient | doctor | secretary — never admin)
--   doctor  → practitioner record + 14-day trial subscription, plus the
--             4MED admin invite and the referral code, if given
--   secretary → joins the practice of their invite code, if given
-- A duplicate PRC license now cancels the sign-up instead of leaving a
-- half-made account.
--
-- Run once; safe to run again. Deploy the matching app version with it.

begin;

-- ===================================================================
-- 1. Invites and referral codes for a given new user
--    (the signed-in RPCs keep working and call these with auth.uid())
-- ===================================================================
create or replace function public.redeem_invite_for(p_user uuid, p_code text) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare inv record;
begin
  select * into inv from practice_invites
   where code = upper(btrim(p_code)) and used_by is null and expires_at > now()
   for update;
  if not found then raise exception 'Invalid or expired invite code'; end if;
  update practice_invites set used_by = p_user, used_at = now() where id = inv.id;
  insert into staff_assignments (secretary_id, doctor_id) values (p_user, inv.doctor_id) on conflict do nothing;
  return inv.doctor_id;
end $$;

create or replace function public.redeem_invite(invite_code text) returns uuid
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return public.redeem_invite_for(auth.uid(), invite_code);
end $$;

create or replace function public.redeem_admin_invite_for(p_user uuid, p_code text) returns void
language sql security definer
set search_path = public
as $$
  update admin_invites set used_by = p_user, used_at = now()
   where code = upper(btrim(p_code)) and used_by is null and expires_at > now()
$$;

create or replace function public.redeem_admin_invite(p_code text) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform public.redeem_admin_invite_for(auth.uid(), p_code);
end $$;

create or replace function public.claim_referral_code_for(p_user uuid, p_code text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')); v_ref uuid; v_name text; v_mine text;
begin
  if (select role from profiles where id = p_user) is distinct from 'doctor' or not exists (select 1 from doctors where id = p_user) then
    raise exception 'Only a practice can use a referral code';
  end if;
  if exists (select 1 from subscription_invoices where doctor_id = p_user and status <> 'void') then
    raise exception 'A referral code can only be added before your first invoice';
  end if;
  if exists (select 1 from doctor_referrals where referred_doctor_id = p_user)
     or exists (select 1 from partner_referrals where doctor_id = p_user) then
    raise exception 'Your account already has a referral code';
  end if;
  if v_code ~ '^4PP[A-Z0-9]+$' then
    insert into partner_referrals (doctor_id, code) values (p_user, v_code);
    return jsonb_build_object('kind', 'partner', 'code', v_code);
  elsif v_code ~ '^4MED[A-Z0-9]+$' then
    select id into v_ref from doctors where referral_code = v_code;
    if v_ref is null then raise exception 'That referral code doesn''t exist'; end if;
    if v_ref = p_user then raise exception 'You can''t use your own referral code'; end if;
    select full_name into v_mine from profiles where id = p_user;
    insert into doctor_referrals (referrer_doctor_id, referred_doctor_id, referred_name, code)
    values (v_ref, p_user, coalesce(v_mine, 'New practice'), v_code);
    select full_name into v_name from profiles where id = v_ref;
    return jsonb_build_object('kind', 'doctor', 'code', v_code, 'name', v_name);
  end if;
  raise exception 'Enter a 4MED or 4PP referral code';
end $$;

create or replace function public.claim_referral_code(p_code text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return public.claim_referral_code_for(auth.uid(), p_code);
end $$;

-- The secretary sign-up form checks the code before creating the account.
create or replace function public.check_practice_invite(p_code text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from practice_invites where code = upper(btrim(p_code)) and used_by is null and expires_at > now())
$$;

-- ===================================================================
-- 2. Build the account when the login is created
-- ===================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
  v_role text := lower(coalesce(m->>'role', 'patient'));
  v_name text := nullif(btrim(m->>'full_name'), '');
  v_specs text[];
  v_plan text;
begin
  -- The role comes from the sign-up form, so it's never trusted to be admin.
  if v_role not in ('patient', 'doctor', 'secretary') then v_role := 'patient'; end if;
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(v_name, split_part(coalesce(new.email, 'New user'), '@', 1)), v_role::user_role)
  on conflict (id) do nothing;

  if v_role = 'doctor' and jsonb_typeof(m->'doctor') = 'object' then
    d := m->'doctor';
    v_specs := array(select jsonb_array_elements_text(case when jsonb_typeof(d->'specialties') = 'array' then d->'specialties' else '[]'::jsonb end));
    insert into doctors (id, specialty, specialties, profession_type, prc_license, consult_fee, telehealth_enabled)
    values (new.id, coalesce(v_specs[1], nullif(d->>'specialty', '')), v_specs,
            coalesce(nullif(d->>'profession_type', ''), 'doctor'), nullif(btrim(d->>'prc_license'), ''),
            0, coalesce((d->>'telehealth')::boolean, true));
    select id into v_plan from plans where id = d->>'plan_id';
    insert into subscriptions (doctor_id, plan_id, billing_cycle, status)
    values (new.id, coalesce(v_plan, (select id from plans order by monthly_price limit 1)),
            case when d->>'billing_cycle' = 'annual' then 'annual' else 'monthly' end, 'trialing');
    -- Codes are checked on the form first; a stale one never blocks the sign-up.
    if nullif(btrim(m->>'admin_invite_code'), '') is not null then
      begin perform public.redeem_admin_invite_for(new.id, m->>'admin_invite_code'); exception when others then null; end;
    end if;
    if nullif(btrim(m->>'referral_code'), '') is not null then
      begin perform public.claim_referral_code_for(new.id, m->>'referral_code'); exception when others then null; end;
    end if;
  elsif v_role = 'secretary' and nullif(btrim(m->>'practice_invite_code'), '') is not null then
    begin perform public.redeem_invite_for(new.id, m->>'practice_invite_code'); exception when others then null; end;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================================
-- 3. Grants
-- ===================================================================
revoke execute on function public.redeem_invite_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_admin_invite_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_referral_code_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.redeem_admin_invite(text) from public, anon;
revoke execute on function public.claim_referral_code(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.redeem_admin_invite(text) to authenticated;
grant execute on function public.claim_referral_code(text) to authenticated;
grant execute on function public.check_practice_invite(text) to anon, authenticated;

commit;
