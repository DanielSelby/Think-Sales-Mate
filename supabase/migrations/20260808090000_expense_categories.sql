-- Promotes expense categories from free-text strings to a real, manageable
-- table — icon, color, department, budget limit, and active/inactive status.
-- expenses.category stays a text column (matched by name) rather than a
-- hard FK, so existing expense rows and the free-text EXPENSE_CATEGORIES
-- list keep working without a disruptive backfill/migration of that column.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_category_status') then
    create type expense_category_status as enum ('active', 'inactive');
  end if;
end $$;

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  icon text not null default 'Tag',
  color text not null default 'blue',
  description text,
  department text,
  budget_limit numeric(12, 2),
  status expense_category_status not null default 'active',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists expense_categories_org_name_idx on public.expense_categories (org_id, name);

create or replace function public.touch_expense_category_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists expense_categories_touch_updated_at on public.expense_categories;
create trigger expense_categories_touch_updated_at
  before update on public.expense_categories
  for each row
  execute function public.touch_expense_category_updated_at();

alter table public.expense_categories enable row level security;

create policy "expense_categories_all" on public.expense_categories
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = expense_categories.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = expense_categories.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

-- Backfill: one row per distinct category name already used on real
-- expenses, per org, carrying over any budget already set in
-- expense_budgets (which this table now supersedes for budget purposes).
insert into public.expense_categories (org_id, name, budget_limit, created_by)
select distinct
  e.org_id,
  e.category,
  b.monthly_limit,
  e.recorded_by
from public.expenses e
left join public.expense_budgets b on b.org_id = e.org_id and b.category = e.category
on conflict (org_id, name) do nothing;

commit;