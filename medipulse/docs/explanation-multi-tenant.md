# Why the multi-tenant security model works the way it does

MediPulse is one platform shared by many independent doctors. Without deliberate design, that's a serious privacy problem: doctor A should never be able to browse doctor B's patients, even though both doctors' data lives in the same `patients` table.

## The naive approach (and why it fails)

The obvious first attempt is "doctors can only see patients they registered" — but real clinics don't work that way. A patient might be registered by a secretary, booked online without ever being formally registered, seen by a different doctor at the same practice, or referred between doctors. Ownership isn't a single fixed fact; it's a relationship that accumulates over time.

## The actual model: relationship-based access

MediPulse tracks *why* a doctor can see a patient, not just *whether* they registered them. A `patient_access` table records every doctor-patient relationship, and it's populated automatically — never manually — whenever a real interaction happens:

- A doctor (or their secretary) **registers** the patient
- A doctor **books an appointment** with the patient
- A doctor **starts an encounter** (consultation) with the patient
- A doctor **issues an invoice** to the patient

Each of these is backed by a database trigger, so the access grant can never be forgotten or bypassed by a client-side bug — it happens at the same moment as the underlying action, inside the same transaction.

A doctor's effective patient list is: everyone they have at least one such relationship with. A secretary inherits exactly their assigned doctor(s)' patients — nothing more. Admin sees everyone, for platform oversight.

## Why this lives in the database, not the app

Row-Level Security policies read from `patient_access` for every single query against `patients` and everything that hangs off a patient (appointments, encounters, notes, invoices). This means the restriction holds even if:

- A bug in the React code forgets to filter something
- Someone calls the Supabase API directly, bypassing the UI entirely
- A future developer adds a new screen and forgets about scoping

The alternative — filtering in JavaScript before rendering — only protects the UI. Anyone with the anon key (which is public, by design, in every Supabase app) could still query unfiltered data directly. RLS is the only enforcement point that can't be skipped.

## Why some writes go through RPC functions instead of RLS

RLS policies are good at "can this user read/write this specific row" but awkward at expressing "this doctor is allowed to create a record on behalf of a patient's separate login account" — a legitimately cross-account action that comes up in a few real flows (linking a portal booking to a clinical record; a doctor registering a walk-in). Rather than write increasingly convoluted RLS policies to allow these specific cross-account cases (and risk accidentally allowing more than intended), those specific actions are implemented as `security definer` Postgres functions that perform their own authorization check in plain procedural code, then act with elevated privileges for just that one operation. This is why you'll see `supabase.rpc(...)` calls instead of `supabase.from(...).insert(...)` in a handful of places — it's a deliberate choice, not an inconsistency.

## Clinical vs. front-desk access

On top of patient-level scoping, there's a second axis: secretaries can see *that* a patient has an appointment, but never their SOAP notes, prescriptions, or diagnoses. This is enforced by a separate pair of helper functions — `is_staff()` (true for doctor/secretary/admin, used for front-desk tables) and `is_clinician()` (true for doctor/admin only, used for anything clinical). A secretary is `is_staff()` but not `is_clinician()`, so they pass RLS checks on appointments and billing but fail them on `clinical_notes` and `prescriptions` — matching how a real clinic's front desk actually works.
