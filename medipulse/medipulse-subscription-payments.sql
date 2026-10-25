-- medipulse-subscription-payments.sql — doctors send proof, 4MED confirms
--
-- As in 4POS: a doctor pays an open 4MED invoice (GCash, bank, …), then
-- sends the reference number and a screenshot or PDF. The invoice stays
-- open until a 4MED admin checks the proof and approves it (which records
-- the payment, exactly like "Mark paid") or turns it down with a reason
-- the doctor sees, so they can send it again.
--
-- Also tightens the patients' payment-proofs bucket: clinic staff could
-- open (and delete) every clinic's payment screenshots; now only the
-- clinic the appointment belongs to can.
--
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

-- ===================================================================
-- 1. Proofs
-- ===================================================================
create table if not exists public.subscription_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('gcash', 'maya', 'bank', 'card', 'cash', 'other')),
  reference_no text,
  note text,
  storage_path text not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists subscription_payment_proofs_invoice_idx on public.subscription_payment_proofs (invoice_id, created_at desc);
-- One proof waiting per invoice at a time.
create unique index if not exists subscription_payment_proofs_one_pending on public.subscription_payment_proofs (invoice_id) where status = 'submitted';

alter table public.subscription_payment_proofs enable row level security;
drop policy if exists "doctor and admin read proofs" on public.subscription_payment_proofs;
create policy "doctor and admin read proofs" on public.subscription_payment_proofs for select
  using (doctor_id = auth.uid() or public.get_user_role() = 'admin');
-- No insert/update policies: the functions below write this table.

-- Files: <doctor id>/<invoice id>/<file>, private.
insert into storage.buckets (id, name, public) values ('subscription-proofs', 'subscription-proofs', false)
on conflict (id) do nothing;
drop policy if exists "sp doctor upload" on storage.objects;
create policy "sp doctor upload" on storage.objects for insert
  with check (bucket_id = 'subscription-proofs' and (storage.foldername(name))[1] = auth.uid()::text
              and public.get_user_role() = 'doctor');
