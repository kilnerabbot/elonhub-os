-- ElonHub OS — new-user bootstrap + initial organisation.
-- Single-tenant: every signup joins the one seeded organisation. The
-- first person to sign up becomes super_admin; everyone after that
-- starts as employee and gets promoted by an admin from the team screen.

insert into organisations (name, vat_number, currency, vat_rate)
values ('Elon Hub Technologies', null, 'ZAR', 15.00);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_is_first boolean;
begin
  select id into v_org_id from organisations order by created_at limit 1;
  select not exists (select 1 from profiles where org_id = v_org_id) into v_is_first;

  insert into profiles (id, org_id, full_name, role)
  values (
    new.id,
    v_org_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when v_is_first then 'super_admin' else 'employee' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Prevent a non-admin from granting themselves (or anyone) a higher role
-- through a client-side profile update — role changes must come through
-- an admin action, which this trigger still allows.
create function prevent_role_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and auth_role() <> 'super_admin' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger guard_role_change
  before update on profiles
  for each row execute function prevent_role_escalation();
