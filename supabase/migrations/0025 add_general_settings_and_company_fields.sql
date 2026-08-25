-- General Settings page needs its own per-org settings row (mirrors the
-- currency_settings pattern already used elsewhere). Business Name lives
-- on organizations; Default Currency and Enable Multi-Currency are NOT
-- duplicated here — they reuse organizations.currency and
-- currency_settings.multi_currency_enabled respectively, so there's a
-- single source of truth instead of two flags that can disagree.

begin;

create table if not exists public.org_general_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  business_short_name text,
  default_language text not null default 'en',
  timezone text not null default 'UTC',
  date_format text not null default 'MMM DD, YYYY',
  time_format text not null default '12h' check (time_format in ('12h', '24h')),
  financial_year_start text not null default '01-01', -- MM-DD
  default_tax_rate numeric(5, 2) not null default 0,
  enable_barcode_scanning boolean not null default false,
  enable_notifications boolean not null default true,
  enable_email_alerts boolean not null default true,
  session_timeout_minutes integer not null default 30,
  auto_logout_minutes integer not null default 30,
  default_landing_page text not null default '/dashboard',
  updated_at timestamptz not null default now()
);

alter table public.org_general_settings enable row level security;

create policy "org_general_settings_all" on public.org_general_settings
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = org_general_settings.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = org_general_settings.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

-- Company Information page — fields the reference images show that the
-- existing company_profile table doesn't have yet.
alter table public.company_profile
  add column if not exists vat_number text,
  add column if not exists business_type text,
  add column if not exists industry text,
  add column if not exists postal_address text,
  add column if not exists stamp_url text,
  add column if not exists signature_url text;

commit;