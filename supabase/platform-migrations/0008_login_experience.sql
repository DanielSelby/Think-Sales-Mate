create table if not exists public.login_themes (
  id text primary key,
  name text not null,
  description text not null default '',
  preview_image text,
  theme_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.login_themes (id, name, description, preview_image, theme_type)
values
  ('default-thinksales-login', 'Default ThinkSales Login', 'The original ThinkSales Pro login experience.', '/thinksales-logo.svg', 'existing'),
  ('modern-green-login', 'Modern Green Login', 'A fresh login design using the uploaded ThinkSales artwork.', '/login/modern-green-artwork.jpeg', 'modern-green')
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    preview_image = excluded.preview_image,
    theme_type = excluded.theme_type;

alter table public.platform_organizations
  add column if not exists use_global_login_theme boolean not null default true,
  add column if not exists login_theme_id text references public.login_themes(id) on delete set null;

alter table public.login_themes enable row level security;
create or replace function public.can_manage_login_experience()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where auth_user_id = auth.uid()
      and is_active
      and role in ('platform_owner', 'platform_administrator')
  );
$$;

drop policy if exists "platform admins manage login themes" on public.login_themes;
create policy "platform managers manage login themes"
  on public.login_themes for all
  using (public.can_manage_login_experience())
  with check (public.can_manage_login_experience());

insert into public.platform_settings (key, value)
values ('global_login_theme', '{"theme_id":"default-thinksales-login"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.protect_login_theme_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affects_login_theme boolean;
begin
  if tg_op = 'DELETE' then
    affects_login_theme := old.key = 'global_login_theme';
  else
    affects_login_theme := new.key = 'global_login_theme'
      or (tg_op = 'UPDATE' and old.key = 'global_login_theme');
  end if;

  if affects_login_theme
    and auth.uid() is not null
    and not public.can_manage_login_experience() then
    raise exception 'You do not have permission to change the global login theme.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_login_theme_setting on public.platform_settings;
create trigger protect_login_theme_setting
before insert or update or delete on public.platform_settings
for each row execute function public.protect_login_theme_setting();

create or replace function public.protect_organization_login_theme()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.can_manage_login_experience() then
    if tg_op = 'INSERT' then
      if new.use_global_login_theme is false or new.login_theme_id is not null then
        raise exception 'You do not have permission to assign an organization login theme.';
      end if;
    elsif new.use_global_login_theme is distinct from old.use_global_login_theme
      or new.login_theme_id is distinct from old.login_theme_id then
      raise exception 'You do not have permission to assign an organization login theme.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_organization_login_theme on public.platform_organizations;
create trigger protect_organization_login_theme
before insert or update on public.platform_organizations
for each row execute function public.protect_organization_login_theme();
