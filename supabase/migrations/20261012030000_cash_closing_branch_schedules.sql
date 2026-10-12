begin;

create table if not exists public.cash_closing_branch_schedules (
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid primary key references public.business_locations(id) on delete cascade,
  required_shifts text[] not null default array['full_day']::text[],
  time_zone text default null,
  shift_windows jsonb not null default '{
    "morning": {"start": "06:00", "end": "14:00"},
    "afternoon": {"start": "14:00", "end": "22:00"},
    "night": {"start": "22:00", "end": "06:00"}
  }'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint cash_closing_branch_schedules_required_shifts_check
    check (
      cardinality(required_shifts) > 0
      and required_shifts <@ array['full_day', 'morning', 'afternoon', 'night']::text[]
      and ('full_day' <> all(required_shifts) or cardinality(required_shifts) = 1)
    ),
  constraint cash_closing_branch_schedules_shift_windows_check
    check (jsonb_typeof(shift_windows) = 'object')
);

insert into public.cash_closing_branch_schedules (org_id, location_id)
select org_id, id
from public.business_locations
on conflict (location_id) do nothing;

alter table public.cash_closing_branch_schedules enable row level security;

drop policy if exists "cash closing branch schedules members read" on public.cash_closing_branch_schedules;
create policy "cash closing branch schedules members read"
  on public.cash_closing_branch_schedules for select
  using (public.is_org_member(org_id));

drop policy if exists "cash closing branch schedules managers write" on public.cash_closing_branch_schedules;
create policy "cash closing branch schedules managers write"
  on public.cash_closing_branch_schedules for all
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

create index if not exists cash_closing_branch_schedules_org_idx
  on public.cash_closing_branch_schedules(org_id);

commit;
