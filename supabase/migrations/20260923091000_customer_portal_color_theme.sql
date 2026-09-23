alter table public.customer_portal_settings
  add column if not exists portal_color_theme text not null default 'fintech';

alter table public.customer_portal_settings
  drop constraint if exists customer_portal_settings_portal_color_theme_check;

alter table public.customer_portal_settings
  add constraint customer_portal_settings_portal_color_theme_check
  check (portal_color_theme in ('green', 'navy', 'teal', 'plum', 'fintech', 'royal', 'harvest', 'eclipse'));
