-- Leave Management: configurable leave types, requests with an
-- approve/reject workflow, and a simple per-employee annual balance
-- (allocated vs used days) — one balance per employee per year, not
-- broken out per leave-type, to keep this tractable while still giving
-- the "Leave Balance Overview" real numbers to show.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'leave_status') then
    create type leave_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  color text not null default 'blue',
  is_paid boolean not null default true,
  default_annual_days numeric(5, 1) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists leave_types_org_name_idx on public.leave_types (org_id, name);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  duration_days numeric(5, 1) not null,
  reason text,
  status leave_status not null default 'pending',
  applied_on date not null default current_date,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leave_requests_org_idx on public.leave_requests (org_id);
create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id);
create index if not exists leave_requests_status_idx on public.leave_requests (org_id, status);

create or replace function public.touch_leave_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leave_requests_touch_updated_at on public.leave_requests;
create trigger leave_requests_touch_updated_at
  before update on public.leave_requests
  for each row
  execute function public.touch_leave_request_updated_at();

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  employee_id uuid not null references public.employees (id) on delete cascade,
  year integer not null,
  allocated_days numeric(5, 1) not null default 21,
  used_days numeric(5, 1) not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists leave_balances_employee_year_idx on public.leave_balances (employee_id, year);

alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_balances enable row level security;

create policy "leave_types_all" on public.leave_types
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = leave_types.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = leave_types.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "leave_requests_all" on public.leave_requests
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = leave_requests.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = leave_requests.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "leave_balances_all" on public.leave_balances
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = leave_balances.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = leave_balances.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

commit;