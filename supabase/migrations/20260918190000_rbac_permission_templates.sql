-- Persist the module/action matrix independently from the tenant role enum.
-- Individual members may override a template through access_permissions.
create table if not exists public.organization_role_templates (
  org_id uuid not null references public.organizations(id) on delete cascade,
  role_key text not null,
  name text,
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, role_key)
);

alter table public.organization_role_templates enable row level security;

create policy "Organization members can read role templates"
  on public.organization_role_templates for select
  using (public.is_org_member(org_id));

create policy "Organization admins can manage role templates"
  on public.organization_role_templates for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));

create index if not exists organization_role_templates_org_idx
  on public.organization_role_templates (org_id);
