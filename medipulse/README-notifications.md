# MediPulse — Real notification delivery (SMS + email)

This makes appointment confirmations and reminders actually send, via
**Semaphore** (Philippine SMS) and **Resend** (email), instead of the
old placeholder button that just flipped a status flag.

## 1. Get API keys

- **Semaphore**: sign up at semaphore.co, load some credits, grab your API key from the dashboard. Register a sender name (e.g. "MediPulse") — takes a day or two for approval; use the default sender in the meantime.
- **Resend**: sign up at resend.com (free tier is generous), verify a sending domain (or use their test domain while developing), grab your API key.

## 2. Install the Supabase CLI (one-time, on your own machine)

```bash
npm install -g supabase
supabase login
```

## 3. Link this project and deploy the function

From the `medipulse` folder:

```bash
supabase link --project-ref YOUR_PROJECT_REF   # find this in your Supabase dashboard URL
supabase functions deploy send-notifications
```

## 4. Set the secrets the function needs

```bash
supabase secrets set SEMAPHORE_API_KEY=your_semaphore_key
supabase secrets set SEMAPHORE_SENDER_NAME=MediPulse
supabase secrets set RESEND_API_KEY=your_resend_key
supabase secrets set RESEND_FROM="MediPulse <noreply@yourdomain.com>"
```

## 5. Run the SQL migration

Run `medipulse-notifications-worker.sql` in the Supabase SQL Editor — but **before running it**, edit the two placeholders in the file:

- `YOUR_PROJECT_REF` → your actual project ref (from step 3)
- `YOUR_ANON_KEY` → your project's anon public key (Supabase Dashboard → Settings → API)

This sets up a `pg_cron` job that calls your deployed function every 2 minutes to send whatever's due.

## 6. Test it

In the app: Clinic App → Appointments → Outbox → **Send due now**. This calls the same function manually so you can verify it works without waiting for the cron schedule. Check the row's status flips to "sent" — or "failed" with the actual provider error shown right there, so you can debug (wrong API key, unverified sender, etc.) without digging through logs.

## Notes

- The cron job runs regardless of whether anyone has the app open — that's the point, reminders go out even at 2am.
- Failed sends keep their error message on the row, visible in Outbox, instead of silently disappearing.
- Costs: Semaphore is per-SMS (check current pricing on their site); Resend's free tier covers a solo clinic's email volume comfortably.
