create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('platform_owner','platform_administrator','support_administrator','billing_administrator','technical_administrator')),
  is_active boolean not null default true,
  mfa_required boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  max_users integer,
  max_branches integer,
  storage_limit_gb integer,
  monthly_price numeric(12,2) not null default 0,
  ai_access boolean not null default false,
  api_access boolean not null default false,
  included_modules text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.platform_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique,
  name text not null,
  plan_id uuid references public.subscription_plans(id),
  status text not null default 'trial' check (status in ('active','trial','suspended','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.platform_admins(id),
  organization_id uuid,
  action text not null,
  module text not null,
  metadata jsonb not null default '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.platform_organizations enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.platform_audit_logs enable row level security;
create or replace function public.is_platform_admin() returns boolean language sql security definer stable set search_path = public as $$ select exists(select 1 from public.platform_admins where auth_user_id = auth.uid() and is_active); $$;
create policy "platform admins read platform data" on public.platform_admins for select using (public.is_platform_admin());
create policy "platform admins manage platform data" on public.platform_organizations for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage plans" on public.subscription_plans for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins read audit logs" on public.platform_audit_logs for select using (public.is_platform_admin());
create policy "platform admins write audit logs" on public.platform_audit_logs for insert with check (public.is_platform_admin());
