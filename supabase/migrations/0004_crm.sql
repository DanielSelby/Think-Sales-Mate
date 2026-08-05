-- SalesMate ERP — CRM module (v1): a customer directory.
-- Depends on 0001_core_schema.sql. Standalone for now — Sales and Invoices
-- still take a free-text customer name; linking them to this table is a
-- natural follow-up once this module is confirmed working.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "customers: members can read"
  on public.customers for select
  using (public.is_org_member(org_id));

create policy "customers: staff can create"
  on public.customers for insert
  with check (public.has_org_role(org_id, 'staff') and created_by = auth.uid());

create policy "customers: managers can update"
  on public.customers for update
  using (public.has_org_role(org_id, 'manager'));

create policy "customers: managers can delete"
  on public.customers for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_customers_org on public.customers(org_id);
create index idx_customers_org_name on public.customers(org_id, name);