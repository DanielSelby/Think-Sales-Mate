alter table public.customers
  add column if not exists credit_limit numeric(12, 2)
  check (credit_limit is null or credit_limit >= 0);

alter table public.org_general_settings
  add column if not exists block_credit_limit_exceeded boolean not null default false;
