alter table public.organizations
  add column if not exists use_system_prices boolean not null default false;
