-- ElonHub OS — an organisation must keep at least one super admin.
--
-- PREREQUISITE: 0011, because this trigger fires on updates to profiles and
-- every such update currently fails on the missing updated_at column anyway.
--
-- updateRole lets a super admin demote anybody, including themselves and
-- including the last one. prevent_role_escalation does not stop it: that
-- trigger only reverts changes made BY a non-super-admin, and this is a super
-- admin acting within their rights. The result is an organisation nobody can
-- administer — roles, team membership, invitations and company details are all
-- super_admin-only, so recovery means the service-role key or the SQL editor.
--
-- The guard lives in the database rather than in the server action because the
-- action is not the only way in. The SQL editor, a script holding the service
-- role key, and any future code path all bypass application checks; none of
-- them bypass a trigger.
--
-- A CONSTRAINT TRIGGER deferred to commit, not a plain row trigger, so that a
-- transaction which hands the role over — demote one, promote another — is
-- judged on where it ends rather than failing halfway through. A plain AFTER
-- trigger would reject the demotion before the promotion had happened.

create or replace function prevent_last_super_admin_removal() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- OLD is assigned on both UPDATE and DELETE. The organisation at risk is
  -- always the one the row is LEAVING, never the one it arrives at: reading
  -- new.org_id would check the destination for an administrator it never lost,
  -- and an update that moved the last super admin to another organisation
  -- would sail through while draining the one behind it.
  v_org uuid;
begin
  v_org := old.org_id;

  -- Only a super admin ceasing to be one, HERE, can breach this.
  if old.role <> 'super_admin' then
    return null;
  end if;
  -- Still a super admin of the same organisation: nothing was taken away. The
  -- org_id comparison is what stops a relocation with no role change at all
  -- from slipping past this early return.
  if tg_op = 'UPDATE' and new.role = 'super_admin' and new.org_id = old.org_id then
    return null;
  end if;

  -- If the organisation itself is going away, there is nothing to protect.
  -- Without this, deleting an organisation would fail: profiles cascade from
  -- it, and the check below would find no remaining super admin.
  if not exists (select 1 from organisations where id = v_org) then
    return null;
  end if;

  -- security definer, so this counts every profile in the organisation rather
  -- than only the ones the caller happens to be able to see.
  if not exists (
    select 1 from profiles where org_id = v_org and role = 'super_admin'
  ) then
    raise exception 'An organisation must keep at least one super admin.'
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists keep_one_super_admin on profiles;
create constraint trigger keep_one_super_admin
  after update or delete on profiles
  deferrable initially deferred
  for each row execute function prevent_last_super_admin_removal();
