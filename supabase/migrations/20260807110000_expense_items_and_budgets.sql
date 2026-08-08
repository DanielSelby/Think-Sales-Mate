-- Upgrades expenses to support itemization (multiple line items per
-- expense), an approver workflow, optional PO linkage, and a minimal
-- budget table so "Budget Status" reflects real numbers instead of a
-- fabricated one.

begin;

alter table public.expenses
  add column if not exists reference_number text,
  add column if not exists purchase_order_id uuid references public.purchases (id),
  add column if not exists currency text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists expense_type text,
  add column if not exists approver_id uuid references public.profiles (id),
  add column if not exists approval_required boolean not null default true,
  add column if not exists transaction_reference text,
  add column if not exists discount_amount numeric(12, 2) not null default 0;

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  description text not null,
  category text,
  quantity numeric not null default 1,
  unit_cost numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists expense_items_expense_id_idx on public.expense_items (expense_id);

create table if not exists public.expense_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  category text not null,
  monthly_limit numeric(12, 2) not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create unique index if not exists expense_budgets_org_category_idx on public.expense_budgets (org_id, category);

alter table public.expense_items enable row level security;
alter table public.expense_budgets enable row level security;

create policy "expense_items_all" on public.expense_items
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = expense_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = expense_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "expense_budgets_all" on public.expense_budgets
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = expense_budgets.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = expense_budgets.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

commit;