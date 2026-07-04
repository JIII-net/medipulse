# Module reference

## Public site (`App.jsx`)

- **Landing** — marketing page with live pricing (pulled from the `plans` table) and a signed-in indicator that adapts to whoever's logged in
- **Doctor signup** — 4-step wizard: profile → credentials (profession type + multi-select specialties, both pulled live from the `specialties` table) → plan → review. Supports an optional admin-issued invite code that pre-selects a plan
- **Join a practice** — secretary signup via invite code from a doctor
- **Patient portal** — doctor directory (search, specialty filter, live availability) with schedule-aware, location-aware booking, plus a "My appointments" tab for upcoming/past visits and cancellation
- **Admin dashboard** — subscriptions overview, Plans/Invites/Specialties management (see below)

## Clinic App shell (`StaffApp.jsx`)

The logged-in application frame: a sidebar (role-aware — secretaries don't see Doctor Portal, only doctors see Practice, only admins see Admin), a global patient search (Ctrl/⌘K), and a dashboard home with live stats and quick actions. Every module below renders inside this shell.

## Patient Records (`PatientRecords.jsx`)

Search-first patient management with duplicate detection at registration. A patient's record has tabs for Overview (demographics, emergency contacts, insurance), Medical (allergies, conditions/problem list), Family (bidirectional linking), and Timeline (a merged chronological view of everything). Includes a printable QR ID card and an Edit modal for completing "provisional" records (patients who booked online before a full record existed).

## Appointments (`AppointmentsModule.jsx`)

Four tabs: **Calendar** (day/week views, schedule-aware booking, click-to-book), **Schedules** (weekly availability rules per doctor, optionally per clinic location), **Queue** (live board by station with atomic ticket numbering and senior/PWD priority), and **Outbox** (the notification queue — see the how-to guide for wiring up real delivery).

## Doctor Portal (`DoctorPortal.jsx`)

The doctor's daily dashboard (today's appointments, waiting queue, open consultations) and the consultation workspace itself: SOAP notes with templates and voice dictation, e-prescriptions with a live allergy-conflict warning, medical certificates, procedure recording, and follow-up notes. Signing a note locks it permanently. For dentists, an additional **Dental Chart** tab appears automatically (see below), and procedures are tooth-specific. Signing a consult opens a billing screen with the consult fee and any procedures pre-filled.

## Dental Chart (`DentalChart.jsx`)

An interactive odontogram using FDI tooth numbering (11–48), rendered with anatomically distinct shapes per tooth type (incisor/canine/premolar/molar), correctly mirrored for upper vs. lower arch. Click a tooth to set its condition and see its history. Only shown for doctors whose `profession_type` is `dentist`.

## Billing (`BillingModule.jsx`)

Invoice creation (manual or auto-populated after a signed consult), Philippine senior citizen/PWD discount computation (RA 9994/10754 — VAT exemption then 20% off), split payments across cash/GCash/Maya/card/bank, and printable Statements of Account and auto-numbered Official Receipts.

## Practice Settings (`PracticeSettings.jsx`)

A doctor's self-service page: their own subscription status/trial countdown, clinic locations (for doctors who split time across multiple sites), and team management — generating invite codes for secretaries.

## Admin Setup (`AdminSetup.jsx`)

Platform-admin-only tools, rendered as extra tabs inside the Admin dashboard: **Plans** (create/edit/delete subscription plans — changes reflect live on the signup page), **Invites** (admin-issued doctor invites with optional pre-assigned plans), and **Specialties** (the master list doctors pick from at signup, editable without a code deploy).

## Shared library (`lib/`)

- `supabaseClient.js` — the one Supabase client instance, reading config from environment variables
- `AuthContext.jsx` — wraps Supabase Auth; `signUp` branches by role to also create the right side-table rows (a `doctors` row for doctors, nothing extra for patients/secretaries)
- `StaffGate.jsx` — the login wall shared by every staff module; also enforces the role check (patients can never reach it)
