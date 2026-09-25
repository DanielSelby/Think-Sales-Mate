begin;

alter table public.payroll_run_items
  add column if not exists allowances numeric(12, 2) not null default 0,
  add column if not exists overtime numeric(12, 2) not null default 0,
  add column if not exists bonus numeric(12, 2) not null default 0,
  add column if not exists tax numeric(12, 2) not null default 0,
  add column if not exists ssnit numeric(12, 2) not null default 0,
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'partially_paid', 'paid')),
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id) on delete set null;

create index if not exists idx_payroll_items_payment_status
  on public.payroll_run_items(org_id, payment_status);

create table if not exists public.payroll_approval_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_approval_history_run
  on public.payroll_approval_history(org_id, payroll_run_id, created_at desc);

alter table public.payroll_approval_history enable row level security;

create policy "payroll approval history: managers can read"
  on public.payroll_approval_history for select
  using (public.has_org_role(org_id, 'manager'));

create policy "payroll approval history: managers can create"
  on public.payroll_approval_history for insert
  with check (public.has_org_role(org_id, 'manager'));

commit;
