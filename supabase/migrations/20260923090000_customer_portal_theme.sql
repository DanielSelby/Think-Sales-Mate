alter table public.customer_portal_settings
  add column if not exists portal_theme text not null default 'light';

alter table public.customer_portal_settings
  drop constraint if exists customer_portal_settings_portal_theme_check;

alter table public.customer_portal_settings
  add constraint customer_portal_settings_portal_theme_check
  check (portal_theme in ('light', 'dark'));
