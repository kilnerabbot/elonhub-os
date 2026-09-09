-- Support desk.
--
-- 0001_init.sql never created these tables, so the Support module had no
-- schema at all. Modelled on how the work actually arrives at a Johannesburg
-- agency: a client messages on WhatsApp or email, an agent logs it, and the
-- thread carries both client-visible replies and internal notes.

create type ticket_status as enum ('open', 'pending', 'on_hold', 'resolved', 'closed');
create type ticket_channel as enum ('whatsapp', 'email', 'phone', 'portal', 'in_person');

create table tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  number text not null,
  -- Nullable: not every ticket comes from a customer on the books. An
  -- enquiry can arrive before the company exists as a record.
  customer_id uuid references customers (id),
  project_id uuid references projects (id),
  subject text not null,
  description text,
  status ticket_status not null default 'open',
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  channel ticket_channel not null default 'whatsapp',
  -- Who reported it, when they are not a profile in this system.
  requester_name text,
  requester_email text,
  requester_phone text,
  assignee_id uuid references profiles (id),
  opened_at timestamptz not null default now(),
  -- Stamped by the first client-visible staff reply. Null means nobody has
  -- responded yet, which is what the SLA check keys off.
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);

create index tickets_status_idx on tickets (org_id, status);
create index tickets_assignee_idx on tickets (assignee_id);

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets (id) on delete cascade,
  author_id uuid references profiles (id),
  body text not null,
  -- Internal notes stay inside the team. They share a table with client
  -- replies so the thread reads in one chronological order, which is how
  -- an agent actually needs to read it.
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index ticket_messages_ticket_idx on ticket_messages (ticket_id, created_at);

-- ---------------------------------------------------------------------
-- Triggers, matching the conventions in 0001_init.sql
-- ---------------------------------------------------------------------
create trigger set_updated_at before update on tickets
  for each row execute function set_updated_at();

create trigger audit_tickets after insert or update or delete on tickets
  for each row execute function audit_trigger_fn();

-- ---------------------------------------------------------------------
-- RLS
--
-- support_agent has full access to the desk; that is the role's entire
-- purpose. Admins see everything. Anyone assigned a ticket can work it even
-- without the support role, because agencies reassign to whoever owns the
-- account.
-- ---------------------------------------------------------------------
alter table tickets enable row level security;
alter table ticket_messages enable row level security;

create policy tickets_select on tickets for select using (
  org_id = auth_org_id()
  and (
    is_admin()
    or auth_role() = 'support_agent'
    or assignee_id = auth.uid()
  )
);

create policy tickets_write on tickets for insert with check (
  org_id = auth_org_id()
  and auth_role() in ('super_admin', 'director', 'support_agent')
);

create policy tickets_update on tickets for update using (
  org_id = auth_org_id()
  and (
    auth_role() in ('super_admin', 'support_agent')
    or assignee_id = auth.uid()
  )
);

create policy tickets_delete on tickets for delete using (
  auth_role() = 'super_admin'
);

-- Messages inherit the parent ticket's visibility. The subquery reads tickets,
-- whose policy does not read ticket_messages back, so there is no cycle of the
-- kind 0005 had to repair.
create policy ticket_messages_select on ticket_messages for select using (
  exists (select 1 from tickets t where t.id = ticket_messages.ticket_id)
);

create policy ticket_messages_write on ticket_messages for insert with check (
  exists (select 1 from tickets t where t.id = ticket_messages.ticket_id)
);

create policy ticket_messages_update on ticket_messages for update using (
  author_id = auth.uid() or auth_role() = 'super_admin'
);

create policy ticket_messages_delete on ticket_messages for delete using (
  auth_role() = 'super_admin'
);

-- ---------------------------------------------------------------------
-- Sanity check
-- ---------------------------------------------------------------------
-- select count(*) from tickets;
-- select count(*) from ticket_messages;
