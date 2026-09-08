-- ElonHub OS — foundation schema
-- Entities per spec §4, roles per §5. Single-tenant (one row in
-- organisations) but modelled as multi-tenant-ready from day one.

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type app_role as enum (
  'super_admin', 'director', 'sales_manager', 'salesperson',
  'project_manager', 'employee', 'finance', 'support_agent', 'hr', 'client'
);

create type lead_source as enum (
  'website', 'whatsapp', 'email', 'referral', 'social', 'phone', 'campaign', 'manual'
);

create type lead_status as enum ('new', 'contacted', 'qualified', 'disqualified', 'converted');

create type pipeline_stage as enum (
  'new', 'contacted', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost'
);

create type quote_status as enum ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired');

create type project_stage as enum (
  'discovery', 'planning', 'design', 'development', 'testing',
  'client_review', 'launch', 'handover', 'support'
);

create type task_status as enum ('todo', 'in_progress', 'blocked', 'done');

create type invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');

create type service_kind as enum ('once_off', 'recurring');

-- ---------------------------------------------------------------------
-- Organisation & people
-- ---------------------------------------------------------------------
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_number text,
  currency text not null default 'ZAR',
  vat_rate numeric(5, 2) not null default 15.00,
  created_at timestamptz not null default now()
);

-- One row per auth.users entry. Role lives here, not in a JWT claim, so
-- it can be changed by an admin without forcing a re-login.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organisations (id) on delete cascade,
  full_name text not null,
  role app_role not null default 'employee',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Audit log — every write to a tracked table lands here (§10).
-- ---------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references organisations (id),
  actor_id uuid references profiles (id),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_table_idx on audit_log (org_id, table_name, created_at desc);

create function audit_trigger_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_actor uuid := auth.uid();
begin
  v_org_id := coalesce(new.org_id, old.org_id);
  insert into audit_log (org_id, actor_id, table_name, record_id, action, before, after)
  values (
    v_org_id,
    v_actor,
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op in ('update', 'delete') then to_jsonb(old) else null end,
    case when tg_op in ('insert', 'update') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Customers & contacts
-- ---------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  legal_name text not null,
  trading_name text,
  registration_number text,
  vat_number text,
  industry text,
  website text,
  address text,
  owner_id uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  customer_id uuid references customers (id) on delete cascade,
  full_name text not null,
  role_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CRM: leads → opportunities
-- ---------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  reference text not null,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  source lead_source not null default 'manual',
  industry text,
  location text,
  owner_id uuid references profiles (id),
  score int not null default 0 check (score between 0 and 100),
  status lead_status not null default 'new',
  notes text,
  converted_opportunity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  lead_id uuid references leads (id),
  customer_id uuid references customers (id),
  name text not null,
  stage pipeline_stage not null default 'new',
  value numeric(12, 2) not null default 0,
  probability int not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid references profiles (id),
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leads
  add constraint leads_converted_opportunity_fk
  foreign key (converted_opportunity_id) references opportunities (id);

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category text,
  cost numeric(12, 2) not null default 0,
  sell_price numeric(12, 2) not null default 0,
  is_vatable boolean not null default true,
  kind service_kind not null default 'once_off',
  created_at timestamptz not null default now(),
  unique (org_id, sku)
);

-- ---------------------------------------------------------------------
-- Sales: quotes → sales orders
-- ---------------------------------------------------------------------
create table quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  opportunity_id uuid references opportunities (id),
  customer_id uuid not null references customers (id),
  number text not null,
  status quote_status not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_terms text,
  valid_until date,
  owner_id uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  service_id uuid references services (id),
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  discount_pct numeric(5, 2) not null default 0,
  is_vatable boolean not null default true,
  sort_order int not null default 0
);

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  quote_id uuid references quotes (id),
  customer_id uuid not null references customers (id),
  number text not null,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, number)
);

-- ---------------------------------------------------------------------
-- Delivery: projects, tasks, time entries
-- ---------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  sales_order_id uuid references sales_orders (id),
  customer_id uuid not null references customers (id),
  name text not null,
  code text not null,
  stage project_stage not null default 'discovery',
  manager_id uuid references profiles (id),
  start_date date,
  end_date date,
  budget_amount numeric(12, 2) not null default 0,
  estimated_hours numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  description text,
  assignee_id uuid references profiles (id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  estimated_hours numeric(10, 2),
  status task_status not null default 'todo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  task_id uuid references tasks (id),
  user_id uuid not null references profiles (id),
  entry_date date not null default current_date,
  hours numeric(6, 2) not null,
  billable boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Finance: invoices, payments
-- ---------------------------------------------------------------------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  customer_id uuid not null references customers (id),
  project_id uuid references projects (id),
  quote_id uuid references quotes (id),
  number text not null,
  status invoice_status not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  is_vatable boolean not null default true,
  sort_order int not null default 0
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations (id) on delete cascade,
  invoice_id uuid not null references invoices (id),
  amount numeric(12, 2) not null,
  paid_at date not null default current_date,
  method text,
  reference text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'customers', 'leads', 'opportunities', 'quotes',
    'projects', 'tasks', 'invoices'
  ] loop
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Audit triggers on the tables that matter for §10 (financial + CRM)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'leads', 'opportunities', 'quotes', 'invoices', 'payments', 'projects'
  ] loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on %1$I for each row execute function audit_trigger_fn()',
      t
    );
  end loop;
end $$;
