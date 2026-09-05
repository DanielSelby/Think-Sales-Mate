-- Migration: Add user transaction visibility scope and ensure branch scoping columns
begin;

-- 1. Add can_view_other_users_transactions to organization_members
alter table public.organization_members
  add column if not exists can_view_other_users_transactions boolean not null default true;

-- 2. Ensure branch_scope and secondary_location_ids exist with defaults
alter table public.organization_members
  add column if not exists branch_scope text not null default 'assigned',
  add column if not exists secondary_location_ids text[] not null default '{}';

-- 3. Create index for performant location and user queries on organization_members
create index if not exists idx_org_members_loc_scope on public.organization_members (org_id, location_id, branch_scope);

commit;
