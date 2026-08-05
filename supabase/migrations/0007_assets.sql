-- SalesMate ERP — Assets module (v1): a fixed-asset register.
-- Depends on 0001_core_schema.sql.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  purchase_date date not null default current_date,
  purchase_cost numeric(12, 2) not null default 0 check (purchase_cost >= 0),
  current_value numeric(12, 2) not null default 0 check (current_value >= 0),
  status text not null default 'in_use' check (status in ('in_use', 'under_repair', 'disposed')),
  location text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "assets: members can read"
  on public.assets for select
  using (public.is_org_member(org_id));

create policy "assets: managers can create"
  on public.assets for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create policy "assets: managers can update"
  on public.assets for update
  using (public.has_org_role(org_id, 'manager'));

create policy "assets: managers can delete"
  on public.assets for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_assets_org on public.assets(org_id);