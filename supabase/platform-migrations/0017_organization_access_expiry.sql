alter table public.platform_organizations
  add column if not exists organization_access_expires_at date;

create index if not exists platform_organizations_access_expiry_idx
  on public.platform_organizations (organization_access_expires_at)
  where organization_access_expires_at is not null;
