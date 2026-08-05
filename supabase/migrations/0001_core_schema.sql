-- SalesMate ERP — Core schema: profiles, organizations, membership/RBAC, audit log.
-- Run against a fresh Supabase project. Safe to run once; re-running will error
-- on existing objects (by design, so you notice a re-run attempt).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Profiles (mirrors auth.users, holds app-level user data)
-- ─────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: user reads own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: user updates own row"
  on public.profiles for update
  using (id = auth.uid());

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Organizations (tenants)
-- ─────────────────────────────────────────────────────────────────────────
create type public.org_plan as enum ('trial', 'starter', 'growth', 'enterprise');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan public.org_plan not null default 'trial',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Membership + RBAC
--    Role hierarchy: owner > admin > manager > staff > viewer
--    Each module (POS, accounting, HRM, ...) can layer its own finer-grained
--    permission checks on top of this table later; this is the tenant gate.
-- ─────────────────────────────────────────────────────────────────────────
create type public.member_role as enum ('owner', 'admin', 'manager', 'staff', 'viewer');
create type public.member_status as enum ('invited', 'active', 'suspended');

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role public.member_role not null default 'staff',
  status public.member_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

alter table public.organization_members enable row level security;

-- Helper: does the current user belong to this org (any role, active only)?
create function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- Helper: does the current user have at least this role level in the org?
create function public.has_org_role(target_org_id uuid, min_role public.member_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and status = 'active'
      and case min_role
        when 'viewer'  then role in ('owner','admin','manager','staff','viewer')
        when 'staff'   then role in ('owner','admin','manager','staff')
        when 'manager' then role in ('owner','admin','manager')
        when 'admin'   then role in ('owner','admin')
        when 'owner'   then role = 'owner'
      end
  );
$$;

-- Organizations: visible to members; created rows always start with the
-- creator as owner (handled in the app-layer signup flow, see lib/organizations).
create policy "organizations: members can read"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "organizations: admins can update"
  on public.organizations for update
  using (public.has_org_role(id, 'admin'));

create policy "organizations: authenticated users can create"
  on public.organizations for insert
  with check (created_by = auth.uid());

-- Membership rows: members can see their org roster; only admins+ manage it.
create policy "members: read own org roster"
  on public.organization_members for select
  using (public.is_org_member(org_id) or user_id = auth.uid());

create policy "members: admins can invite"
  on public.organization_members for insert
  with check (public.has_org_role(org_id, 'admin'));

create policy "members: admins can update roles/status"
  on public.organization_members for update
  using (public.has_org_role(org_id, 'admin'));

create policy "members: admins can remove"
  on public.organization_members for delete
  using (public.has_org_role(org_id, 'admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Audit log (every module writes here; this is the append-only spine)
-- ─────────────────────────────────────────────────────────────────────────
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create policy "audit_logs: members can read their org's log"
  on public.audit_logs for select
  using (public.is_org_member(org_id));

create policy "audit_logs: members can write with their own actor id"
  on public.audit_logs for insert
  with check (public.is_org_member(org_id) and actor_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────
create index idx_org_members_org on public.organization_members(org_id);
create index idx_org_members_user on public.organization_members(user_id);
create index idx_audit_logs_org on public.audit_logs(org_id, created_at desc);
