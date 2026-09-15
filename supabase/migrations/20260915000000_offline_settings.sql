alter table public.org_general_settings
  add column if not exists offline_enabled boolean not null default true,
  add column if not exists offline_sync_mode text not null default 'automatic'
    check (offline_sync_mode in ('automatic', 'approval', 'manual')),
  add column if not exists offline_data_load_mode text not null default 'automatic'
    check (offline_data_load_mode in ('automatic', 'approval', 'manual'));
