begin;

alter table public.register_closures
  add column if not exists actual_cash numeric(12,2),
  add column if not exists opening_cash numeric(12,2) not null default 0,
  add column if not exists variance numeric(12,2),
  add column if not exists variance_reason text,
  add column if not exists status text not null default 'approved'
    check (status in ('approved', 'pending_approval', 'rejected', 'reopened')),
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz;

create table if not exists public.register_closure_lines (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.register_closures(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  denomination numeric(12,2) not null check (denomination > 0),
  quantity integer not null check (quantity > 0),
  amount numeric(12,2) generated always as (denomination * quantity) stored,
  created_at timestamptz not null default now()
);

alter table public.register_closure_lines enable row level security;

create policy "register closure lines members read"
  on public.register_closure_lines for select
  using (public.is_org_member(org_id));

create policy "register closure lines staff create"
  on public.register_closure_lines for insert
  with check (public.has_org_role(org_id, 'staff'));

create index if not exists register_closure_lines_closure_idx
  on public.register_closure_lines(closure_id);

commit;
