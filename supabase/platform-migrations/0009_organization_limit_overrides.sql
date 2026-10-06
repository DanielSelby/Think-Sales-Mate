alter table public.platform_organizations
  add column if not exists max_users_override integer
    check (max_users_override is null or max_users_override >= 1),
  add column if not exists max_branches_override integer
    check (max_branches_override is null or max_branches_override >= 1);
