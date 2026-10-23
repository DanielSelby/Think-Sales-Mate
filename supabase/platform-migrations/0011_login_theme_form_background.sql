alter table public.login_themes
  add column if not exists background_artwork text,
  add column if not exists login_form_transparent boolean not null default false;
