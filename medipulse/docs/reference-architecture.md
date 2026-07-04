# Architecture reference

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite), Tailwind CSS (via CDN in `index.html`), lucide-react icons |
| Backend | Supabase — Postgres database, Auth, Row-Level Security, Edge Functions |
| Hosting | Vercel (frontend), Supabase (backend) |
| Notifications | Semaphore (Philippine SMS), Resend (email), delivered by a Supabase Edge Function on a `pg_cron` schedule |
| QR codes | `qrcode.react` |

There is no separate backend server — the React app talks to Supabase directly using the anon key, and Postgres Row-Level Security (RLS) is the actual authorization layer. This is why the SQL migrations matter as much as the frontend code: a feature isn't secure until its RLS policies exist.

## File structure

```
medipulse/
├── src/
│   ├── App.jsx                 Public site: landing, doctor signup, patient portal, admin dashboard
│   ├── StaffApp.jsx             The logged-in Clinic App shell (sidebar, global search, dashboard home)
│   ├── PatientRecords.jsx       Patient master record module (search, register, chart, family links)
│   ├── AppointmentsModule.jsx   Calendar, schedules, queue, walk-ins, notification outbox
│   ├── DoctorPortal.jsx         Doctor's daily dashboard + the consultation workspace (SOAP, e-Rx, etc.)
│   ├── DentalChart.jsx          The odontogram, used inside DoctorPortal for dental specialties
│   ├── BillingModule.jsx        Invoices, PH tax/discount computation, payments, receipts
│   ├── PracticeSettings.jsx     A doctor's own subscription, locations, and team (secretaries)
│   ├── AdminSetup.jsx           Admin-only: editable plans, doctor invites, specialty master file
│   └── lib/
│       ├── supabaseClient.js    The Supabase client singleton
│       ├── AuthContext.jsx      Auth state + signUp/signIn/signOut, including role-specific signup logic
│       └── StaffGate.jsx        Login gate shared by every staff-only module
├── supabase/functions/
│   └── send-notifications/      Edge Function that delivers due SMS/email via Semaphore/Resend
└── docs/                        You are here
```

## How a request actually flows

There's no API layer to reason about — every component calls `supabase.from(...)` or `supabase.rpc(...)` directly. Two patterns matter:

**Direct table access** (`supabase.from("patients").select(...)`) — relies entirely on RLS policies to decide what the current user can see or change. Most reads and simple writes work this way.

**RPC calls to security-definer functions** (`supabase.rpc("register_patient", {...})`) — used whenever an action needs to do something a simple RLS policy can't express cleanly: cross-account writes (a doctor creating a record on behalf of a patient's login), atomic operations (queue numbering, so two staff can't get the same ticket number), or authorization logic that's easier to write as a procedure than a policy. These functions do their own authorization check internally (usually via the `is_staff()` or `is_clinician()` helper) rather than depending on the caller's RLS permissions on the underlying table.

When something hits a "row-level security policy" error, it usually means a direct table write should have been an RPC call instead — see [explanation-multi-tenant.md](./explanation-multi-tenant.md) for why this keeps coming up and how it's been resolved each time.

## Roles

| Role | Can do |
|---|---|
| `patient` | Browse doctors, book/cancel their own appointments, view their own records via a linked `patients` row |
| `secretary` | Everything a doctor can do *except* clinical work — patients, appointments, queue, billing — scoped to whichever doctor(s) invited them |
| `doctor` | Full access to their own patients, appointments, consultations, and billing; manages their own Practice settings |
| `admin` | Platform oversight — all doctors' subscriptions, plan/invite/specialty management, license verification |

A single login only ever has one role, stored in `profiles.role`.
