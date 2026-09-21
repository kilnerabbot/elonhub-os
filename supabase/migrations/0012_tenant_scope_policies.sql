-- ElonHub OS — put the organisation back into the policies that lost it.
--
-- PREREQUISITES: 0001, 0002, 0005 and 0007. Every statement below rewrites a
-- policy those files created, so this will fail loudly and name the missing
-- one if they have not been applied. That is deliberate — a silently skipped
-- policy would leave exactly the hole this migration exists to close.
--
-- The schema is modelled multi-tenant from day one: every principal table
-- carries org_id and the SELECT policies all check `org_id = auth_org_id()`.
-- The UPDATE and DELETE policies mostly do not. They check the caller's ROLE
-- and stop there, so a super_admin, sales_manager or finance user of one
-- organisation can modify or delete rows belonging to another.
--
-- Nothing exploits this today: 0003 seeds a single organisation and
-- handle_new_user pins every signup to it. It becomes real the moment a second
-- trading entity exists, and a cross-tenant write is far harder to notice
-- after the fact than to prevent now. 0009 already made this argument for
-- organisations and fixed org_update the same way.
--
-- Two other things are fixed while here, because they are the same omission
-- wearing a different hat:
--
--   * invoice_items_write, _update and _delete check only the caller's role.
--     Unlike invoice_items_select they never look at the parent invoice, so a
--     finance user can add or remove line items on ANY invoice id — another
--     organisation's, or one that has already been issued. Invoice
--     immutability after issue was enforced in application code only, as
--     0002_rls.sql says outright, so the database had no opinion at all about
--     line items on a sent invoice. The parent check below carries `status =
--     'draft'` for that reason: the parent alone is not enough, since
--     invoices_select happily returns a sent invoice to finance. Every
--     application path already refuses to touch a non-draft invoice, so this
--     only removes a capability nothing legitimate was using.
--
--   * ticket_messages_update and _delete have the same shape.
--
-- Those three tables carry no org_id of their own, so they are scoped through
-- their parent. A subquery inside a policy is itself subject to the parent
-- table's RLS for the calling user, so `exists (select 1 from invoices i ...)`
-- inherits invoices_select, which is org-scoped. That is the same mechanism
-- quote_items and ticket_messages_select already rely on.
--
-- WITH CHECK is spelled out on every UPDATE policy rather than left to
-- default. Postgres already defaults it to the USING expression, so this
-- changes no behaviour, but it means the next person to edit a USING clause
-- cannot accidentally leave the write side open by not knowing that rule.
-- Including org_id in it is what stops a row being moved BETWEEN
-- organisations, which the USING clause alone would still allow.

-- Wrapped in a transaction on purpose. This is meant to fail loudly and name
-- the missing policy when a prerequisite has not been applied, but a failure
-- halfway through would leave a security migration partly applied with no
-- record of where it stopped. Atomic means a failed run changes nothing.
begin;

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------

-- Repeated verbatim from 0009. That migration is optional by design and may
-- not have been run, and without it org_update still checks only the role,
-- leaving the banking details printed on every invoice writable by a super
-- admin of any organisation. alter policy is idempotent, so this is harmless
-- where 0009 has already been applied.
alter policy org_update on organisations
  using      (id = auth_org_id() and auth_role() = 'super_admin')
  with check (id = auth_org_id() and auth_role() = 'super_admin');

alter policy profiles_update_self on profiles
  using      (org_id = auth_org_id() and (id = auth.uid() or auth_role() = 'super_admin'))
  with check (org_id = auth_org_id() and (id = auth.uid() or auth_role() = 'super_admin'));

