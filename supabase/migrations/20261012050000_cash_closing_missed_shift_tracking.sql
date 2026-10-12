begin;

alter table public.cash_closing_branch_schedules
  add column if not exists tracking_started_on date not null default current_date;

create table if not exists public.cash_closing_missed_shift_acknowledgements (
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  closing_date date not null,
  shift text not null check (shift in ('full_day', 'morning', 'afternoon', 'night')),
  acknowledged_by uuid not null references auth.users(id),
  acknowledged_at timestamptz not null default now(),
  primary key (location_id, closing_date, shift)
);

alter table public.cash_closing_missed_shift_acknowledgements enable row level security;

drop policy if exists "cash closing missed shift acknowledgements members read"
  on public.cash_closing_missed_shift_acknowledgements;
create policy "cash closing missed shift acknowledgements members read"
  on public.cash_closing_missed_shift_acknowledgements for select
  using (public.is_org_member(org_id));

drop policy if exists "cash closing missed shift acknowledgements managers write"
  on public.cash_closing_missed_shift_acknowledgements;
create policy "cash closing missed shift acknowledgements managers write"
  on public.cash_closing_missed_shift_acknowledgements for all
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

create index if not exists cash_closing_missed_shift_acknowledgements_org_date_idx
  on public.cash_closing_missed_shift_acknowledgements(org_id, closing_date);

commit;
