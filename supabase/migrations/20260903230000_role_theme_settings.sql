create table if not exists public.organization_role_themes (
  org_id uuid not null references public.organizations(id) on delete cascade,
  role_key text not null,
  theme_key text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, role_key)
);

alter table public.organization_role_themes enable row level security;

create policy "Organization members can read role themes"
  on public.organization_role_themes for select
  using (exists (
    select 1 from public.organization_members m
    where m.org_id = organization_role_themes.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ));

create policy "Organization admins can manage role themes"
  on public.organization_role_themes for all
  using (exists (
    select 1 from public.organization_members m
    where m.org_id = organization_role_themes.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('administrator', 'admin')
  ))
  with check (exists (
    select 1 from public.organization_members m
    where m.org_id = organization_role_themes.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('administrator', 'admin')
  ));
