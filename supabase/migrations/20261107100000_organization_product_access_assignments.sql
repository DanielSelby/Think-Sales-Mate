create table if not exists public.organization_product_access_assignments (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null check (product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, product_slug),
  foreign key (org_id, user_id)
    references public.organization_members(org_id, user_id)
    on delete cascade
);

create index if not exists organization_product_access_user_idx
  on public.organization_product_access_assignments (org_id, user_id, product_slug)
  where is_active;

create table if not exists public.organization_product_access_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  product_slug text not null,
  action text not null check (action in ('assigned', 'revoked')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists organization_product_access_audit_org_created_idx
  on public.organization_product_access_audit (org_id, created_at desc);

create or replace function public.is_org_product_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as member
    join public.organizations as organization on organization.id = member.org_id
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        organization.created_by = auth.uid()
        or member.role::text = 'owner'
        or lower(coalesce(member.access_permissions ->> 'role_key', '')) in ('owner', 'super_admin')
      )
  );
$$;

revoke all on function public.is_org_product_admin(uuid) from public, anon;
grant execute on function public.is_org_product_admin(uuid) to authenticated;

create or replace function public.record_organization_product_access_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.organization_product_access_assignments;
  assignment_action text;
begin
  if tg_op = 'DELETE' then
    assignment := old;
    assignment_action := 'revoked';
  elsif tg_op = 'INSERT' then
    assignment := new;
    assignment_action := case when new.is_active then 'assigned' else 'revoked' end;
  else
    assignment := new;
    if old.is_active is distinct from new.is_active then
      assignment_action := case when new.is_active then 'assigned' else 'revoked' end;
    else
      return new;
    end if;
  end if;

  insert into public.organization_product_access_audit (org_id, user_id, product_slug, action, actor_id)
  values (assignment.org_id, assignment.user_id, assignment.product_slug, assignment_action, auth.uid());

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    assignment.org_id,
    auth.uid(),
    assignment_action,
    'product_access',
    assignment.product_slug,
    jsonb_build_object(
      'module', 'Product Access',
      'description', format('Product access %s for member %s.', assignment_action, assignment.user_id),
      'product_slug', assignment.product_slug,
      'user_id', assignment.user_id
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_product_access_audit_trigger
  on public.organization_product_access_assignments;
create trigger organization_product_access_audit_trigger
  after insert or update or delete on public.organization_product_access_assignments
  for each row execute function public.record_organization_product_access_audit();

alter table public.organization_product_access_assignments enable row level security;
alter table public.organization_product_access_audit enable row level security;

drop policy if exists "members read own product assignments" on public.organization_product_access_assignments;
create policy "members read own product assignments"
  on public.organization_product_access_assignments for select
  using (public.is_org_member(org_id) and user_id = auth.uid());

drop policy if exists "product admins read organization assignments" on public.organization_product_access_assignments;
create policy "product admins read organization assignments"
  on public.organization_product_access_assignments for select
  using (public.is_org_product_admin(org_id));

drop policy if exists "product admins read product assignment audit" on public.organization_product_access_audit;
create policy "product admins read product assignment audit"
  on public.organization_product_access_audit for select
  using (public.is_org_product_admin(org_id));

grant select on public.organization_product_access_assignments to authenticated;
grant select on public.organization_product_access_audit to authenticated;
revoke insert, update, delete, truncate on public.organization_product_access_assignments
  from anon, authenticated;
revoke insert, update, delete, truncate on public.organization_product_access_audit
  from anon, authenticated;

create or replace function public.set_organization_product_assignments(
  p_org_id uuid,
  p_user_id uuid,
  p_product_slugs text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_slug text;
begin
  if not public.is_org_product_admin(p_org_id) then
    raise exception 'Only an organization owner or super administrator may manage product access.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'The selected user is not an active member of this organization.';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_product_slugs, '{}'::text[])) as requested(slug)
    where requested.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ) then
    raise exception 'One or more product identifiers are invalid.';
  end if;

  update public.organization_product_access_assignments
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where org_id = p_org_id
    and user_id = p_user_id
    and is_active
    and not (product_slug = any(coalesce(p_product_slugs, '{}'::text[])));

  for requested_slug in
    select distinct requested.slug
    from unnest(coalesce(p_product_slugs, '{}'::text[])) as requested(slug)
  loop
    insert into public.organization_product_access_assignments (
      org_id, user_id, product_slug, is_active, created_by, updated_by
    )
    values (p_org_id, p_user_id, requested_slug, true, auth.uid(), auth.uid())
    on conflict (org_id, user_id, product_slug) do update
      set is_active = true,
          updated_by = auth.uid(),
          updated_at = now()
      where not public.organization_product_access_assignments.is_active;
  end loop;
end;
$$;

revoke all on function public.set_organization_product_assignments(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_organization_product_assignments(uuid, uuid, text[]) to authenticated;
