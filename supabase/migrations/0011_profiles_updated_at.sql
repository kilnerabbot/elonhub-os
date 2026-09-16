-- ElonHub OS — give profiles the updated_at column its trigger already writes.
--
-- THIS MIGRATION IS REQUIRED. Unlike 0009 and 0010, the application cannot
-- work around it: changing anyone's role fails until this is applied.
--
-- 0001_init.sql attaches set_updated_at BEFORE UPDATE to eight tables:
--
--   profiles, customers, leads, opportunities, quotes, projects, tasks,
--   invoices
--
-- Seven of them have an updated_at column. profiles does not — it was created
-- with created_at only. The trigger body is `new.updated_at = now()`, and
-- assigning to a field a record does not have raises
--
--   record "new" has no field "updated_at"
--
-- with SQLSTATE 42703. It fires before any policy is consulted and before any
-- row is written, so EVERY update to profiles has failed since the schema was
-- created. The only update path in the application is changing a team member's
-- role, which is why that is the shape the bug took: an administrator could
-- never change anyone's role, and no amount of correcting the application code
-- was going to help.
--
-- It stayed hidden because the error was swallowed. Until 77f1cbb every failed
-- write reported "Could not save. Please try again.", and the role control
-- reported success regardless. Only once the SQLSTATE was surfaced in the
-- message did the cause become a one-step lookup.
--
-- Adding the column is preferred over dropping the trigger from profiles. The
-- trigger list clearly intends profiles to be covered, and knowing when a
-- profile last changed is worth having on the table that carries roles.

alter table profiles
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows take the default, so no backfill is needed: `now()` is not
-- when they were really last touched, but nothing has ever successfully
-- updated one, so created_at would be no more accurate.