alter policy profiles_delete on profiles
  using (org_id = auth_org_id() and auth_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Customers, contacts, leads, opportunities
-- ---------------------------------------------------------------------

alter policy customers_delete on customers
  using (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager'));

alter policy contacts_delete on contacts
  using (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager'));

alter policy leads_delete on leads
  using (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager'));

alter policy opportunities_delete on opportunities
  using (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager'));

-- ---------------------------------------------------------------------
-- Catalogue and quotes
-- ---------------------------------------------------------------------

alter policy services_update on services
  using      (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance'))
  with check (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance'));

alter policy services_delete on services
  using (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance'));

alter policy quotes_delete on quotes
  using (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager'));

alter policy sales_orders_update on sales_orders
  using      (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance'))
  with check (org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance'));

-- ---------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------

alter policy projects_update on projects
  using      (org_id = auth_org_id() and (auth_role() = 'super_admin' or manager_id = auth.uid()))
  with check (org_id = auth_org_id() and (auth_role() = 'super_admin' or manager_id = auth.uid()));

alter policy projects_delete on projects
  using (org_id = auth_org_id() and auth_role() = 'super_admin');

-- manages_project() is the SECURITY DEFINER helper 0005 introduced to break
-- the projects/tasks policy recursion. Kept exactly as 0005 left it.
alter policy tasks_update on tasks
  using (
    org_id = auth_org_id()
    and (
      auth_role() = 'super_admin'
      or assignee_id = auth.uid()
      or manages_project(tasks.project_id)
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      auth_role() = 'super_admin'
      or assignee_id = auth.uid()
      or manages_project(tasks.project_id)
    )
  );

alter policy tasks_delete on tasks
  using (
    org_id = auth_org_id()
    and (auth_role() = 'super_admin' or manages_project(tasks.project_id))
  );

alter policy time_entries_update on time_entries
  using      (org_id = auth_org_id() and (user_id = auth.uid() or auth_role() = 'super_admin'))
  with check (org_id = auth_org_id() and (user_id = auth.uid() or auth_role() = 'super_admin'));

alter policy time_entries_delete on time_entries
  using (org_id = auth_org_id() and (user_id = auth.uid() or auth_role() = 'super_admin'));

-- ---------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------

alter policy invoices_update on invoices
  using      (org_id = auth_org_id() and auth_role() in ('super_admin', 'finance'))
  with check (org_id = auth_org_id() and auth_role() in ('super_admin', 'finance'));

alter policy invoices_delete on invoices
  using (org_id = auth_org_id() and auth_role() = 'super_admin');

-- invoice_items has no org_id. Scoped through the parent invoice, whose own
-- policy is org-scoped, which also stops line items being attached to an
-- invoice the caller cannot see.
alter policy invoice_items_write on invoice_items
  with check (
    auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from invoices i
       where i.id = invoice_items.invoice_id and i.status = 'draft'
    )
  );

alter policy invoice_items_update on invoice_items
  using (
    auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from invoices i
       where i.id = invoice_items.invoice_id and i.status = 'draft'
    )
  )
  with check (
    auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from invoices i
       where i.id = invoice_items.invoice_id and i.status = 'draft'
    )
  );

alter policy invoice_items_delete on invoice_items
  using (
    auth_role() in ('super_admin', 'finance')
    and exists (
      select 1 from invoices i
       where i.id = invoice_items.invoice_id and i.status = 'draft'
    )
  );

alter policy payments_update on payments
  using      (org_id = auth_org_id() and auth_role() in ('super_admin', 'finance'))
  with check (org_id = auth_org_id() and auth_role() in ('super_admin', 'finance'));

alter policy payments_delete on payments
  using (org_id = auth_org_id() and auth_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Support (0007)
-- ---------------------------------------------------------------------

alter policy tickets_delete on tickets
  using (org_id = auth_org_id() and auth_role() = 'super_admin');

-- ticket_messages has no org_id either, and its update and delete policies
-- never looked at the parent ticket.
alter policy ticket_messages_update on ticket_messages
  using (
    (author_id = auth.uid() or auth_role() = 'super_admin')
    and exists (select 1 from tickets t where t.id = ticket_messages.ticket_id)
  )
  with check (
    (author_id = auth.uid() or auth_role() = 'super_admin')
    and exists (select 1 from tickets t where t.id = ticket_messages.ticket_id)
  );

alter policy ticket_messages_delete on ticket_messages
  using (
    auth_role() = 'super_admin'
    and exists (select 1 from tickets t where t.id = ticket_messages.ticket_id)
  );

commit;
