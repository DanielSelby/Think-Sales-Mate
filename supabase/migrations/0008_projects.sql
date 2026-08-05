-- SalesMate ERP — Projects module (v1).
-- Depends on 0001_core_schema.sql. customer_id optionally links to the CRM
-- module (0004_crm.sql) if a project is tied to a specific customer.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'planning' check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  budget numeric(12, 2),
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects: members can read"
  on public.projects for select
  using (public.is_org_member(org_id));

create policy "projects: staff can create"
  on public.projects for insert
  with check (public.has_org_role(org_id, 'staff') and created_by = auth.uid());

create policy "projects: managers can update"
  on public.projects for update
  using (public.has_org_role(org_id, 'manager'));

create policy "projects: managers can delete"
  on public.projects for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_projects_org on public.projects(org_id);