alter table public.profiles
  add column ui_preferences jsonb not null default '{}'::jsonb;
