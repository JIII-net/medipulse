-- medipulse-storage.sql — the project's first Storage buckets
-- Creates two PRIVATE buckets and their storage.objects policies:
--   payment-proofs     — GCash/bank screenshots patients send in
--   consent-signatures — signature PNGs captured when a form is signed
-- Run in the Supabase SQL Editor before medipulse-prepayment.sql.
--
-- Path convention (enforced below): {auth.uid()}/{folder}/{filename}
-- The first path segment is always the uploader's auth id. That single
-- rule is what stops one patient writing into — or reading — another's
-- folder, so do not relax it. Nothing is ever public; the app reads
-- objects through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-proofs', 'payment-proofs', false, 5242880,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('consent-signatures', 'consent-signatures', false, 2097152,
   array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------
-- payment-proofs
-- ------------------------------------------------------------------
drop policy if exists "pp insert own folder"  on storage.objects;
drop policy if exists "pp read own or staff"  on storage.objects;
drop policy if exists "pp staff delete"       on storage.objects;

-- Anyone signed in may upload, but only beneath their own uid folder.
create policy "pp insert own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The uploader sees their own; front desk (doctor/secretary/admin) sees all,
-- because verifying payments is front-desk work.
create policy "pp read own or staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

create policy "pp staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and public.is_staff());

-- ------------------------------------------------------------------
-- consent-signatures
-- ------------------------------------------------------------------
drop policy if exists "cs insert own folder"    on storage.objects;
drop policy if exists "cs read own or clinician" on storage.objects;

-- Patients sign in the portal (their own folder). Staff sign on a clinic
-- tablet on behalf of a patient who is physically present — that lands in
-- the staff member's folder, which is why is_staff() is allowed here too.
create policy "cs insert own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'consent-signatures'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

create policy "cs read own or clinician" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'consent-signatures'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- No update or delete policy on consent-signatures: a captured signature
-- is evidence and must not be replaced or removed.
