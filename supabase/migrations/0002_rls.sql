-- ElonHub OS — row-level security, mapped from spec §5's RBAC matrix.
-- Two SECURITY DEFINER helpers avoid the classic "RLS policy on profiles
-- recurses into profiles" trap: they read the caller's own row once,
-- as the function owner, before any policy on the calling query evaluates.

create function auth_role() returns app_role
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create function auth_org_id() returns uuid
language sql security definer stable set search_path = public as $$
  select org_id from profiles where id = auth.uid();
$$;

create function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select auth_role() in ('super_admin', 'director');
$$;

alter table organisations enable row level security;
alter table profiles enable row level security;
alter table audit_log enable row level security;
alter table customers enable row level security;
alter table contacts enable row level security;
alter table leads enable row level security;
alter table opportunities enable row level security;
alter table services enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table sales_orders enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table time_entries enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;

-- ---------------------------------------------------------------------
-- Organisations & profiles
-- ---------------------------------------------------------------------
create policy org_select on organisations for select using (id = auth_org_id());
create policy org_update on organisations for update using (auth_role() = 'super_admin');

create policy profiles_select on profiles for select using (org_id = auth_org_id());
create policy profiles_update_self on profiles for update
  using (id = auth.uid() or auth_role() = 'super_admin');
create policy profiles_delete on profiles for delete using (auth_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Customers & contacts — §5: full for sales_manager/finance, own for
-- salesperson, read-all for admin roles.
-- ---------------------------------------------------------------------
create policy customers_select on customers for select using (
  org_id = auth_org_id()
  and (is_admin() or auth_role() in ('sales_manager', 'finance') or owner_id = auth.uid())
);
create policy customers_write on customers for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'salesperson')
);
create policy customers_update on customers for update using (
  org_id = auth_org_id()
  and (auth_role() in ('super_admin', 'sales_manager') or owner_id = auth.uid())
);
create policy customers_delete on customers for delete using (
  auth_role() in ('super_admin', 'sales_manager')
);

create policy contacts_select on contacts for select using (org_id = auth_org_id());
create policy contacts_write on contacts for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'salesperson')
);
create policy contacts_update on contacts for update using (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'salesperson')
);
create policy contacts_delete on contacts for delete using (
  auth_role() in ('super_admin', 'sales_manager')
);

-- ---------------------------------------------------------------------
-- Leads & opportunities — own for salesperson, full for sales_manager.
-- ---------------------------------------------------------------------
create policy leads_select on leads for select using (
  org_id = auth_org_id()
  and (is_admin() or auth_role() in ('sales_manager', 'finance') or owner_id = auth.uid())
);
create policy leads_write on leads for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'salesperson')
);
create policy leads_update on leads for update using (
  org_id = auth_org_id()
  and (auth_role() in ('super_admin', 'sales_manager') or owner_id = auth.uid())
);
create policy leads_delete on leads for delete using (
  auth_role() in ('super_admin', 'sales_manager')
);

create policy opportunities_select on opportunities for select using (
  org_id = auth_org_id()
  and (is_admin() or auth_role() in ('sales_manager', 'finance') or owner_id = auth.uid())
);
create policy opportunities_write on opportunities for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'salesperson')
);
create policy opportunities_update on opportunities for update using (
  org_id = auth_org_id()
  and (auth_role() in ('super_admin', 'sales_manager') or owner_id = auth.uid())
);
create policy opportunities_delete on opportunities for delete using (
  auth_role() in ('super_admin', 'sales_manager')
);

-- ---------------------------------------------------------------------
-- Catalogue — everyone in the org can read it (needed to build a quote);
-- only sales/finance leadership can change prices.
-- ---------------------------------------------------------------------
create policy services_select on services for select using (org_id = auth_org_id());
create policy services_write on services for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance')
);
create policy services_update on services for update using (
  auth_role() in ('super_admin', 'sales_manager', 'finance')
);
create policy services_delete on services for delete using (
  auth_role() in ('super_admin', 'sales_manager', 'finance')
);

-- ---------------------------------------------------------------------
-- Quotes — §5: sales_manager full, salesperson own, finance full.
-- ---------------------------------------------------------------------
create policy quotes_select on quotes for select using (
  org_id = auth_org_id()
  and (is_admin() or auth_role() in ('sales_manager', 'finance') or owner_id = auth.uid())
);
create policy quotes_write on quotes for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'salesperson', 'finance')
);
create policy quotes_update on quotes for update using (
  org_id = auth_org_id()
  and (auth_role() in ('super_admin', 'sales_manager', 'finance') or owner_id = auth.uid())
);
create policy quotes_delete on quotes for delete using (
  auth_role() in ('super_admin', 'sales_manager')
);

