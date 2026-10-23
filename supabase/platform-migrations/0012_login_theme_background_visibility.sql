alter table public.login_themes
  add column if not exists background_artwork_visibility smallint not null default 100
    check (background_artwork_visibility between 0 and 100);
