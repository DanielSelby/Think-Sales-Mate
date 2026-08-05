-- SalesMate ERP — HRM & Payroll module (v1).
-- Salary data is sensitive, so unlike other modules this one is gated to
-- 'manager' role and above for BOTH read and write — there is no
-- viewer/staff-level visibility into employee records or pay.
-- A payroll run also writes a matching row into `expenses` (category
-- 'salaries') so the existing dashboard/Accounting P&L pick up payroll
-- costs automatically, with no changes needed there.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Employees
-- ─────────────────────────────────────────────────────────────────────────
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  job_title text,
  department text,
  monthly_salary numeric(12, 2) not null check (monthly_salary >= 0),
  hire_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "employees: managers can read"
  on public.employees for select
  using (public.has_org_role(org_id, 'manager'));

create policy "employees: managers can create"
  on public.employees for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create policy "employees: managers can update"
  on public.employees for update
  using (public.has_org_role(org_id, 'manager'));

create policy "employees: managers can delete"
  on public.employees for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_employees_org on public.employees(org_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Payroll runs (one row per pay period processed) + line items
--    (a snapshot per employee, so later edits/removals don't rewrite
--    history).
-- ─────────────────────────────────────────────────────────────────────────
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_label text not null,
  period_month date not null,
  total_amount numeric(12, 2) not null,
  employee_count integer not null,
  expense_id uuid references public.expenses(id) on delete set null,
  run_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.payroll_runs enable row level security;

create policy "payroll_runs: managers can read"
  on public.payroll_runs for select
  using (public.has_org_role(org_id, 'manager'));

create policy "payroll_runs: managers can create"
  on public.payroll_runs for insert
  with check (public.has_org_role(org_id, 'manager') and run_by = auth.uid());

create policy "payroll_runs: managers can delete"
  on public.payroll_runs for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_payroll_runs_org on public.payroll_runs(org_id, period_month desc);

create table public.payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

alter table public.payroll_run_items enable row level security;

create policy "payroll_run_items: managers can read"
  on public.payroll_run_items for select
  using (public.has_org_role(org_id, 'manager'));

create policy "payroll_run_items: managers can create"
  on public.payroll_run_items for insert
  with check (public.has_org_role(org_id, 'manager'));

create index idx_payroll_run_items_run on public.payroll_run_items(payroll_run_id);