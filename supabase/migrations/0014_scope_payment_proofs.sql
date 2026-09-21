-- ElonHub OS — tie proof-of-payment files to the payment they belong to.
--
-- PREREQUISITE: 0006, which creates the bucket and these four policies. This
-- fails naming the missing policy if it has not been applied.
--
-- The policies in 0006 test two things: that the object is in the
-- payment-proofs bucket, and that the caller holds an admin or finance role.
-- They never look at WHICH payment the file belongs to, and storage.objects
-- has no org_id, so there is nothing tenant-scoped about them at all.
--
-- The stored path is `{paymentId}/proof.{ext}` (src/lib/upload.ts), with no
-- tenant prefix — deliberately, because the path is derived from the payment
-- id rather than from anything the client sends. The consequence is that a
-- finance user of ANY organisation can list, download and overwrite EVERY
-- proof of payment in the bucket, and a super_admin of any organisation can
-- delete them. These are bank documents: account numbers, balances, and
-- whatever else appears on a statement someone photographed.
--
-- Nothing is exposed today, because there is one organisation and
-- payments_select already shows every payment in it to admins and finance. It
-- becomes a cross-tenant disclosure of banking documents the moment a second
-- organisation exists — a READ hole, which is categorically worse than the
-- write holes 0012 closes, and it sat in the one migration whose subject was
-- keeping these files private.
--
-- Scoped the same way 0012 scopes invoice_items: through the parent row. The
-- subquery is subject to payments_select for the calling user, and that policy
-- is org-scoped, so the file inherits the tenancy of the payment it documents.
--
-- The join compares TEXT rather than casting the folder name to uuid. An
-- object name is attacker-influenced in principle, and `'not-a-uuid'::uuid`
-- raises 22P02 from inside a policy, which is a much worse failure than simply
-- not matching.

begin;

alter policy payment_proofs_select on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and (public.is_admin() or public.auth_role() = 'finance')
    and exists (
      select 1 from public.payments p
       where p.id::text = (storage.foldername(name))[1]
    )
  );

alter policy payment_proofs_insert on storage.objects
  with check (
    bucket_id = 'payment-proofs'
    and public.auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from public.payments p
       where p.id::text = (storage.foldername(name))[1]
    )
  );

alter policy payment_proofs_update on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and public.auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from public.payments p
       where p.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'payment-proofs'
    and public.auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from public.payments p
       where p.id::text = (storage.foldername(name))[1]
    )
  );

-- Deleting a proof stays a records-retention decision for super_admin alone,
-- now against payments they can actually see.
alter policy payment_proofs_delete on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and public.auth_role() = 'super_admin'
    and exists (
      select 1 from public.payments p
       where p.id::text = (storage.foldername(name))[1]
    )
  );

commit;
