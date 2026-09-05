begin;

alter table public.organization_members
  add column if not exists can_check_cross_branch_stock boolean not null default false;

commit;