drop policy if exists "sp read own or admin" on storage.objects;
create policy "sp read own or admin" on storage.objects for select
  using (bucket_id = 'subscription-proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.get_user_role() = 'admin'));

-- ===================================================================
-- 2. Send, approve, reject
-- ===================================================================
create or replace function public.submit_subscription_payment(
  p_invoice_id uuid, p_amount numeric, p_method text, p_reference_no text, p_storage_path text, p_note text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare inv record; new_id uuid; dname text; r record;
begin
  select * into inv from subscription_invoices where id = p_invoice_id for update;
  if not found or inv.doctor_id is distinct from auth.uid() then raise exception 'Invoice not found'; end if;
  if inv.status <> 'open' then raise exception 'This invoice is already settled'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount you paid'; end if;
  if p_method not in ('gcash', 'maya', 'bank', 'card', 'cash', 'other') then raise exception 'Choose how you paid'; end if;
  if coalesce(btrim(p_reference_no), '') = '' and p_method <> 'cash' then raise exception 'Enter the reference number from your receipt'; end if;
  -- The file must be one this doctor uploaded for this invoice.
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text or split_part(p_storage_path, '/', 2) <> p_invoice_id::text then
    raise exception 'Upload the proof again';
  end if;
  if exists (select 1 from subscription_payment_proofs where invoice_id = p_invoice_id and status = 'submitted') then
    raise exception 'Your payment for this invoice is already being checked';
  end if;

  insert into subscription_payment_proofs (invoice_id, doctor_id, amount, method, reference_no, note, storage_path)
  values (p_invoice_id, auth.uid(), round(p_amount, 2), p_method, nullif(btrim(p_reference_no), ''), nullif(btrim(p_note), ''), p_storage_path)
  returning id into new_id;

  -- Tell 4MED's admins there's a payment to check.
  select full_name into dname from profiles where id = auth.uid();
  for r in select u.email from profiles p join auth.users u on u.id = p.id where p.role = 'admin' and u.email is not null loop
    insert into notifications (channel, recipient, body) values ('email', r.email,
      '4MED: ' || coalesce(dname, 'A doctor') || ' sent proof of payment for invoice ' || inv.invoice_no ||
      ' (₱' || to_char(p_amount, 'FM999,990.00') || '). Check it in Admin → Billing.');
  end loop;
  return new_id;
end $$;

create or replace function public.approve_subscription_payment(p_proof_id uuid) returns void
language plpgsql security definer
set search_path = public
as $$
declare pr record;
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can confirm payments'; end if;
  update subscription_payment_proofs set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proof_id and status = 'submitted' returning * into pr;
  if not found then raise exception 'This proof was already checked'; end if;
  -- Records the payment like "Mark paid": invoice paid, subscription active,
  -- referral credit used or earned.
  perform public.settle_subscription_invoice(pr.invoice_id,
    upper(pr.method) || coalesce(' ' || pr.reference_no, ''));
end $$;

create or replace function public.reject_subscription_payment(p_proof_id uuid, p_reason text) returns void
language plpgsql security definer
set search_path = public
as $$
declare pr record; inv_no text; v_email text;
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can check payments'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Tell the doctor what''s wrong, so they can fix it'; end if;
  update subscription_payment_proofs set status = 'rejected', review_note = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proof_id and status = 'submitted' returning * into pr;
  if not found then raise exception 'This proof was already checked'; end if;
  select invoice_no into inv_no from subscription_invoices where id = pr.invoice_id;
  select u.email into v_email from auth.users u where u.id = pr.doctor_id;
  if v_email is not null then
    insert into notifications (channel, recipient, body) values ('email', v_email,
      '4MED: We couldn''t confirm your payment for invoice ' || coalesce(inv_no, '') || '. ' || btrim(p_reason) ||
      ' Open Practice → Subscription in 4MED to send it again.');
  end if;
end $$;

-- An admin recording a payment by hand closes any proof still waiting on it.
create or replace function public.mark_subscription_invoice_paid(p_id uuid, p_reference text default null) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Only 4MED admins can record subscription payments'; end if;
  perform public.settle_subscription_invoice(p_id, p_reference);
  update subscription_payment_proofs set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where invoice_id = p_id and status = 'submitted';
end $$;

-- ===================================================================
-- 3. Patients' payment proofs: only the appointment's clinic
-- ===================================================================
drop policy if exists "pp read own or staff" on storage.objects;
create policy "pp read own or staff" on storage.objects for select
  using (bucket_id = 'payment-proofs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.get_user_role() = 'admin'
    or exists (select 1 from public.payment_proofs pp join public.appointments a on a.id = pp.appointment_id
                where pp.storage_path = storage.objects.name and a.doctor_id in (select public.my_doctor_ids()))));
drop policy if exists "pp staff delete" on storage.objects;
create policy "pp staff delete" on storage.objects for delete
  using (bucket_id = 'payment-proofs' and (
    public.get_user_role() = 'admin'
    or exists (select 1 from public.payment_proofs pp join public.appointments a on a.id = pp.appointment_id
                where pp.storage_path = storage.objects.name and a.doctor_id in (select public.my_doctor_ids()))));

-- ===================================================================
-- 4. Grants
-- ===================================================================
revoke execute on function public.submit_subscription_payment(uuid, numeric, text, text, text, text) from public, anon;
revoke execute on function public.approve_subscription_payment(uuid) from public, anon;
revoke execute on function public.reject_subscription_payment(uuid, text) from public, anon;
grant execute on function public.submit_subscription_payment(uuid, numeric, text, text, text, text) to authenticated;
grant execute on function public.approve_subscription_payment(uuid) to authenticated;
grant execute on function public.reject_subscription_payment(uuid, text) to authenticated;

commit;
