-- Extends expenses for the Expenses Management page: auto-numbering,
-- an approval workflow (status) tracked independently of payment status,
-- departments/locations, due dates (for overdue detection), and the
-- fields needed to support recurring expense templates.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type expense_status as enum ('pending_approval', 'approved', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'expense_payment_status') then
    create type expense_payment_status as enum ('unpaid', 'paid');
  end if;
end $$;

create sequence if not exists public.expense_number_seq;

alter table public.expenses
  add column if not exists expense_number integer not null default nextval('public.expense_number_seq'),
  add column if not exists payment_method text,
  add column if not exists status expense_status not null default 'pending_approval',
  add column if not exists payment_status expense_payment_status not null default 'unpaid',
  add column if not exists paid_on date,
  add column if not exists due_date date,
  add column if not exists department text,
  add column if not exists location_id uuid references public.business_locations (id),
  add column if not exists approved_by uuid references public.profiles (id),
  add column if not exists approved_at timestamptz,
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_frequency text,
  add column if not exists next_recurrence_date date,
  add column if not exists parent_expense_id uuid references public.expenses (id),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists expenses_org_number_idx on public.expenses (org_id, expense_number);
create index if not exists expenses_org_status_idx on public.expenses (org_id, status);
create index if not exists expenses_org_category_idx on public.expenses (org_id, category);
create index if not exists expenses_recurring_due_idx on public.expenses (org_id, is_recurring, next_recurrence_date) where is_recurring = true;

create or replace function public.touch_expense_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row
  execute function public.touch_expense_updated_at();

commit;