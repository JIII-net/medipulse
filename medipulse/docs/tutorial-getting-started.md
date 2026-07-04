# Getting started with MediPulse

You'll get MediPulse running on your machine, connect it to a real Supabase backend, and walk through one complete patient visit — from a doctor signing up to a patient getting billed. By the end you'll understand how the pieces connect.

## What you'll need

- Node.js 18+ and npm
- A free [Supabase](https://supabase.com) account
- A code editor and terminal

## Step 1: Install and run

```bash
cd medipulse
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173` — you'll see the MediPulse landing page. Nothing works yet because `.env` is still pointing at placeholder values; that's next.

## Step 2: Connect a real Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → API** and copy your **Project URL** and **anon public key**
3. Paste them into `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Restart `npm run dev`

## Step 3: Set up the database

Open your Supabase project's **SQL Editor** and run every `medipulse-*.sql` file you have, **in the order they were created** (schema and patients first, then appointments, doctor portal, billing, and so on — see [reference-database.md](./reference-database.md) for the full list and what each one does). Most run in one paste; a couple have a note at the top saying to split into two runs — follow that note when you see it.

Reload the app. The landing page should now load without errors.

## Step 4: Register a doctor

Click **Register as a doctor**. Fill in your name and email, choose **Doctor** or **Dentist**, pick at least one specialty, enter any PRC license number (it doesn't get verified in this build), pick a plan, and finish. You now have a doctor account with a 14-day trial subscription.

**If your Supabase project requires email confirmation**, turn it off for easier local testing: **Authentication → Providers → Email → toggle off "Confirm email."**

## Step 5: Set up your schedule and location

Log in and open the **Clinic App**. Go to **Practice**:
- Add a **clinic location** (name, address)
- The **Appointments → Schedules** tab lets you set which days/hours you're available

## Step 6: See it from the patient's side

Open the site in a new incognito window (or log out). Go to **Patient portal → Find a doctor**, find yourself in the directory, and book an appointment for a day/time within your schedule. You'll see a location picker if you added more than one, and available time slots pulled from your real schedule.

## Step 7: Run the visit as the doctor

Back in the Clinic App as the doctor, go to **Appointments → Calendar** — your new booking is there. Click it, then **Check in** to issue a queue number. Go to **Doctor Portal**, find the patient waiting, and click **Start consult**.

Write a SOAP note (try the template dropdown, and the mic button if your browser supports dictation), add a prescription item, then **Sign & complete**. A billing screen appears automatically — set an amount and create the invoice.

## Step 8: Collect payment

Go to **Billing**, open the invoice you just created, and record a payment (cash, GCash, Maya, card, or bank). You'll get an auto-numbered official receipt you can print.

## What you built

You now have a doctor account, a real clinic schedule, a patient who booked online, a completed consultation with clinical notes, and a paid invoice — the full outpatient loop. From here:

- Try **Patient Records** to see the patient's full chart and edit their demographics
- Try registering a **secretary** via an invite code from **Practice → Team**
- If you're testing dentistry, sign up a second doctor as a **Dentist** and check out the odontogram in their Doctor Portal
- Read [reference-modules.md](./reference-modules.md) to see what else exists
- Set up real SMS/email delivery by following the notification worker how-to in [howto-common-tasks.md](./howto-common-tasks.md)
