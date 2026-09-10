alter table public.platform_organization_features
  add column if not exists access_mode text not null default 'enabled';

alter table public.platform_organization_features
  drop constraint if exists platform_organization_features_access_mode_check;

alter table public.platform_organization_features
  add constraint platform_organization_features_access_mode_check
  check (access_mode in ('enabled', 'disabled', 'read_only'));

notify pgrst, 'reload schema';
