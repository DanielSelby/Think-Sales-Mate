create table if not exists public.platform_communication_accounts (
  organization_id uuid primary key,
  credit_balance numeric(18,2) not null default 0,
  sms_credits numeric(18,2) not null default 0,
  whatsapp_credits numeric(18,2) not null default 0,
  email_credits numeric(18,2) not null default 0,
  messaging_suspended boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_communication_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  amount numeric(18,2) not null,
  transaction_type text not null check (transaction_type in ('top_up','deduction','transfer','adjustment')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  campaign_type text not null default 'announcement',
  audience text not null default 'all_customers',
  status text not null default 'draft',
  messages_sent integer not null default 0,
  delivered integer not null default 0,
  read_count integer not null default 0,
  click_rate numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_communication_providers (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null unique,
  channel text not null check (channel in ('SMS','WhatsApp','Email')),
  enabled boolean not null default false,
  status text not null default 'not_configured',
  config_metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_communication_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  alert_type text not null,
  severity text not null check (severity in ('Critical','Warning','Information')),
  title text not null,
  detail text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.platform_communication_accounts enable row level security;
alter table public.platform_communication_credit_transactions enable row level security;
alter table public.platform_communication_campaigns enable row level security;
alter table public.platform_communication_providers enable row level security;
alter table public.platform_communication_alerts enable row level security;
