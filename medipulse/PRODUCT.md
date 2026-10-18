# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences, weighted equally (confirmed):

- **Clinic staff and practitioners**: doctors, dentists, ophthalmologists, psychiatrists, psychologists, and their secretaries/front desk at Philippine private practices (solo practitioners and small multi-doctor clinics). They work in the Clinic App all day: registering patients, running the appointment queue, consultations, billing.
- **Patients**: people in the Philippines finding a practitioner, booking a slot, paying up front, and signing consent documents before consulting. Mostly on phones.
- **Practitioners evaluating 4MED**: signing up, picking a subscription plan, onboarding their practice.

## Product Purpose

4MED is a patient-management SaaS for Philippine private practice. It connects practitioners and patients on one platform: a public directory with slot booking, pay-before-booking with proof-of-payment upload, signed consent documents, and a Clinic App covering patient records, appointments and queue, consultations (SOAP notes, e-Rx, medical certificates), and billing. Success means a practice runs its day in 4MED and patients book and arrive without back-and-forth messaging.

## Positioning

One system that adapts to the profession: each practitioner type gets its own clinical module (dental chart for dentists, eye-exam module for ophthalmologists, mental-health module for psychiatrists and psychologists, with prescribing for psychiatrists only), on top of shared scheduling, records, payments and consent workflows built for how Philippine clinics take payment and bookings.

## Operating Context

- Roles: admin, doctor (practitioner), secretary (front desk), patient. Secretaries do not see the Doctor Portal; only doctors see Practice settings; only admins see Admin.
- Clinic App modules: Dashboard, Patients, Appointments (day/week calendar, queue, QR check-in scanner), Billing, Doctor Portal (consultations, profession charts), Practice settings, Admin (plans, staff invites, specialties).
- Patient flow: directory → booking modal → payment (bank/e-wallet, proof-of-payment upload) → consent signing (signature pad) → My Appointments.
- Printed documents (prescriptions, certificates, consent forms) are generated as HTML in a separate print window.
- Pricing in Philippine pesos; subscription plans Starter / Pro / Clinic, monthly or annual (−20%), 14-day trial. Plans are admin-managed in the database, with hardcoded fallbacks.
- Demo data is shown when Supabase is unreachable, so the prototype is viewable without a backend.

## Capabilities and Constraints

- Stack: React 18 + Vite, Supabase (auth, Postgres with row-level security, storage, edge function for notifications), lucide-react icons, Tailwind via CDN, html5-qrcode, qrcode.react.
- Profession registry lives in `src/lib/professions.js`; the live `specialties` table is the real source.
- The app is one React tree switching views (landing, doctor signup, staff join, patient portal, clinic app) rather than a router.

## Brand Commitments

- Name: **4MED** (rebranded from MediPulse; some repo docs and SQL file names still say medipulse).
- Logo: the blue-and-silver rounded medical cross with a sky-blue ring, `src/Logo.jsx` and `public/favicon.svg`. Fixed; must be kept (confirmed). Everything else about the visual identity is open.

## Evidence on Hand

- No customer testimonials, logos, case studies, or usage metrics exist. Do not fabricate any.
- The old landing claims ("cut no-shows by up to 40%", "DPA 2012 & HIPAA-ready", "AES-256 at rest", "bank-grade security") are unproven. The user decided on 2026-10-18 to drop them; marketing copy may be rewritten freely but must not add claims.

## Product Principles

1. The working day comes first: front-desk and consultation flows must be fast to scan and hard to get wrong.
2. Each profession should feel served, not bolted on: its module looks native to the system.
3. Patients on phones must be able to book, pay and sign without help.
4. Trust is earned through clarity about payment, consent and privacy, not through slogans.

## Accessibility & Inclusion

Patients span all ages on mid-range Android phones and variable connections; text must stay legible and touch targets generous. Clinic staff use it for hours, so contrast and density must hold up over a full day. Target WCAG 2.2 AA.
