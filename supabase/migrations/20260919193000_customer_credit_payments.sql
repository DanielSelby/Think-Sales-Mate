create table if not exists public.customer_credit_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  payment_date date not null default current_date,
  location_id uuid references public.business_locations(id) on delete set null,
  recorded_by uuid not null references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.cash_closings
  add column if not exists cash_customer_payments numeric(12,2) not null default 0;

alter table public.customer_credit_payments enable row level security;

create policy "customer credit payments members read"
  on public.customer_credit_payments for select
  using (public.is_org_member(org_id));

create policy "customer credit payments members create"
  on public.customer_credit_payments for insert
  with check (public.is_org_member(org_id) and recorded_by = auth.uid());

create index if not exists customer_credit_payments_org_date_idx
  on public.customer_credit_payments(org_id, payment_date desc);
