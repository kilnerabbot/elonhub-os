-- Fix: handle_new_user()'s CASE expression resolved to text, and Postgres
-- does not implicitly cast a CASE-derived text value into the app_role
-- enum column (only untyped string literals get that implicit cast).
-- Every signup failed with "Database error saving new user" until this
-- was applied. Cast each branch explicitly.

create or replace function handle_new_user() returns trigger
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
    case when v_is_first then 'super_admin'::app_role else 'employee'::app_role end
  );
  return new;
end;
$$;
