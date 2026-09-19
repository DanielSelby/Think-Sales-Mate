begin;

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete restrict,
  closing_date date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  opening_cash numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null default 0,
  cash_refunds numeric(12,2) not null default 0,
  cash_expenses numeric(12,2) not null default 0,
  deposits numeric(12,2) not null default 0,
  withdrawals numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  actual_cash numeric(12,2) not null default 0,
  variance numeric(12,2) not null default 0,
  classification text not null check (classification in ('balanced','excess','shortage')),
  notes text,
  variance_reason text,
  coin_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','reopened')),
  approval_threshold numeric(12,2) not null default 0,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  reopen_requested_by uuid references auth.users(id),
  reopen_requested_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, location_id, closing_date)
);

create table if not exists public.cash_closing_lines (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.cash_closings(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  denomination numeric(12,2) not null check (denomination > 0),
  quantity integer not null check (quantity >= 0),
  amount numeric(12,2) generated always as (denomination * quantity) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_closing_audit (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.cash_closings(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('created','approved','reopen_requested','reopened')),
  actor_id uuid not null references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cash_closings enable row level security;
alter table public.cash_closing_lines enable row level security;
alter table public.cash_closing_audit enable row level security;

create policy "cash closings members read" on public.cash_closings for select
  using (public.is_org_member(org_id) and (location_id is null or public.can_access_org_location(org_id, location_id)));
create policy "cash closings staff create" on public.cash_closings for insert
  with check (public.has_org_role(org_id, 'staff') and created_by = auth.uid()
    and (location_id is null or public.can_access_org_location(org_id, location_id)));
create policy "cash closings managers update" on public.cash_closings for update
  using (public.has_org_role(org_id, 'manager'));
create policy "cash closing lines members read" on public.cash_closing_lines for select
  using (public.is_org_member(org_id));
create policy "cash closing lines staff create" on public.cash_closing_lines for insert
  with check (public.has_org_role(org_id, 'staff'));
create policy "cash closing audit members read" on public.cash_closing_audit for select
  using (public.is_org_member(org_id));
create policy "cash closing audit members write" on public.cash_closing_audit for insert
  with check (public.is_org_member(org_id) and actor_id = auth.uid());

create index if not exists cash_closings_org_date_idx on public.cash_closings(org_id, closing_date desc);
create index if not exists cash_closing_lines_closing_idx on public.cash_closing_lines(closing_id);
create index if not exists cash_closing_audit_closing_idx on public.cash_closing_audit(closing_id, created_at desc);

create or replace function public.prevent_approved_cash_closing_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved' and new.status not in ('reopened','approved') then
    raise exception 'Approved cash closings are immutable.';
  end if;
  if old.status = 'approved' and new.status = 'approved' then
    if new.actual_cash is distinct from old.actual_cash or new.expected_cash is distinct from old.expected_cash
      or new.variance is distinct from old.variance or new.notes is distinct from old.notes then
      raise exception 'Approved cash closings are immutable.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists cash_closing_immutable on public.cash_closings;
create trigger cash_closing_immutable before update on public.cash_closings
for each row execute procedure public.prevent_approved_cash_closing_mutation();

commit;
