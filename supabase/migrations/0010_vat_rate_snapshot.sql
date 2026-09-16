-- ElonHub OS — record the VAT rate on the document, not just on the org.
--
-- quotes and invoices stored subtotal, vat_amount and total, but not the rate
-- those figures were calculated at. Everything read organisations.vat_rate
-- live, which has two consequences, and the second is the serious one:
--
--   1. Display: reprinting a two-year-old invoice showed today's rate, so the
--      client's copy and ours would stop agreeing after any rate change.
--
--   2. Storage: recomputeTotals() in the quotes actions and reconcile() in the
--      invoices actions both recompute from line items at the CURRENT org rate
--      and write the result back to the row. They run on every line-item and
--      payment write. So recording a payment against an old invoice after a
--      rate change silently restated that invoice's stored financial record.
--
-- South Africa has changed the rate once in thirty years (14% to 15% in 2018),
-- so this was never going to fire on its own. It fires the moment anyone edits
-- the rate — which is exactly what the Settings screen added in 0009 was built
-- to allow, and why the field was left read-only until now.
--
-- The column is NULLABLE and nothing depends on it existing. The app reads
-- `row.vat_rate ?? org.vat_rate ?? 15` through resolveVatRate() in
-- src/lib/money.ts, so a database without this migration keeps behaving
-- exactly as it does today rather than erroring 42703 on every document.
--
-- Every statement below is re-runnable. The premise of this design is that
-- migrations get applied late and by hand, which means a half-finished run
-- followed by a retry is a realistic event, and an `add constraint` that
-- aborts with 42710 on the second attempt tells the operator nothing about
-- whether the earlier statements took.

alter table quotes   add column if not exists vat_rate numeric(5, 2);
alter table invoices add column if not exists vat_rate numeric(5, 2);

-- Backfill from the owning organisation. Correct for every existing row: the
-- rate has not changed since this database was created, so the live org rate
-- IS the rate each of these documents was calculated at. This is the one and
-- only moment that is true, which is why the backfill belongs here and not in
-- application code run later.
update quotes q
   set vat_rate = o.vat_rate
  from organisations o
 where o.id = q.org_id
   and q.vat_rate is null;

update invoices i
   set vat_rate = o.vat_rate
  from organisations o
 where o.id = i.org_id
   and i.vat_rate is null;

-- ---------------------------------------------------------------------
-- Stamping the rate is the database's job, not the application's
-- ---------------------------------------------------------------------
--
-- The obvious implementation is to set vat_rate in the insert in
-- createQuote(), createInvoice() and convertQuoteToInvoice(). That was
-- rejected for two reasons:
--
--   * It makes this migration mandatory. An app that writes vat_rate against
--     a database without the column fails with PGRST204, so deploying the code
--     before running the migration would break quote and invoice creation —
--     features that work today.
--
--   * It puts the rule in three places and relies on the next person finding
--     all of them.
--
-- NOT security definer. The function reads only the caller's own organisation,
-- which org_select already grants to every role, so the elevated privilege
-- would buy nothing and widen the surface for no reason.

create or replace function stamp_vat_rate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- An explicitly supplied rate is respected. This is what lets a restore or a
  -- data migration reinsert historical rows at the rate they were really
  -- raised at; without it, reloading a dump would silently restamp every
  -- document with today's figure.
  if new.vat_rate is not null then
    return new;
  end if;

  select o.vat_rate into new.vat_rate
    from organisations o
   where o.id = new.org_id;

  return new;
end;
$$;

drop trigger if exists stamp_vat_rate_quotes on quotes;
create trigger stamp_vat_rate_quotes before insert on quotes
  for each row execute function stamp_vat_rate();

drop trigger if exists stamp_vat_rate_invoices on invoices;
create trigger stamp_vat_rate_invoices before insert on invoices
  for each row execute function stamp_vat_rate();

