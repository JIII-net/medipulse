# MediPulse — Patient Management SaaS (prototype)

A modern, futuristic patient management platform prototype: doctors register and set up a subscription plan during onboarding; patients log in to browse available doctors and book appointments.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Push to GitHub

1. Create an empty repository on GitHub (e.g. `medipulse`) — no README, no .gitignore.
2. From this folder:

```bash
git init
git add .
git commit -m "Initial MediPulse prototype"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/medipulse.git
git push -u origin main
```

## What's inside

- `src/App.jsx` — the entire prototype: landing page with pricing, 4-step doctor onboarding with subscription setup (Starter / Pro / Clinic, monthly or annual), and the patient portal with searchable doctor directory and slot booking.
- Tailwind is loaded via CDN in `index.html` for prototype speed. For production, install Tailwind properly (`npm install -D tailwindcss postcss autoprefixer`).

## Roadmap (best-practice next steps)

- Backend: Supabase or NestJS + PostgreSQL with row-level security per tenant
- Auth: JWT sessions, MFA for doctors, RBAC (admin / doctor / patient)
- Billing: Stripe or Paymongo/Xendit subscriptions with webhook-driven state
- Compliance: audit logs, AES-256 at rest, soft-delete only, DPA 2012 / HIPAA
- Features: doctor dashboard, EMR, telehealth (Daily.co), SMS reminders (Semaphore/Twilio)
