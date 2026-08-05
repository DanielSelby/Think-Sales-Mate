-- SalesMate ERP — Business locations / branches.
-- Lets an organization register multiple physical branches (shops,
-- warehouses, offices) it operates. Scoped to org_id like every other
-- table; RLS follows the same member/role pattern as organizations.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Business locations
-- ─────────────────────────────────────────────────────────────────────────
create table public.business_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  city text,
  region text,
  country text,
  phone text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.business_locations enable row level security;

-- Members can see every branch in their org.
create policy "locations: members can read"
  on public.business_locations for select
  using (public.is_org_member(org_id));

-- Managers and above can create/update/delete branches (mirrors the
-- "manager" floor used for inventory.manage / accounting.manage elsewhere).
create policy "locations: managers can create"
  on public.business_locations for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create policy "locations: managers can update"
  on public.business_locations for update
  using (public.has_org_role(org_id, 'manager'));

create policy "locations: managers can delete"
  on public.business_locations for delete
  using (public.has_org_role(org_id, 'manager'));

-- Only one primary location per org.
create unique index idx_business_locations_one_primary
  on public.business_locations(org_id)
  where is_primary;

create index idx_business_locations_org on public.business_locations(org_id);