-- ---------------------------------------------------------------------
-- The rate is fixed at the moment the document leaves draft
-- ---------------------------------------------------------------------
--
-- An invoice is NOT stamped with the rate its quote was raised at. VAT is
-- charged at the rate in force at the time of supply — section 9 of the VAT
-- Act, generally the earlier of the tax invoice being issued or payment being
-- received. An invoice issued after a rate increase is a supply at the new
-- rate, and billing the quote's older rate would declare too little output tax
-- and leave the difference owing to SARS out of margin.
--
-- The commercial objection — that the client accepted a total at the old rate
-- — is already answered by section 67(1), which entitles the vendor to
-- increase the price by the VAT differential when the rate changes, unless the
-- contract says otherwise. The quote detail screen warns when a quote's rate
-- differs from the current one, so whoever converts it can see the total will
-- move before they do it.
--
-- Stamping on INSERT alone is not enough, because an invoice is inserted as a
-- draft and a draft is not a supply. A draft raised before a rate change and
-- issued after it must be issued at the new rate. So the rate is re-read when
-- the status leaves draft, and frozen from then on.
--
-- Freezing matters independently: invoices_update in 0002_rls.sql is
-- role-based with no column or status restriction, so without this a finance
-- user could PATCH vat_rate on an already-issued invoice and silently restate
-- it. The app's "issued invoices are immutable" rule is app-side only, by that
-- file's own admission.
--
-- Section 67A rate-specific rules — services actually performed before the
-- change date, correctly invoiced at the old rate — are the exception, and the
-- mechanism for them is to set vat_rate explicitly in the same statement that
-- issues the document, which the `is not distinct from` check below allows.

create or replace function fix_vat_rate_on_issue() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'draft' and new.status <> 'draft' then
    -- Leaving draft. Unless this same statement sets a rate deliberately, take
    -- the rate in force now rather than whatever the draft was created with.
    if new.vat_rate is not distinct from old.vat_rate then
      select o.vat_rate into new.vat_rate
        from organisations o
       where o.id = new.org_id;
    end if;
    return new;
  end if;

  if old.status <> 'draft' and new.vat_rate is distinct from old.vat_rate then
    raise exception 'The VAT rate is fixed once a document leaves draft.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists fix_vat_rate_on_issue_quotes on quotes;
create trigger fix_vat_rate_on_issue_quotes before update on quotes
  for each row execute function fix_vat_rate_on_issue();

drop trigger if exists fix_vat_rate_on_issue_invoices on invoices;
create trigger fix_vat_rate_on_issue_invoices before update on invoices
  for each row execute function fix_vat_rate_on_issue();

-- ---------------------------------------------------------------------
-- Range constraints
-- ---------------------------------------------------------------------
--
-- A rate is a percentage. 0 is legitimate — zero-rated supplies and exports
-- are charged at 0%, which is NOT the same as a line being non-vatable, so the
-- constraint has to admit it while still rejecting nonsense.
--
-- organisations.vat_rate is constrained too. It is the column the other two
-- are stamped from, and it was previously bounded only by numeric(5,2), which
-- permits 999.99. Constraining the copies but not the source would leave the
-- one value that feeds every document as the only unchecked one.

alter table quotes        drop constraint if exists quotes_vat_rate_range;
alter table invoices      drop constraint if exists invoices_vat_rate_range;
alter table organisations drop constraint if exists org_vat_rate_range;

alter table quotes
  add constraint quotes_vat_rate_range
    check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100));

alter table invoices
  add constraint invoices_vat_rate_range
    check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100));

alter table organisations
  add constraint org_vat_rate_range
    check (vat_rate >= 0 and vat_rate <= 100);

-- ---------------------------------------------------------------------
-- Letting the app ask whether the guarantee is actually in place
-- ---------------------------------------------------------------------
--
-- The Settings screen only unlocks the VAT rate field when changing the rate
-- is safe, and what makes it safe is these triggers — not the column. A column
-- without its triggers is reachable: a hand-run `alter table add column`, a
-- restored dump loaded with triggers disabled, a later `drop trigger`. In that
-- state every new document is inserted with a NULL rate, resolveVatRate falls
-- through to the live organisation rate, and the original bug is fully back
-- while the UI promises it cannot happen.
--
-- So the check is on the triggers themselves. This function existing at all
-- already proves the migration ran; what it adds is proof that the mechanism
-- survived. security definer because pg_trigger is catalog, not application
-- data, and the answer is a single boolean.

create or replace function vat_rate_snapshot_ready() returns boolean
language sql stable security definer set search_path = public, pg_catalog, pg_temp as $$
  select count(*) = 4
    from pg_trigger
   where not tgisinternal
     and tgname in (
       'stamp_vat_rate_quotes',
       'stamp_vat_rate_invoices',
       'fix_vat_rate_on_issue_quotes',
       'fix_vat_rate_on_issue_invoices'
     );
$$;

grant execute on function vat_rate_snapshot_ready() to authenticated;

-- No RLS change. Both tables already have policies covering the whole row, and
-- a new column on an existing table inherits them.
