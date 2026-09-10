create table if not exists public.platform_organization_features (
  organization_id uuid not null,
  module text not null,
  enabled boolean not null default false,
  updated_by uuid references public.platform_admins(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, module)
);

create table if not exists public.platform_usage_metrics (
  organization_id uuid primary key,
  active_users integer not null default 0,
  branches integer not null default 0,
  products integer not null default 0,
  customers integer not null default 0,
  orders integer not null default 0,
  sales_volume numeric(14,2) not null default 0,
  storage_used_gb numeric(14,2) not null default 0,
  ai_usage numeric(14,2) not null default 0,
  api_usage numeric(14,2) not null default 0,
  monthly_activity integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_billing_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid references public.subscription_plans(id),
  invoice_number text not null unique,
  amount numeric(12,2) not null default 0,
  status text not null default 'outstanding' check (status in ('paid','outstanding','refunded','void')),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz
);

create table if not exists public.platform_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  admin_id uuid not null references public.platform_admins(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_by uuid references public.platform_admins(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_security_events (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.platform_admins(id),
  event_type text not null,
  email text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.subscription_plans add column if not exists start_date date;
alter table public.subscription_plans add column if not exists end_date date;
alter table public.subscription_plans add column if not exists grace_period_days integer not null default 0;
alter table public.subscription_plans add column if not exists auto_suspend boolean not null default false;

alter table public.platform_organization_features enable row level security;
alter table public.platform_usage_metrics enable row level security;
alter table public.platform_billing_records enable row level security;
alter table public.platform_impersonation_sessions enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_security_events enable row level security;

create policy "platform admins manage organization features" on public.platform_organization_features for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins read usage metrics" on public.platform_usage_metrics for select using (public.is_platform_admin());
create policy "platform admins manage billing records" on public.platform_billing_records for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage impersonation sessions" on public.platform_impersonation_sessions for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage settings" on public.platform_settings for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins read security events" on public.platform_security_events for select using (public.is_platform_admin());
