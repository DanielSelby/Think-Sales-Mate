begin;

alter table public.payroll_runs
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

create policy "payroll_runs: managers can update approval"
  on public.payroll_runs for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  payroll_run_item_id uuid not null references public.payroll_run_items(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  employee_number integer,
  department text,
  job_title text,
  location_id uuid references public.business_locations(id) on delete set null,
  employment_type employment_type,
  hire_date date,
  period_label text not null,
  pay_period_start date not null,
  pay_period_end date not null,
  payment_date date not null,
  payment_method text,
  bank_name text,
  account_number text,
  mobile_money_number text,
  payment_reference text,
  currency text not null default 'GHS',
  payroll_reference text not null,
  earnings jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb,
  total_earnings numeric(12, 2) not null default 0,
  total_deductions numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  notes text,
  status text not null default 'generated' check (status in ('pending', 'generated', 'archived')),
  generated_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

create index if not exists idx_payslips_org_period on public.payslips(org_id, pay_period_start desc);
create index if not exists idx_payslips_employee on public.payslips(employee_id, pay_period_start desc);
create index if not exists idx_payslips_run on public.payslips(payroll_run_id);

alter table public.payslips enable row level security;

create policy "payslips: managers can read"
  on public.payslips for select
  using (public.has_org_role(org_id, 'manager'));

create policy "payslips: employees can read their own"
  on public.payslips for select
  using (
    exists (
      select 1 from public.organization_members member
      where member.org_id = payslips.org_id
        and member.user_id = auth.uid()
        and member.employee_id = payslips.employee_id::text
        and member.status = 'active'
    )
  );

create policy "payslips: managers can create"
  on public.payslips for insert
  with check (public.has_org_role(org_id, 'manager'));

create policy "payslips: managers can update"
  on public.payslips for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

create policy "payslips: managers can delete"
  on public.payslips for delete
  using (public.has_org_role(org_id, 'manager'));

create table if not exists public.payslip_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('generated', 'viewed', 'downloaded', 'printed', 'emailed', 'regenerated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.payslip_events enable row level security;

create policy "payslip events: managers can read"
  on public.payslip_events for select
  using (public.has_org_role(org_id, 'manager'));

create policy "payslip events: org members can create"
  on public.payslip_events for insert
  with check (public.is_org_member(org_id));

commit;
