-- register_closures — records a "close register" event (a Z-report): a
-- snapshot of sales/expenses totals for a period, either across every
-- cashier at a branch or for one specific cashier. This is a permanent
-- record of a close-out, not a hard gate on new sales — this codebase has
-- no "register session must be open to sell" concept, and adding one is a
-- much bigger feature than what's being built here.
--
-- (business_locations.email already exists as of 0023_location_details —
-- the printable invoice header uses it directly, no schema change needed.)

begin;

create table public.register_closures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.business_locations(id),
  scope text not null default 'all' check (scope in ('all', 'individual')),
  cashier_id uuid references auth.users(id), -- set only when scope = 'individual'
  cashier_name text, -- snapshot, so the record still reads fine if the user is later removed
  period_start timestamptz not null,
  period_end timestamptz not null,
  sales_count integer not null default 0,
  sales_total numeric(12, 2) not null default 0,
  cash_total numeric(12, 2) not null default 0,
  card_total numeric(12, 2) not null default 0,
  momo_total numeric(12, 2) not null default 0,
  other_total numeric(12, 2) not null default 0,
  expenses_total numeric(12, 2) not null default 0,
  net_total numeric(12, 2) not null default 0,
  closed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.register_closures enable row level security;

create policy "register_closures: members can read"
  on public.register_closures for select
  using (public.is_org_member(org_id));

create policy "register_closures: staff can create"
  on public.register_closures for insert
  with check (public.has_org_role(org_id, 'staff') and closed_by = auth.uid());

create index idx_register_closures_org_created on public.register_closures(org_id, created_at desc);

commit;