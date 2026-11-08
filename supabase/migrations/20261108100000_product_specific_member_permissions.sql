create table if not exists public.organization_product_role_templates (
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_slug text not null check (product_slug in ('thinksales-erp', 'restaurant', 'think-service-repairs')),
  role_key text not null,
  name text,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (org_id, product_slug, role_key)
);

create table if not exists public.organization_member_product_permissions (
  org_id uuid not null,
  user_id uuid not null,
  product_slug text not null check (product_slug in ('thinksales-erp', 'restaurant', 'think-service-repairs')),
  role_key text not null,
  permissions_mode text not null default 'inherit' check (permissions_mode in ('inherit', 'custom')),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (org_id, user_id, product_slug),
  foreign key (org_id, user_id)
    references public.organization_members(org_id, user_id) on delete cascade,
  foreign key (org_id, user_id, product_slug)
    references public.organization_product_access_assignments(org_id, user_id, product_slug) on delete cascade
);

create index if not exists organization_product_role_templates_lookup_idx
  on public.organization_product_role_templates (org_id, product_slug, role_key);

create index if not exists organization_member_product_permissions_user_idx
  on public.organization_member_product_permissions (org_id, user_id, product_slug);

alter table public.organization_product_role_templates enable row level security;
alter table public.organization_member_product_permissions enable row level security;

drop policy if exists "members read accessible product role templates"
  on public.organization_product_role_templates;
create policy "members read accessible product role templates"
  on public.organization_product_role_templates for select
  using (
    public.is_org_member(org_id)
    and public.has_product_access(org_id, product_slug, false)
    and (
      public.is_org_product_admin(org_id)
      or exists (
        select 1
        from public.organization_product_access_assignments assignment
        where assignment.org_id = organization_product_role_templates.org_id
          and assignment.user_id = auth.uid()
          and assignment.product_slug = organization_product_role_templates.product_slug
          and assignment.is_active
      )
    )
  );

drop policy if exists "product admins manage product role templates"
  on public.organization_product_role_templates;
create policy "product admins manage product role templates"
  on public.organization_product_role_templates for all
  using (public.is_org_product_admin(org_id))
  with check (public.is_org_product_admin(org_id));

drop policy if exists "members read own product permissions"
  on public.organization_member_product_permissions;
create policy "members read own product permissions"
  on public.organization_member_product_permissions for select
  using (
    public.is_org_member(org_id)
    and public.has_product_access(org_id, product_slug, false)
    and exists (
      select 1
      from public.organization_product_access_assignments assignment
      where assignment.org_id = organization_member_product_permissions.org_id
        and assignment.user_id = organization_member_product_permissions.user_id
        and assignment.product_slug = organization_member_product_permissions.product_slug
        and assignment.is_active
    )
    and (
      user_id = auth.uid()
      or public.is_org_product_admin(org_id)
    )
  );

drop policy if exists "product admins manage member product permissions"
  on public.organization_member_product_permissions;
create policy "product admins manage member product permissions"
  on public.organization_member_product_permissions for all
  using (public.is_org_product_admin(org_id))
  with check (public.is_org_product_admin(org_id));

grant select on public.organization_product_role_templates to authenticated;
grant select on public.organization_member_product_permissions to authenticated;
revoke insert, update, delete, truncate on public.organization_product_role_templates
  from anon, authenticated;
revoke insert, update, delete, truncate on public.organization_member_product_permissions
  from anon, authenticated;

create or replace function public.product_permission_module_is_allowed(
  target_product_slug text,
  target_module text
) returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when target_module in ('settings', 'user_management') then false
    when target_module = 'restaurant' or target_module like 'restaurant.%'
      then target_product_slug = 'restaurant'
    when target_module like 'service_%' or target_module = 'customer_assets'
      then target_product_slug = 'think-service-repairs'
    when target_module in (
      'approvals', 'assets', 'banking', 'cash_closing', 'communication',
      'customer_messaging', 'expenses', 'fraud', 'fraud_detection', 'hrm',
      'hrm_payroll', 'payroll', 'cash-closing'
    )
      then target_product_slug in ('thinksales-erp', 'restaurant')
    else target_product_slug = 'thinksales-erp'
  end;
$$;