create policy quote_items_select on quote_items for select using (
  exists (select 1 from quotes q where q.id = quote_items.quote_id)
);
create policy quote_items_write on quote_items for insert with check (
  exists (
    select 1 from quotes q where q.id = quote_items.quote_id
    and (auth_role() in ('super_admin', 'sales_manager', 'finance') or q.owner_id = auth.uid())
  )
);
create policy quote_items_update on quote_items for update using (
  exists (
    select 1 from quotes q where q.id = quote_items.quote_id
    and (auth_role() in ('super_admin', 'sales_manager', 'finance') or q.owner_id = auth.uid())
  )
);
create policy quote_items_delete on quote_items for delete using (
  exists (
    select 1 from quotes q where q.id = quote_items.quote_id
    and (auth_role() in ('super_admin', 'sales_manager', 'finance') or q.owner_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------
-- Sales orders — finance & sales leadership write, PMs can read theirs.
-- ---------------------------------------------------------------------
create policy sales_orders_select on sales_orders for select using (
  org_id = auth_org_id()
  and (is_admin() or auth_role() in ('sales_manager', 'finance', 'project_manager'))
);
create policy sales_orders_write on sales_orders for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'sales_manager', 'finance')
);
create policy sales_orders_update on sales_orders for update using (
  auth_role() in ('super_admin', 'sales_manager', 'finance')
);

-- ---------------------------------------------------------------------
-- Projects — §5: PM owns their projects, employees see what they're on.
-- ---------------------------------------------------------------------
create policy projects_select on projects for select using (
  org_id = auth_org_id()
  and (
    is_admin() or auth_role() = 'finance' or manager_id = auth.uid()
    or exists (select 1 from tasks t where t.project_id = projects.id and t.assignee_id = auth.uid())
  )
);
create policy projects_write on projects for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'project_manager')
);
create policy projects_update on projects for update using (
  auth_role() = 'super_admin' or manager_id = auth.uid()
);
create policy projects_delete on projects for delete using (auth_role() = 'super_admin');

create policy tasks_select on tasks for select using (
  org_id = auth_org_id()
  and (
    is_admin() or auth_role() = 'finance' or assignee_id = auth.uid()
    or exists (select 1 from projects p where p.id = tasks.project_id and p.manager_id = auth.uid())
  )
);
create policy tasks_write on tasks for insert with check (
  org_id = auth_org_id()
  and (
    auth_role() = 'super_admin'
    or exists (select 1 from projects p where p.id = tasks.project_id and p.manager_id = auth.uid())
  )
);
create policy tasks_update on tasks for update using (
  auth_role() = 'super_admin'
  or assignee_id = auth.uid()
  or exists (select 1 from projects p where p.id = tasks.project_id and p.manager_id = auth.uid())
);
create policy tasks_delete on tasks for delete using (
  auth_role() = 'super_admin'
  or exists (select 1 from projects p where p.id = tasks.project_id and p.manager_id = auth.uid())
);

create policy time_entries_select on time_entries for select using (
  org_id = auth_org_id()
  and (
    is_admin() or auth_role() = 'finance' or user_id = auth.uid()
    or exists (select 1 from projects p where p.id = time_entries.project_id and p.manager_id = auth.uid())
  )
);
create policy time_entries_write on time_entries for insert with check (
  org_id = auth_org_id() and (user_id = auth.uid() or auth_role() = 'super_admin')
);
create policy time_entries_update on time_entries for update using (
  user_id = auth.uid() or auth_role() = 'super_admin'
);
create policy time_entries_delete on time_entries for delete using (
  user_id = auth.uid() or auth_role() = 'super_admin'
);

-- ---------------------------------------------------------------------
-- Finance — §5 & §10: Finance role full, PM can view their own
-- project's invoices, admin roles read all. Invoices are otherwise
-- immutable once sent (§10) — enforced in application code, not here,
-- since RLS can't easily express "only these columns, only if draft".
-- ---------------------------------------------------------------------
create policy invoices_select on invoices for select using (
  org_id = auth_org_id()
  and (
    is_admin() or auth_role() = 'finance'
    or exists (select 1 from projects p where p.id = invoices.project_id and p.manager_id = auth.uid())
  )
);
create policy invoices_write on invoices for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'finance')
);
create policy invoices_update on invoices for update using (
  auth_role() in ('super_admin', 'finance')
);
create policy invoices_delete on invoices for delete using (auth_role() = 'super_admin');

create policy invoice_items_select on invoice_items for select using (
  exists (select 1 from invoices i where i.id = invoice_items.invoice_id)
);
create policy invoice_items_write on invoice_items for insert with check (
  auth_role() in ('super_admin', 'finance')
);
create policy invoice_items_update on invoice_items for update using (
  auth_role() in ('super_admin', 'finance')
);
create policy invoice_items_delete on invoice_items for delete using (
  auth_role() in ('super_admin', 'finance')
);

create policy payments_select on payments for select using (
  org_id = auth_org_id() and (is_admin() or auth_role() = 'finance')
);
create policy payments_write on payments for insert with check (
  org_id = auth_org_id() and auth_role() in ('super_admin', 'finance')
);
create policy payments_update on payments for update using (
  auth_role() in ('super_admin', 'finance')
);
create policy payments_delete on payments for delete using (auth_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Audit log — read-only, admin roles only. Rows are written exclusively
-- by audit_trigger_fn() (table owner, bypasses RLS) — no client can
-- write or forge an entry.
-- ---------------------------------------------------------------------
create policy audit_log_select on audit_log for select using (
  org_id = auth_org_id() and is_admin()
);
