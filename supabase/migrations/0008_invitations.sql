-- Let an admin add team members.
--
-- Deliberately NOT built on supabase.auth.admin.inviteUserByEmail(), which
-- needs the service_role key deployed to the app. That key bypasses RLS on
-- every table, so shipping it to Vercel to save a copy-paste would trade the
-- entire access-control model for a convenience.
--
-- Instead an admin pre-registers an email and a role. The person signs up
-- through the normal form and handle_new_user picks up the invitation, so they
-- land already holding the right role instead of arriving as an employee and
-- waiting to be promoted.

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  email text not null,
  full_name text,
  role app_role not null default 'employee',
  invited_by uuid references profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: nobody should be able to hold two pending
-- invitations by capitalising their address differently.
create unique index invitations_org_email_idx on invitations (org_id, lower(email));
create index invitations_email_idx on invitations (lower(email)) where accepted_at is null;

alter table invitations enable row level security;

-- Reading who has been invited is a leadership matter; issuing one is not.
-- Only super_admin writes, because an invitation sets a role and would
-- otherwise be a way around prevent_role_escalation.
create policy invitations_select on invitations for select using (
  org_id = auth_org_id() and is_admin()
);

create policy invitations_write on invitations for insert with check (
  org_id = auth_org_id() and auth_role() = 'super_admin'
);

create policy invitations_delete on invitations for delete using (
  org_id = auth_org_id() and auth_role() = 'super_admin'
);

-- ---------------------------------------------------------------------
-- handle_new_user, extended
--
-- Preserves both existing behaviours exactly:
--   * the first person to sign up becomes super_admin
--   * everyone else defaults to employee
-- and adds a third: an invited address takes the invited role.
--
-- Both branches cast explicitly to app_role. A CASE expression resolves to
-- text, and Postgres refuses to cast a CASE-derived text into an enum column —
-- that is the 42804 bug 0004 had to repair, so it is not reintroduced here.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_is_first boolean;
  v_role app_role;
  v_name text;
  v_invite invitations%rowtype;
begin
  select id into v_org from organisations order by created_at limit 1;
  select count(*) = 0 into v_is_first from profiles;

  select * into v_invite
    from invitations
   where lower(email) = lower(new.email)
     and accepted_at is null
   order by created_at
   limit 1;

  if v_invite.id is not null then
    v_role := v_invite.role;
    v_org := coalesce(v_invite.org_id, v_org);
    v_name := coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      v_invite.full_name,
      new.email
    );
    update invitations set accepted_at = now() where id = v_invite.id;
  else
    v_role := case when v_is_first then 'super_admin'::app_role else 'employee'::app_role end;
    v_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  end if;

  insert into profiles (id, org_id, full_name, role)
  values (new.id, v_org, v_name, v_role);

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Sanity check
-- ---------------------------------------------------------------------
-- select count(*) from invitations;
-- select prosecdef from pg_proc where proname = 'handle_new_user';
