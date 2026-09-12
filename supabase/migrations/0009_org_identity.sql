-- ElonHub OS — organisation identity, letterhead and banking.
--
-- Until now the only editable organisation fields were name, vat_number,
-- currency and vat_rate; the address, contact details and banking block lived
-- as constants in src/lib/company.ts and needed a deploy to correct. That is
-- the wrong home for two of them in particular:
--
--   * vat_number was never set, so every document titled "Tax Invoice" printed
--     without one. Section 20(4) of the VAT Act requires the supplier's VAT
--     registration number on a tax invoice, so those documents were not valid.
--   * the FNB branch code was inferred rather than supplied. A wrong branch
--     code on an invoice is a payment that does not arrive.
--
-- Every column is nullable and nothing is backfilled. The app reads the
-- organisation row with select(*) and falls back to the company.ts constants
-- for any field that is null OR absent, so this migration is safe to apply
-- late: documents keep rendering either way.
--
-- org_select and org_update in 0002_rls.sql cover the whole row, so no new
-- policy is needed for the new columns. org_update IS tightened below: it
-- checked the caller's role without checking which row was being written.

alter table organisations
  add column if not exists registration_number text,
  add column if not exists address             text,
  add column if not exists phone               text,
  add column if not exists email               text,
  add column if not exists website             text,
  add column if not exists bank_name           text,
  add column if not exists bank_account_name   text,
  add column if not exists bank_account_type   text,
  add column if not exists bank_account_number text,
  add column if not exists bank_branch_code    text;

-- ---------------------------------------------------------------------
-- Audit the row that says where money should be sent
-- ---------------------------------------------------------------------
--
-- Until this migration the bank account lived in src/lib/company.ts, so
-- changing it meant a commit: attributable, reviewable and revertible. Moving
-- it into a form removes that record unless something replaces it. An invoice
-- tells a client where to pay, so a silent edit to bank_account_number
-- redirects every invoice issued afterwards, and the first question in an
-- incident — when did this change, and from what — would have no answer.
--
-- 0001_init.sql audits customers, leads, opportunities, quotes, invoices,
-- payments and projects, but not organisations. audit_trigger_fn cannot simply
-- be attached here: it reads coalesce(new.org_id, old.org_id), and
-- organisations has no org_id column, so the first save would fail with
-- "record new has no field org_id". Hence a dedicated function keyed on id.
--
-- UPDATE only, deliberately. There is no UI that inserts or deletes an
-- organisation, and a delete could not be recorded anyway: audit_log.org_id
-- references organisations(id), so the entry would violate the foreign key as
-- the row it points at disappears.

create or replace function audit_organisation_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (org_id, actor_id, table_name, record_id, action, before, after)
  values (new.id, auth.uid(), 'organisations', new.id, 'update', to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists audit_organisations on organisations;
create trigger audit_organisations after update on organisations
  for each row execute function audit_organisation_fn();

-- audit_log_select in 0002_rls.sql already restricts reads to admins of the
-- same organisation, and the table is written only by SECURITY DEFINER
-- triggers, so no policy change is needed for the new entries.

-- ---------------------------------------------------------------------
-- Tenant-scope the update policy
-- ---------------------------------------------------------------------
--
-- org_update was `auth_role() = 'super_admin'` with no org predicate, so a
-- super admin could update ANY organisation row. Harmless while there is one
-- row, but this is the table a second trading entity would be added to, and a
-- cross-tenant write is a much harder bug to notice than to prevent.

-- WITH CHECK is spelled out rather than left to default to USING. Postgres
-- does default it, so this changes nothing today, but the next person to edit
-- the USING clause should not have to know that rule to keep the write side
-- safe.
alter policy org_update on organisations
  using (id = auth_org_id() and auth_role() = 'super_admin')
  with check (id = auth_org_id() and auth_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Formats enforced by the database, not only by the form
-- ---------------------------------------------------------------------
--
-- The server action checks these shapes, but that check is bypassed by
-- anything writing over SQL or with the service-role key. A branch code is
-- six digits everywhere in South Africa and a SARS VAT number is ten digits
-- beginning with 4; both are printed on documents a client acts on, so the
-- constraint belongs next to the data.
--
-- Safe to apply to the seeded row, where all three columns are null.

alter table organisations
  add constraint org_vat_number_fmt
    check (vat_number is null or vat_number ~ '^4\d{9}$'),
  add constraint org_branch_code_fmt
    check (bank_branch_code is null or bank_branch_code ~ '^\d{6}$'),
  add constraint org_account_number_fmt
    check (bank_account_number is null or bank_account_number ~ '^\d{6,20}$');
