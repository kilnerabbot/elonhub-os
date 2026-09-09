-- Fix: 42P17 "infinite recursion detected in policy for relation".
--
-- projects_select contained `exists (select 1 from tasks ...)` while
-- tasks_select contained `exists (select 1 from projects ...)`. Each policy's
-- subquery triggers the other table's policy, so Postgres detects a cycle and
-- aborts the statement.
--
-- It surfaced on invoices because invoices_select is the one financial policy
-- that reaches into projects (the "a PM can see their project's invoices"
-- rule), which then enters the projects <-> tasks loop. Customers, leads,
-- quotes and opportunities never touch projects, which is why every other
-- module worked.
--
-- The cycle is broken the same way 0002_rls.sql already broke the
-- profiles-recurses-into-profiles trap: read the related table inside a
-- SECURITY DEFINER function, which runs as the function owner and therefore
-- does not re-enter RLS.

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Does the caller manage this project?
create or replace function manages_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projects
    where id = p_project_id
      and manager_id = auth.uid()
  );
$$;

-- Is the caller assigned a task on this project?
create or replace function works_on_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from tasks
    where project_id = p_project_id
      and assignee_id = auth.uid()
  );
$$;

-- These reveal only a boolean about the caller's own relationship to a
-- project, so they are safe to expose to authenticated users. Policies are
-- evaluated as the querying role, so EXECUTE is required.
grant execute on function manages_project(uuid) to authenticated;
grant execute on function works_on_project(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Projects — was recursing into tasks
-- ---------------------------------------------------------------------
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (
  org_id = auth_org_id()
  and (
    is_admin()
    or auth_role() = 'finance'
    or manager_id = auth.uid()
    or works_on_project(projects.id)
  )
);

-- ---------------------------------------------------------------------
-- Tasks — were recursing into projects
-- ---------------------------------------------------------------------
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select using (
  org_id = auth_org_id()
  and (
    is_admin()
    or auth_role() = 'finance'
    or assignee_id = auth.uid()
    or manages_project(tasks.project_id)
  )
);

drop policy if exists tasks_write on tasks;
create policy tasks_write on tasks for insert with check (
  org_id = auth_org_id()
  and (auth_role() = 'super_admin' or manages_project(tasks.project_id))
);

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (
  auth_role() = 'super_admin'
  or assignee_id = auth.uid()
  or manages_project(tasks.project_id)
);

drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (
  auth_role() = 'super_admin'
  or manages_project(tasks.project_id)
);

-- ---------------------------------------------------------------------
-- Time entries and invoices — entered the loop through projects
-- ---------------------------------------------------------------------
drop policy if exists time_entries_select on time_entries;
create policy time_entries_select on time_entries for select using (
  org_id = auth_org_id()
  and (
    is_admin()
    or auth_role() = 'finance'
    or user_id = auth.uid()
    or manages_project(time_entries.project_id)
  )
);

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select using (
  org_id = auth_org_id()
  and (
    is_admin()
    or auth_role() = 'finance'
    or (invoices.project_id is not null and manages_project(invoices.project_id))
  )
);

-- ---------------------------------------------------------------------
-- Sanity check: each of these should return without a 42P17.
-- ---------------------------------------------------------------------
-- select count(*) from projects;
-- select count(*) from tasks;
-- select count(*) from invoices;
-- select count(*) from time_entries;
