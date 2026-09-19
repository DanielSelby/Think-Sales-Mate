begin;

alter table public.cash_closings
  add column if not exists shift text not null default 'full_day'
    check (shift in ('morning', 'afternoon', 'night', 'full_day')),
  add column if not exists cash_receipts numeric(12,2) not null default 0,
  add column if not exists comments text,
  add column if not exists approval_required boolean not null default false,
  add column if not exists reopen_status text not null default 'none'
    check (reopen_status in ('none', 'requested', 'approved', 'rejected'));
alter table public.cash_closing_audit
  add column if not exists device text,
  add column if not exists ip_address text;
alter table public.cash_closing_audit drop constraint if exists cash_closing_audit_action_check;
alter table public.cash_closing_audit add constraint cash_closing_audit_action_check
  check (action in ('created','approved','reopen_requested','reopen_approved','reopened','reopen_rejected'));

alter table public.cash_closings drop constraint if exists cash_closings_org_id_location_id_closing_date_key;
create unique index if not exists cash_closings_org_location_date_shift_idx
  on public.cash_closings(org_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), closing_date, shift);

create table if not exists public.cash_closing_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  variance_approval_enabled boolean not null default true,
  variance_threshold numeric(12,2) not null default 50,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.cash_closing_settings enable row level security;
create policy "cash closing settings members read" on public.cash_closing_settings for select
  using (public.is_org_member(org_id));
create policy "cash closing settings managers write" on public.cash_closing_settings for all
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

commit;
