begin;

create table if not exists public.sale_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method text not null,
  account_id uuid references public.bank_accounts(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.sale_payment_allocations enable row level security;

create policy "sale payment allocations members read"
  on public.sale_payment_allocations for select
  using (public.is_org_member(org_id));

create policy "sale payment allocations members create"
  on public.sale_payment_allocations for insert
  with check (public.is_org_member(org_id));

create index if not exists sale_payment_allocations_sale_idx
  on public.sale_payment_allocations(sale_id);

commit;
