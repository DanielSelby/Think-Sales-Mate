alter table public.organizations
  add column if not exists registration_status text not null default 'approved'
    check (registration_status in ('pending', 'approved', 'rejected', 'suspended'));

drop policy if exists "organizations: authenticated users can create" on public.organizations;

create or replace function public.protect_organization_registration_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.registration_status := 'pending';
    elsif new.registration_status is distinct from old.registration_status then
      raise exception 'Organization registration status can only be changed by the platform.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_registration_status on public.organizations;
create trigger organizations_protect_registration_status
  before insert or update of registration_status on public.organizations
  for each row execute function public.protect_organization_registration_status();

create table if not exists public.organization_registration_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.organization_registration_attempts
  add column if not exists ip_hash text;

create index if not exists organization_registration_attempts_user_created_idx
  on public.organization_registration_attempts (user_id, created_at desc);
create index if not exists organization_registration_attempts_ip_created_idx
  on public.organization_registration_attempts (ip_hash, created_at desc)
  where ip_hash is not null;
alter table public.organization_registration_attempts enable row level security;

drop function if exists public.create_organization_registration(uuid, text, text);

create or replace function public.create_organization_registration(
  p_user_id uuid,
  p_name text,
  p_slug text,
  p_ip_hash text default null
)
returns table (organization_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_organization_id uuid;
  new_organization_id uuid;
  recent_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create organization registrations.';
  end if;
  if p_user_id is null or p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
    raise exception 'Enter an organization name between 1 and 120 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 1));
  end if;

  select id into existing_organization_id
  from public.organizations
  where created_by = p_user_id
    and registration_status = 'pending'
  order by created_at desc
  limit 1;

  if existing_organization_id is not null then
    return query select existing_organization_id, false;
    return;
  end if;

  select count(*)::integer into recent_attempts
  from public.organization_registration_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if recent_attempts >= 3 then
    raise exception 'You have reached the workspace registration limit. Please try again later.';
  end if;

  if p_ip_hash is not null and (
    select count(*) from public.organization_registration_attempts
    where ip_hash = p_ip_hash
      and created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Too many workspace registrations were submitted from this network. Please try again later.';
  end if;

  insert into public.organizations (name, slug, created_by, registration_status)
  values (btrim(p_name), p_slug, p_user_id, 'pending')
  returning id into new_organization_id;

  insert into public.organization_members (org_id, user_id, role, status)
  values (new_organization_id, p_user_id, 'owner', 'invited');

  insert into public.organization_registration_attempts (user_id, ip_hash)
  values (p_user_id, p_ip_hash);

  return query select new_organization_id, true;
end;
$$;

revoke all on function public.create_organization_registration(uuid, text, text, text) from public;
grant execute on function public.create_organization_registration(uuid, text, text, text) to service_role;

create table if not exists public.organization_registration_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_type text not null check (author_type in ('owner', 'platform_admin', 'system')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists organization_registration_messages_org_created_idx
  on public.organization_registration_messages (organization_id, created_at);
alter table public.organization_registration_messages enable row level security;

create table if not exists public.organization_registration_membership_snapshot (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prior_status public.member_status not null,
  primary key (organization_id, user_id)
);
alter table public.organization_registration_membership_snapshot enable row level security;

create or replace function public.protect_pending_organization_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_status text;
begin
  select registration_status into organization_status
  from public.organizations
  where id = new.org_id;

  if organization_status is distinct from 'approved' and new.status = 'active' then
    new.status := 'invited';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_protect_pending_access on public.organization_members;
create trigger organization_members_protect_pending_access
  before insert or update of status on public.organization_members
  for each row execute function public.protect_pending_organization_membership();

create or replace function public.sync_registration_membership_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registration_status = 'approved' and old.registration_status <> 'approved' then
    update public.organization_members as member
    set status = snapshot.prior_status
    from public.organization_registration_membership_snapshot as snapshot
    where snapshot.organization_id = new.id
      and snapshot.organization_id = member.org_id
      and snapshot.user_id = member.user_id;

    update public.organization_members
    set status = 'active'
    where org_id = new.id
      and user_id = new.created_by
      and status in ('invited', 'suspended');

    delete from public.organization_registration_membership_snapshot
    where organization_id = new.id;
  elsif new.registration_status <> 'approved' and old.registration_status = 'approved' then
    insert into public.organization_registration_membership_snapshot (organization_id, user_id, prior_status)
    select org_id, user_id, status
    from public.organization_members
    where org_id = new.id
      and status = 'active'
      and user_id is not null
    on conflict (organization_id, user_id) do nothing;

    update public.organization_members
    set status = 'suspended'
    where org_id = new.id
      and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_sync_registration_memberships on public.organizations;
create trigger organizations_sync_registration_memberships
  after update of registration_status on public.organizations
  for each row execute function public.sync_registration_membership_access();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as member
    join public.organizations as organization on organization.id = member.org_id
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and organization.registration_status = 'approved'
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, min_role public.member_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as member
    join public.organizations as organization on organization.id = member.org_id
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and organization.registration_status = 'approved'
      and (
        organization.created_by = auth.uid()
        or case min_role
          when 'viewer' then member.role in ('owner', 'admin', 'manager', 'staff', 'viewer')
          when 'staff' then member.role in ('owner', 'admin', 'manager', 'staff')
          when 'manager' then member.role in ('owner', 'admin', 'manager')
          when 'admin' then member.role in ('owner', 'admin')
          when 'owner' then member.role = 'owner'
        end
      )
  );
$$;
