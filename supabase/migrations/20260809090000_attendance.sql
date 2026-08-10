-- Attendance: one record per employee per work day. total_hours is computed
-- app-side at checkout (not a generated column) since check_in/check_out
-- are timestamptz and the calculation needs timezone-aware handling done
-- consistently with the rest of the app.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type attendance_status as enum ('present', 'absent', 'late', 'early_leave', 'on_leave');
  end if;
end $$;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status attendance_status not null default 'present',
  work_type text not null default 'Office',
  total_hours numeric(5, 2) not null default 0,
  overtime_hours numeric(5, 2) not null default 0,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_records_employee_date_idx on public.attendance_records (employee_id, work_date);
create index if not exists attendance_records_org_date_idx on public.attendance_records (org_id, work_date);

create or replace function public.touch_attendance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_records_touch_updated_at on public.attendance_records;
create trigger attendance_records_touch_updated_at
  before update on public.attendance_records
  for each row
  execute function public.touch_attendance_updated_at();

alter table public.attendance_records enable row level security;

create policy "attendance_records_all" on public.attendance_records
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = attendance_records.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = attendance_records.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

commit;