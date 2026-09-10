alter table public.subscription_plans
  add column if not exists annual_price numeric(12,2),
  add column if not exists archived_at timestamptz;

alter table public.platform_organizations
  add column if not exists industry text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

alter table public.platform_organization_features
  add column if not exists access_mode text not null default 'enabled'
    check (access_mode in ('enabled', 'disabled', 'read_only'));

create table if not exists public.platform_feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  scope text not null default 'platform' check (scope in ('platform', 'plan', 'organization')),
  plan_id uuid references public.subscription_plans(id) on delete cascade,
  organization_id uuid,
  updated_by uuid references public.platform_admins(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  requested_by uuid not null references public.platform_admins(id),
  approval_type text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  payload jsonb not null default '{}',
  reviewed_by uuid references public.platform_admins(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.platform_admins(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_plan_features (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  module text not null,
  access_mode text not null default 'enabled'
    check (access_mode in ('enabled', 'disabled', 'read_only')),
  primary key (plan_id, module)
);

create index if not exists idx_platform_audit_logs_created_at on public.platform_audit_logs(created_at desc);
create index if not exists idx_platform_approvals_status on public.platform_approvals(status, created_at desc);
create index if not exists idx_platform_notifications_admin on public.platform_notifications(admin_id, created_at desc);

alter table public.platform_feature_flags enable row level security;
alter table public.platform_approvals enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.platform_plan_features enable row level security;

create policy "platform admins manage feature flags" on public.platform_feature_flags for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage approvals" on public.platform_approvals for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage notifications" on public.platform_notifications for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage plan features" on public.platform_plan_features for all using (public.is_platform_admin()) with check (public.is_platform_admin());
