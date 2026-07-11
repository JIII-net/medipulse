# Database schema reference

Every table lives in the `public` schema of your Supabase Postgres database, created by a sequence of `medipulse-*.sql` migration files. Run them in this order on a fresh project (skip ones you've already run):

1. `medipulse-schema.sql` — `profiles`, `doctors`, `plans`, `subscriptions`
2. `medipulse-patients.sql` — `patients` and related tables (contacts, allergies, conditions, insurance, family links, history)
3. `medipulse-appointments.sql` — `departments`, `rooms`, `schedules`, upgrades to `appointments`, `queue_tickets`, `waitlist`, `notifications`
4. `medipulse-doctor-portal.sql` — `encounters`, `clinical_notes`, `note_templates`, `prescriptions`, `procedures`, `med_certificates`
5. `medipulse-practice.sql` — secretary role, `clinic_locations`, `staff_assignments`, `practice_invites` *(run the `alter type` line alone first, then the rest)*
6. `medipulse-billing.sql` — the multi-tenant `patient_access` model, `invoices`, `invoice_items`, `payments`
7. `medipulse-dental.sql` — `tooth_conditions`, `dental_procedures`
8. `medipulse-multi-specialty.sql` — `profession_type` and `specialties[]` on `doctors`
9. `medipulse-admin-setup.sql` — `specialties` master table, RLS on `plans`, `admin_invites`
10. `medipulse-ophtho.sql` — `eye_exams`, `eye_conditions`, seeds the Ophthalmology specialty
11. `medipulse-ophtho-profession.sql` — 'ophthalmologist' as a third `profession_type`, eye subspecialties
12. Assorted fix migrations (`medipulse-*-fix.sql`) — see each file's header comment for what it corrects

## Core tables

| Table | Purpose |
|---|---|
| `profiles` | One row per login (extends Supabase `auth.users`); holds `role` and `full_name` |
| `doctors` | One row per doctor/dentist account; `specialty` (primary) + `specialties[]` (all), `profession_type` |
| `patients` | The clinical master record — separate from `profiles`. `profile_id` optionally links it to a patient's login |
| `patient_access` | The multi-tenant relationship table — which doctor can see which patient. See [explanation-multi-tenant.md](./explanation-multi-tenant.md) |
| `appointments` | Bookings — carries `doctor_id`, `patient_record_id`, `patient_id` (portal login, if online-booked), `location_id`, status |
| `encounters` | One row per visit — the spine everything clinical hangs off (notes, prescriptions, procedures, invoices) |
| `clinical_notes` | SOAP notes; **immutable once signed** (enforced by a trigger, not just app logic) |
| `invoices` / `payments` | Billing — invoices compute PH senior/PWD discounts automatically; payments support split methods with auto-numbered official receipts |
| `tooth_conditions` / `dental_procedures` | Dental module — append-only odontogram history + per-visit dental work (dentists only) |
| `eye_exams` / `eye_conditions` | Ophthalmology module — one exam row per encounter (acuity, IOP, refraction) + append-only per-eye findings |
| `queue_tickets` | Walk-in/check-in queue, numbered atomically per station via `issue_queue_number()` |
| `notifications` | Outbox for SMS/email — delivered by the Edge Function, not by the app directly |

## Key functions (RPCs)

These are called from the frontend via `supabase.rpc(...)` instead of direct table writes, because each needs authorization logic or atomicity that a simple RLS policy can't express:

| Function | Used for |
|---|---|
| `register_patient(p jsonb)` | Staff registering a new patient (avoids RLS friction on cross-role inserts) |
| `get_or_create_patient_record(profile_id, full_name)` | Links a portal booking to a clinical record, creating a provisional one if needed |
| `issue_queue_number(station, prefix)` | Atomic queue numbering — prevents two simultaneous check-ins from getting the same number |
| `redeem_invite(code)` / `redeem_admin_invite(code)` | Secretary-joins-practice and admin-issued doctor invites |
| `check_admin_invite(code)` | Lets the (unauthenticated) signup form validate a code before an account exists |
| `taken_slots(doctor_id, day)` | Privacy-safe: tells the booking UI which time slots are taken without exposing other patients' appointment details |
| `can_access_patient(patient_id)` / `my_doctor_ids()` | Internal helpers used inside RLS policies, not called directly from the app |
| `get_user_role()` / `is_staff()` / `is_clinician()` | Role-check helpers used throughout RLS policies |

## Security model

Every table has Row-Level Security enabled. The two workhorse helper functions:

- **`is_staff()`** — true for `doctor`, `secretary`, `admin`. Used for front-desk-level tables (appointments, queue).
- **`is_clinician()`** — true for `doctor`, `admin` only. Used for anything clinical (notes, prescriptions) — secretaries are explicitly excluded, matching the real-world rule that front-desk staff shouldn't read medical notes.

See [explanation-multi-tenant.md](./explanation-multi-tenant.md) for how patient-level scoping works on top of these.