create or replace function public.filter_product_permission_matrix(
  target_permissions jsonb,
  target_product_slug text
) returns jsonb
language sql
immutable
parallel safe
as $$
  select coalesce(jsonb_object_agg(permission.key, permission.value), '{}'::jsonb)
  from jsonb_each(case
    when jsonb_typeof(target_permissions) = 'object' then target_permissions
    else '{}'::jsonb
  end) as permission
  where public.product_permission_module_is_allowed(
    target_product_slug,
    split_part(permission.key, '.', 1)
  );
$$;

create or replace function public.seed_member_product_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members;
  role_key_value text;
  permission_mode_value text;
  permission_value jsonb;
begin
  if not new.is_active then
    return new;
  end if;

  if not public.has_product_access(new.org_id, new.product_slug, false) then
    return new;
  end if;

  select * into member_row
  from public.organization_members
  where org_id = new.org_id and user_id = new.user_id and status = 'active';
  if not found then
    return new;
  end if;

  insert into public.organization_product_role_templates (
    org_id, product_slug, role_key, name, permissions
  )
  select template.org_id, new.product_slug, template.role_key, template.name,
    public.filter_product_permission_matrix(template.permissions, new.product_slug)
  from public.organization_role_templates template
  where template.org_id = new.org_id
    and template.permissions is not null
  on conflict (org_id, product_slug, role_key) do nothing;

  role_key_value := coalesce(
    nullif(member_row.access_permissions ->> 'role_key', ''),
    member_row.role::text
  );
  role_key_value := case role_key_value
    when 'admin' then 'administrator'
    when 'branch_manager' then 'manager'
    when 'super_admin' then 'owner'
    else role_key_value
  end;
  permission_mode_value := case
    when member_row.access_permissions ->> 'permissions_mode' = 'custom' then 'custom'
    when not exists (
      select 1 from public.organization_role_templates template
      where template.org_id = new.org_id
        and template.role_key = role_key_value
    ) and jsonb_typeof(member_row.access_permissions -> 'role_defaults_fallback') = 'object'
      then 'custom'
    else 'inherit'
  end;
  permission_value := case
    when member_row.access_permissions ->> 'permissions_mode' = 'custom'
      then public.filter_product_permission_matrix(
        coalesce(member_row.access_permissions -> 'permissions', '{}'::jsonb),
        new.product_slug
      )
    when permission_mode_value = 'custom'
      then public.filter_product_permission_matrix(
        coalesce(member_row.access_permissions -> 'role_defaults_fallback', '{}'::jsonb),
        new.product_slug
      )
    else '{}'::jsonb
  end;

  insert into public.organization_member_product_permissions (
    org_id, user_id, product_slug, role_key, permissions_mode, permissions
  ) values (
    new.org_id,
    new.user_id,
    new.product_slug,
    role_key_value,
    permission_mode_value,
    permission_value
  )
  on conflict (org_id, user_id, product_slug) do nothing;

  return new;
end;
$$;

drop trigger if exists organization_product_permission_seed_trigger
  on public.organization_product_access_assignments;
create trigger organization_product_permission_seed_trigger
  after insert or update of is_active on public.organization_product_access_assignments
  for each row execute function public.seed_member_product_permissions();

create or replace function public.seed_product_role_template_from_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_product_role_templates (
    org_id, product_slug, role_key, name, permissions
  )
  select distinct assignment.org_id, assignment.product_slug, new.role_key, new.name,
    public.filter_product_permission_matrix(new.permissions, assignment.product_slug)
  from public.organization_product_access_assignments assignment
  where assignment.org_id = new.org_id
    and assignment.is_active
    and public.has_product_access(assignment.org_id, assignment.product_slug, false)
  on conflict (org_id, product_slug, role_key) do nothing;
  return new;
end;
$$;

drop trigger if exists organization_role_template_product_seed_trigger
  on public.organization_role_templates;
create trigger organization_role_template_product_seed_trigger
  after insert on public.organization_role_templates
  for each row execute function public.seed_product_role_template_from_organization();

insert into public.organization_product_role_templates (
  org_id, product_slug, role_key, name, permissions
)
select distinct assignment.org_id, assignment.product_slug, template.role_key, template.name,
  public.filter_product_permission_matrix(template.permissions, assignment.product_slug)
