alter table public.platform_organization_features
  add column if not exists permission_options jsonb not null default '{}'::jsonb;

create index if not exists idx_platform_org_features_org
  on public.platform_organization_features(organization_id, module);

notify pgrst, 'reload schema';
