-- SalesMate ERP — manually provisioned staff accounts.
-- Passwords are stored only by Supabase Auth; this table contains the
-- non-sensitive staff profile and access configuration needed by the app.

alter table public.organization_members
  add column if not exists username text,
  add column if not exists employee_id text,
  add column if not exists phone text,
  add column if not exists department text,
  add column if not exists contact_email text,
  add column if not exists branch_scope text not null default 'assigned'
    check (branch_scope in ('all', 'assigned', 'single')),
  add column if not exists secondary_location_ids uuid[] not null default '{}',
  add column if not exists access_permissions jsonb not null default '{}'::jsonb,
  add column if not exists must_change_password boolean not null default true;

create unique index if not exists organization_members_org_username_idx
  on public.organization_members (org_id, lower(username))
  where username is not null;

create index if not exists organization_members_employee_id_idx
  on public.organization_members (org_id, employee_id)
  where employee_id is not null;
