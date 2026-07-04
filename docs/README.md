# MediPulse Documentation

MediPulse is a multi-tenant outpatient clinic management SaaS for the Philippines — doctors and dentists register, subscribe to a plan, and run their entire practice (patients, scheduling, consultations, billing) from one app. Patients book appointments through a public portal.

New here? Start with the tutorial. Looking for something specific? Jump to the reference or how-to that covers it.

## Tutorials (learn by doing)
- [Getting started](./tutorial-getting-started.md) — get MediPulse running locally and walk through a full patient visit, start to finish

## How-to guides (accomplish a specific task)
- [Common tasks](./howto-common-tasks.md) — register a patient, book an appointment, run a consult, bill a visit, add a secretary, deploy the notification worker, and more

## Reference (look up the facts)
- [Architecture](./reference-architecture.md) — tech stack, file structure, how the pieces fit together
- [Database schema](./reference-database.md) — every table, key functions (RPCs), and the RLS security model
- [Modules](./reference-modules.md) — what each part of the app does and where its code lives

## Explanation (understand the why)
- [Multi-tenant security model](./explanation-multi-tenant.md) — why doctors can only see their own patients, and how that's enforced

## Quick facts
- **Stack**: React (Vite) + Supabase (Postgres, Auth, Edge Functions) + Vercel, styled with Tailwind
- **Roles**: `patient`, `doctor`, `secretary`, `admin` — each with a different view of the same app
- **Specialties supported**: general medicine (any specialty, admin-editable) and dentistry, with a dedicated odontogram for the latter
- **Country-specific**: PH senior citizen/PWD tax law (RA 9994/10754), PhilHealth number capture, GCash/Maya payment methods, Semaphore SMS + Resend email for notifications
