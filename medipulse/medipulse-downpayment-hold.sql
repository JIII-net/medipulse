-- medipulse-downpayment-hold.sql — short payment holds that release themselves
-- Run in the Supabase SQL Editor after medipulse-prepayment.sql.
-- Safe to run more than once.
--
-- medipulse-prepayment.sql added "pay before you book", but nothing ever
-- called expire_unpaid_holds(), so a slot nobody paid for stayed blocked.
-- With holds as short as 15–30 minutes that matters. This file:
--   1. adds an 'expired' payment state so the patient sees why the
--      booking was dropped,
--   2. makes expire_unpaid_holds() use it,
--   3. schedules it every minute with pg_cron.
-- The app also calls expire_unpaid_holds() before it shows open slots and
-- the front desk's lists, so holds are released even before step 3 runs.

-- ------------------------------------------------------------------
-- 1. 'expired' payment state
-- ------------------------------------------------------------------
alter table public.appointments drop constraint if exists appointments_payment_status_check;
alter table public.appointments
  add constraint appointments_payment_status_check
  check (payment_status in ('not_required','awaiting_payment','proof_submitted','verified','rejected','expired'));

-- ------------------------------------------------------------------
-- 2. expire_unpaid_holds — cancel lapsed, still-unpaid holds
--    A hold stops counting down once a receipt is uploaded
--    (payment_status moves to 'proof_submitted'), so the front desk can
--    take its time checking it.
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 3. Run it every minute
--    pg_cron is available on every Supabase project; enabling it here is
--    the same as switching it on under Database → Extensions.
-- ------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = '4med-expire-unpaid-holds') then
    perform cron.unschedule('4med-expire-unpaid-holds');
  end if;
  perform cron.schedule('4med-expire-unpaid-holds', '* * * * *', 'select public.expire_unpaid_holds()');
end $$;

-- Check it is running:
--   select jobname, schedule, active from cron.job where jobname = '4med-expire-unpaid-holds';
--   select status, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = '4med-expire-unpaid-holds')
--    order by start_time desc limit 5;
