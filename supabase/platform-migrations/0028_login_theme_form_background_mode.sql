alter table public.login_themes
  add column if not exists login_form_background_mode text not null default 'light';

alter table public.login_themes
  drop constraint if exists login_themes_login_form_background_mode_check;

alter table public.login_themes
  add constraint login_themes_login_form_background_mode_check
  check (login_form_background_mode in ('light', 'dark'));
