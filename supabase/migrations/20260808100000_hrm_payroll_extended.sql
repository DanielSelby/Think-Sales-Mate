-- Extends employees and payroll_runs for the HRM & Payroll dashboard and
-- Employees list. Deliberately does NOT touch the existing `status` column
-- on employees (unknown underlying type/constraint from here) — "On Leave"
-- is instead derived from a new on_leave_until date, the same pattern used
-- for "Overdue" on expenses, so nothing existing can break.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'employment_type') then
    create type employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
  end if;
  if not exists (select 1 from pg_type where typname = 'payroll_run_status') then
    create type payroll_run_status as enum ('draft', 'processing', 'completed', 'failed');
  end if;
end $$;

create sequence if not exists public.employee_number_seq start 1001;

alter table public.employees
  add column if not exists employee_number integer,
  add column if not exists employment_type employment_type not null default 'full_time',
  add column if not exists on_leave_until date;

-- Backfill existing rows with a real sequential number, then make future
-- inserts default to the sequence.
update public.employees set employee_number = nextval('public.employee_number_seq')
where employee_number is null;

alter table public.employees alter column employee_number set default nextval('public.employee_number_seq');
alter table public.employees alter column employee_number set not null;
create unique index if not exists employees_org_number_idx on public.employees (org_id, employee_number);

alter table public.payroll_runs
  add column if not exists status payroll_run_status not null default 'completed',
  add column if not exists payroll_type text,
  add column if not exists pay_period_start date,
  add column if not exists pay_period_end date,
  add column if not exists payment_date date,
  add column if not exists gross_pay numeric(12, 2) not null default 0,
  add column if not exists deductions numeric(12, 2) not null default 0,
  add column if not exists allowances numeric(12, 2) not null default 0,
  add column if not exists employer_cost numeric(12, 2) not null default 0,
  add column if not exists net_pay numeric(12, 2) not null default 0,
  add column if not exists processed_by uuid references public.profiles (id),
  add column if not exists processed_at timestamptz;

alter table public.payroll_run_items
  add column if not exists basic_pay numeric(12, 2) not null default 0,
  add column if not exists deductions numeric(12, 2) not null default 0,
  add column if not exists net_pay numeric(12, 2) not null default 0;

commit;