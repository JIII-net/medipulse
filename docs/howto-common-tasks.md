# How-to: common tasks

## Register a new patient without creating a duplicate

Go to **Patients** and search by name, MRN, or phone *before* clicking "New patient" — this is the single best duplicate-prevention step. If nothing matches, register them; the form also runs an automatic same-name-and-birthdate check and shows candidate matches before letting you create a second record.

## Book an appointment on behalf of a patient

**Appointments → Calendar**, click an open slot (or "New appointment"), search for the patient, pick a doctor/date/time/type, and confirm. This automatically queues an SMS/email confirmation and a 24-hour reminder.

## Run a consultation

From **Doctor Portal**, click "Start consult" on a today's appointment or "Take in" on a waiting queue ticket. Write the SOAP note (apply a template if one fits, or dictate with the mic button), add prescriptions/procedures/med certs as needed, then **Sign & complete** — this locks the note and opens billing.

## Bill a visit and collect payment

After signing a consult, the billing screen pre-fills the consult fee and any procedures — set amounts and create the invoice. To bill separately, go to **Billing → New invoice**, pick the patient, add charges (there's a one-click button for the doctor's registered consult fee), and finalize. Senior/PWD discounts apply automatically if the patient's record has that flag. Open the invoice to record a payment — split across multiple methods if needed — and print the official receipt.

## Add a secretary to your practice

**Practice → Team → Generate invite code**, then give the code to your secretary. They sign up via **"Join a practice"** on the public site (linked from the doctor signup page) and enter the code. They'll get access to Patients, Appointments, Billing, and Queue — never clinical notes or prescriptions.

## Add a new specialty

As admin: **Admin → Specialties → Add**, choose Doctor or Dentist, name it. It appears immediately in the doctor signup picker and the patient directory filter — no deploy needed.

## Edit or add a subscription plan

As admin: **Admin → Plans → New plan** (or the pencil icon on an existing one). Set the ID, name, price, seat limit, and a feature list (one per line). Changes reflect immediately on the public pricing page and the signup wizard.

## Invite a specific doctor to the platform

As admin: **Admin → Invites → Generate invite**, optionally picking a plan to pre-assign and adding a note. Share the code — the doctor enters it during signup step 1, which validates it live and pre-selects the plan if one was assigned.

## Add a doctor's second clinic location

**Practice → Clinic locations → Add location**. Once added, you can tie schedule rules to a specific location (**Appointments → Schedules**), so patients booking online see which location a slot is at, and pick between locations if you have more than one.

## Deploy real SMS/email delivery (Semaphore + Resend)

By default, notifications queue in the Outbox but don't actually send. To make them real:

1. Get API keys from [semaphore.co](https://semaphore.co) (SMS, pay-per-message) and [resend.com](https://resend.com) (email, free tier available)
2. Install the Supabase CLI: `npm install -g supabase && supabase login`
3. From the project folder: `supabase link --project-ref YOUR_REF` then `supabase functions deploy send-notifications`
4. Set secrets: `supabase secrets set SEMAPHORE_API_KEY=... SEMAPHORE_SENDER_NAME=... RESEND_API_KEY=... RESEND_FROM=...`
5. Run the `medipulse-notifications-worker.sql` migration (after editing its two placeholder values) to schedule delivery every 2 minutes via `pg_cron`
6. Test with the "Send due now" button in **Appointments → Outbox** — failures show the actual provider error right on the row

Full details with exact commands: `README-notifications.md` in the project root.

## Debug a "row-level security policy" error

This means a direct table write hit an RLS policy that didn't expect that account/role/relationship. Check:
1. Is the account's `profiles.role` actually what you expect? (Query `select role from profiles where id = auth.uid()` — or just check via Admin)
2. Is this a cross-account write (staff creating something on behalf of a patient, or similar)? If so, it likely needs to go through a security-definer RPC instead of a direct insert — see [reference-database.md](./reference-database.md) for the existing ones, or that's a sign a new one is needed.
3. Check you've run every migration file in order — a missing policy from an earlier file can cause this on a feature that depends on it.
