-- SalesMate ERP — multi-currency support.
create table public.currencies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  symbol text not null,
  exchange_rate_to_base numeric(18, 6) not null default 1,
  is_active boolean not null default true,
  is_default boolean not null default false,
  is_base boolean not null default false,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table public.currencies enable row level security;

create policy "currencies: members can read"
  on public.currencies for select
  using (public.is_org_member(org_id));

create policy "currencies: admins can manage"
  on public.currencies for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));

-- Only one base currency and one default currency per org.
create unique index idx_currencies_one_base on public.currencies(org_id) where is_base;
create unique index idx_currencies_one_default on public.currencies(org_id) where is_default;
create index idx_currencies_org on public.currencies(org_id);

-- ─────────────────────────────────────────────────────────────────────────
create table public.currency_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  exchange_rate_source text not null default 'manual' check (exchange_rate_source in ('manual', 'frankfurter')),
  rate_update_frequency text not null default 'daily' check (rate_update_frequency in ('manual', 'hourly', 'daily', 'weekly')),
  decimal_places integer not null default 2 check (decimal_places between 0 and 4),
  rounding_mode text not null default 'none' check (rounding_mode in ('none', 'nearest_1', 'nearest_5', 'nearest_10', 'nearest_100')),
  multi_currency_enabled boolean not null default false,
  home_currency_display boolean not null default true,
  exchange_rate_on_transaction boolean not null default true,
  revaluation_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.currency_settings enable row level security;

create policy "currency_settings: members can read"
  on public.currency_settings for select
  using (public.is_org_member(org_id));

create policy "currency_settings: admins can manage"
  on public.currency_settings for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));