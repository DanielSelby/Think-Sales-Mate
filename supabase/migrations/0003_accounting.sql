-- SalesMate ERP — Accounting module: expenses and invoices (receivables).
-- Depends on 0001_core_schema.sql. Sales (0002) stay POS-style, paid-in-full
-- transactions; invoices here represent money a customer owes but hasn't
-- paid yet — a separate flow, not a re-model of Sales.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Expenses
-- ─────────────────────────────────────────────────────────────────────────
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  vendor text,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "expenses: members can read"
  on public.expenses for select
  using (public.is_org_member(org_id));

create policy "expenses: managers can record"
  on public.expenses for insert
  with check (public.has_org_role(org_id, 'manager') and recorded_by = auth.uid());

create policy "expenses: managers can update"
  on public.expenses for update
  using (public.has_org_role(org_id, 'manager'));

create policy "expenses: managers can delete"
  on public.expenses for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_expenses_org_date on public.expenses(org_id, expense_date desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Invoices (accounts receivable)
-- ─────────────────────────────────────────────────────────────────────────
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number integer not null,
  customer_name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  status public.invoice_status not null default 'draft',
  due_date date not null,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, invoice_number)
);

alter table public.invoices enable row level security;

create policy "invoices: members can read"
  on public.invoices for select
  using (public.is_org_member(org_id));

create policy "invoices: managers can create"
  on public.invoices for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create policy "invoices: managers can update"
  on public.invoices for update
  using (public.has_org_role(org_id, 'manager'));

create policy "invoices: managers can delete"
  on public.invoices for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_invoices_org_status on public.invoices(org_id, status);

create function public.next_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(invoice_number), 0) + 1 into new.invoice_number
  from public.invoices
  where org_id = new.org_id;
  return new;
end;
$$;

create trigger set_invoice_number
  before insert on public.invoices
  for each row execute procedure public.next_invoice_number();