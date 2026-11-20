create table if not exists public.education_portal_links (
  org_id uuid not null references public.organizations(id) on delete cascade,
  portal_type text not null check (portal_type in ('student', 'family', 'staff')),
  portal_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, portal_type),
  check (
    (portal_type = 'student' and portal_path = '/student-education-portal')
    or (portal_type = 'family' and portal_path = '/education-portal')
    or (portal_type = 'staff' and portal_path = '/teacher-education-portal')
  )
);

alter table public.education_portal_links enable row level security;

create policy "education portal links read"
  on public.education_portal_links for select
  using (public.education_can_access_organization(org_id, 'education_settings', 'view'));

grant select on public.education_portal_links to authenticated;
revoke all on public.education_portal_links from public, anon;

create or replace function public.education_seed_portal_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.education_portal_links (org_id, portal_type, portal_path)
  values
    (new.id, 'student', '/student-education-portal'),
    (new.id, 'family', '/education-portal'),
    (new.id, 'staff', '/teacher-education-portal')
  on conflict (org_id, portal_type) do nothing;
  return new;
end;
$$;

revoke all on function public.education_seed_portal_links() from public, anon, authenticated;

drop trigger if exists organization_seed_education_portal_links
  on public.organizations;
create trigger organization_seed_education_portal_links
  after insert on public.organizations
  for each row execute function public.education_seed_portal_links();

insert into public.education_portal_links (org_id, portal_type, portal_path)
select organization.id, portal.portal_type, portal.portal_path
from public.organizations organization
cross join (values
  ('student', '/student-education-portal'),
  ('family', '/education-portal'),
  ('staff', '/teacher-education-portal')
) as portal(portal_type, portal_path)
on conflict (org_id, portal_type) do nothing;