from public.organization_product_access_assignments assignment
join public.organization_product_entitlements entitlement
  on entitlement.organization_id = assignment.org_id
 and entitlement.product_slug = assignment.product_slug
 and entitlement.registration_state = 'approved'
 and (
   (
     entitlement.status in ('active', 'trial')
     and entitlement.organization_status in ('active', 'trial')
     and (entitlement.current_period_end is null or entitlement.current_period_end > now())
     and (entitlement.status <> 'trial' or entitlement.trial_ends_at is null or entitlement.trial_ends_at > now())
   )
   or (
     entitlement.grace_ends_at > now()
     and entitlement.organization_status in ('active', 'trial', 'expired')
     and entitlement.status in ('grace', 'expired', 'active', 'trial')
   )
 )
join public.organization_role_templates template on template.org_id = assignment.org_id
where assignment.is_active
  and template.permissions is not null
on conflict (org_id, product_slug, role_key) do nothing;

insert into public.organization_product_role_templates (
  org_id, product_slug, role_key, name, permissions
)
select distinct on (assignment.org_id, assignment.product_slug, role_key_value)
  assignment.org_id,
  assignment.product_slug,
  role_key_value,
  role_key_value,
  public.filter_product_permission_matrix(
    coalesce(member.access_permissions -> 'role_defaults_fallback', '{}'::jsonb),
    assignment.product_slug
  )
from public.organization_product_access_assignments assignment
join public.organization_members member
  on member.org_id = assignment.org_id
 and member.user_id = assignment.user_id
 and member.status = 'active'
join public.organization_product_entitlements entitlement
  on entitlement.organization_id = assignment.org_id
 and entitlement.product_slug = assignment.product_slug
 and entitlement.registration_state = 'approved'
 and (
   (
     entitlement.status in ('active', 'trial')
     and entitlement.organization_status in ('active', 'trial')
     and (entitlement.current_period_end is null or entitlement.current_period_end > now())
     and (entitlement.status <> 'trial' or entitlement.trial_ends_at is null or entitlement.trial_ends_at > now())
   )
   or (
     entitlement.grace_ends_at > now()
     and entitlement.organization_status in ('active', 'trial', 'expired')
     and entitlement.status in ('grace', 'expired', 'active', 'trial')
   )
 )
cross join lateral (
  select case coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
    when 'admin' then 'administrator'
    when 'branch_manager' then 'manager'
    when 'super_admin' then 'owner'
    else coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
  end as role_key_value
) role_value
where assignment.is_active
  and not exists (
    select 1 from public.organization_product_role_templates template
    where template.org_id = assignment.org_id
      and template.product_slug = assignment.product_slug
      and template.role_key = role_value.role_key_value
  )
order by assignment.org_id, assignment.product_slug, role_key_value, assignment.user_id
on conflict (org_id, product_slug, role_key) do nothing;

insert into public.organization_member_product_permissions (
  org_id, user_id, product_slug, role_key, permissions_mode, permissions
)
select
  assignment.org_id,
  assignment.user_id,
  assignment.product_slug,
  case coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
    when 'admin' then 'administrator'
    when 'branch_manager' then 'manager'
    when 'super_admin' then 'owner'
    else coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
  end,
  case
    when member.access_permissions ->> 'permissions_mode' = 'custom' then 'custom'
    when not exists (
      select 1
      from public.organization_role_templates template
      where template.org_id = assignment.org_id
        and template.role_key = case coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
          when 'admin' then 'administrator'
          when 'branch_manager' then 'manager'
          when 'super_admin' then 'owner'
          else coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
        end
    ) and jsonb_typeof(member.access_permissions -> 'role_defaults_fallback') = 'object'
      then 'custom'
    else 'inherit'
  end,
  case
    when member.access_permissions ->> 'permissions_mode' = 'custom'
      then public.filter_product_permission_matrix(
        coalesce(member.access_permissions -> 'permissions', '{}'::jsonb),
        assignment.product_slug
      )
    when not exists (
      select 1
      from public.organization_role_templates template
      where template.org_id = assignment.org_id
        and template.role_key = case coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
          when 'admin' then 'administrator'
          when 'branch_manager' then 'manager'
          when 'super_admin' then 'owner'
          else coalesce(nullif(member.access_permissions ->> 'role_key', ''), member.role::text)
        end
    ) and jsonb_typeof(member.access_permissions -> 'role_defaults_fallback') = 'object'
      then public.filter_product_permission_matrix(
        coalesce(member.access_permissions -> 'role_defaults_fallback', '{}'::jsonb),
        assignment.product_slug
      )
    else '{}'::jsonb
  end
