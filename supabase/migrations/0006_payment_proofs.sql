-- Proof of payment attachments.
--
-- The bucket is PRIVATE. A proof of payment is a bank document showing account
-- numbers and balances; a public bucket would make every one of them readable
-- by anyone who learned or guessed the URL, with no login. Files are served
-- through short-lived signed URLs generated server-side after a role check.

alter table payments add column if not exists proof_path text;

comment on column payments.proof_path is
  'Object path inside the private payment-proofs bucket. Null when no proof has been uploaded.';

-- ---------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760, -- 10 MB, matching MAX_UPLOAD_BYTES in src/lib/upload.ts
  array['application/pdf', 'image/jpeg']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Storage policies
--
-- Mirrors payments_select and payments_write: admins and finance read,
-- super_admin and finance write. The size and MIME limits above are enforced
-- by storage itself, independently of the application's own checks — the app
-- validates magic bytes, which storage cannot.
-- ---------------------------------------------------------------------
drop policy if exists payment_proofs_select on storage.objects;
create policy payment_proofs_select on storage.objects for select using (
  bucket_id = 'payment-proofs'
  and (public.is_admin() or public.auth_role() = 'finance')
);

drop policy if exists payment_proofs_insert on storage.objects;
create policy payment_proofs_insert on storage.objects for insert with check (
  bucket_id = 'payment-proofs'
  and public.auth_role() in ('super_admin', 'finance')
);

drop policy if exists payment_proofs_update on storage.objects;
create policy payment_proofs_update on storage.objects for update using (
  bucket_id = 'payment-proofs'
  and public.auth_role() in ('super_admin', 'finance')
);

-- Deleting a proof is a records-retention decision, so it stays with
-- super_admin alone.
drop policy if exists payment_proofs_delete on storage.objects;
create policy payment_proofs_delete on storage.objects for delete using (
  bucket_id = 'payment-proofs'
  and public.auth_role() = 'super_admin'
);

-- ---------------------------------------------------------------------
-- Sanity check
-- ---------------------------------------------------------------------
-- select id, public, file_size_limit from storage.buckets where id = 'payment-proofs';
-- select column_name from information_schema.columns
--   where table_name = 'payments' and column_name = 'proof_path';