from public.organization_product_access_assignments assignment
join public.organization_members member
  on member.org_id = assignment.org_id
 and member.user_id = assignment.user_id
 and member.status = 'active'
join public.organization_product_entitlements entitlement
  on entitlement.organization_id = assignment.org_id
 and entitlement.product_slug = assignment.product_slug
 and entitlement.registration_state = 'approved'
 and (
   (
     entitlement.status in ('active', 'trial')
     and entitlement.organization_status in ('active', 'trial')
     and (entitlement.current_period_end is null or entitlement.current_period_end > now())
     and (entitlement.status <> 'trial' or entitlement.trial_ends_at is null or entitlement.trial_ends_at > now())
   )
   or (
     entitlement.grace_ends_at > now()
     and entitlement.organization_status in ('active', 'trial', 'expired')
     and entitlement.status in ('grace', 'expired', 'active', 'trial')
   )
 )
where assignment.is_active
on conflict (org_id, user_id, product_slug) do nothing;

create or replace function public.set_organization_product_role_permissions(
  p_org_id uuid,
  p_product_slug text,
  p_role_key text,
  p_name text,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_product_admin(p_org_id) then
    raise exception 'Only an organization owner or super administrator may manage product permissions.'
      using errcode = '42501';
  end if;
  if p_product_slug not in ('thinksales-erp', 'restaurant', 'think-service-repairs')
    or not public.has_product_access(p_org_id, p_product_slug, false) then
    raise exception 'This product is not available to the organization.'
      using errcode = '42501';
  end if;
  if coalesce(p_role_key, '') !~ '^[a-z0-9_]+$'
    or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'A valid role key and permission matrix are required.';
  end if;

  insert into public.organization_product_role_templates (
    org_id, product_slug, role_key, name, permissions, updated_by, updated_at
  ) values (
    p_org_id, p_product_slug, p_role_key, nullif(p_name, ''), p_permissions, auth.uid(), now()
  )
  on conflict (org_id, product_slug, role_key) do update
    set name = excluded.name,
        permissions = excluded.permissions,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_organization_member_product_role(
  p_org_id uuid,
  p_user_id uuid,
  p_product_slug text,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_product_admin(p_org_id) then
    raise exception 'Only an organization owner or super administrator may manage product permissions.'
      using errcode = '42501';
  end if;
  if p_product_slug not in ('thinksales-erp', 'restaurant', 'think-service-repairs')
    or not public.has_product_access(p_org_id, p_product_slug, false) then
    raise exception 'This product is not available to the organization.'
      using errcode = '42501';
  end if;
  if p_role_key in ('owner', 'super_admin') then
    raise exception 'Organization administrator roles cannot be assigned as product roles.';
  end if;
  if not exists (
    select 1
    from public.organization_product_access_assignments assignment
    join public.organization_members member
      on member.org_id = assignment.org_id
     and member.user_id = assignment.user_id
     and member.status = 'active'
    where assignment.org_id = p_org_id
      and assignment.user_id = p_user_id
      and assignment.product_slug = p_product_slug
      and assignment.is_active
  ) then
    raise exception 'Assign the member to this product before changing product permissions.';
  end if;
  if not exists (
    select 1 from public.organization_product_role_templates template
    where template.org_id = p_org_id
      and template.product_slug = p_product_slug
      and template.role_key = p_role_key
  ) then
    raise exception 'The selected product role does not exist.';
  end if;

  insert into public.organization_member_product_permissions (
    org_id, user_id, product_slug, role_key, permissions_mode, permissions, updated_by, updated_at
  ) values (
    p_org_id, p_user_id, p_product_slug, p_role_key, 'inherit', '{}'::jsonb, auth.uid(), now()
  )
  on conflict (org_id, user_id, product_slug) do update
    set role_key = excluded.role_key,
        permissions_mode = 'inherit',
        permissions = '{}'::jsonb,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_organization_product_role_permissions(uuid, text, text, text, jsonb)
  from public, anon;
grant execute on function public.set_organization_product_role_permissions(uuid, text, text, text, jsonb)
  to authenticated;
revoke all on function public.set_organization_member_product_role(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.set_organization_member_product_role(uuid, uuid, text, text)
  to authenticated;

create or replace function public.has_org_product_permission(
  target_org_id uuid,
  target_product_slug text,
  target_module text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members member
    left join public.organization_member_product_permissions product_permission
      on product_permission.org_id = member.org_id
     and product_permission.user_id = member.user_id
     and product_permission.product_slug = target_product_slug
    left join public.organization_product_role_templates product_template
      on product_template.org_id = member.org_id
     and product_template.product_slug = target_product_slug
     and product_template.role_key = coalesce(product_permission.role_key, member.access_permissions ->> 'role_key', member.role::text)
    left join public.organization_role_templates organization_template
      on organization_template.org_id = member.org_id
     and organization_template.role_key = coalesce(product_permission.role_key, member.access_permissions ->> 'role_key', member.role::text)
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and public.has_product_access(target_org_id, target_product_slug, target_action <> 'view')
      and (
        public.is_org_product_admin(target_org_id)
        or exists (
          select 1
          from public.organization_product_access_assignments assignment
          where assignment.org_id = target_org_id
            and assignment.user_id = auth.uid()
            and assignment.product_slug = target_product_slug
            and assignment.is_active
        )
      )
      and (
        member.role = 'owner'
        or (
          case
            when product_permission.permissions_mode = 'custom' then
              coalesce(product_permission.permissions -> target_module, '[]'::jsonb) ? target_action
            when product_template.org_id is not null then
              coalesce(product_template.permissions -> target_module, '[]'::jsonb) ? target_action
            when organization_template.org_id is not null then
              coalesce(organization_template.permissions -> target_module, '[]'::jsonb) ? target_action
            else
              coalesce(member.access_permissions -> 'role_defaults_fallback' -> target_module, '[]'::jsonb)
                ? target_action
          end
        )
      )
  );
$$;

revoke all on function public.has_org_product_permission(uuid, text, text, text) from public, anon;
grant execute on function public.has_org_product_permission(uuid, text, text, text) to authenticated;

create or replace function public.has_org_permission(
  target_org_id uuid,
  target_module text,
  target_action text
) returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  active_product_slug text;
  required_product_slug text;
begin
  begin
    active_product_slug := current_setting('request.headers', true)::jsonb ->> 'x-active-product-slug';
  exception when others then
    active_product_slug := null;
  end;

  if target_module in ('settings', 'user_management') or target_module like 'settings.%' then
    active_product_slug := null;
  elsif target_module = 'restaurant' or target_module like 'restaurant.%' then
    required_product_slug := 'restaurant';
  elsif target_module like 'service_%' or target_module = 'customer_assets' then
    required_product_slug := 'think-service-repairs';
  elsif target_module in (
    'approvals', 'assets', 'banking', 'cash_closing', 'communication',
    'customer_messaging', 'expenses', 'fraud', 'fraud_detection', 'hrm',
    'hrm_payroll', 'payroll', 'cash-closing'
  ) then
    if active_product_slug not in ('thinksales-erp', 'restaurant') then
      return false;
    end if;
    required_product_slug := active_product_slug;
  else
    required_product_slug := 'thinksales-erp';
  end if;

  if required_product_slug is not null then
    if active_product_slug is distinct from required_product_slug then
      return false;
    end if;
    return public.has_org_product_permission(
      target_org_id, required_product_slug, target_module, target_action
    );
  end if;

  return exists (
    select 1
    from public.organization_members member
    left join public.organization_role_templates template
      on template.org_id = member.org_id
     and template.role_key = case coalesce(member.access_permissions ->> 'role_key', member.role::text)
       when 'admin' then 'administrator'
       when 'branch_manager' then 'manager'
       when 'super_admin' then 'owner'
       else coalesce(member.access_permissions ->> 'role_key', member.role::text)
     end
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role = 'owner'
        or (
          case
            when member.access_permissions ->> 'permissions_mode' = 'custom' then
              coalesce(member.access_permissions -> 'permissions' -> target_module, '[]'::jsonb)
                ? target_action
            when template.org_id is not null then
              coalesce(template.permissions -> target_module, '[]'::jsonb) ? target_action
            else
              coalesce(member.access_permissions -> 'role_defaults_fallback' -> target_module, '[]'::jsonb)
                ? target_action
          end
        )
      )
  );
end;
$$;

revoke all on function public.has_org_permission(uuid, text, text) from public, anon;
grant execute on function public.has_org_permission(uuid, text, text) to authenticated;
