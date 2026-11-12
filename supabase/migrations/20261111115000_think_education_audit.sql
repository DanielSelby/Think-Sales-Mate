create or replace function public.education_user_can_view_audit(target_org_id uuid)
returns boolean
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
      and product_permission.product_slug = 'think-education'
    left join public.organization_product_role_templates product_template
      on product_template.org_id = member.org_id
      and product_template.product_slug = 'think-education'
      and product_template.role_key = coalesce(
        product_permission.role_key,
        member.access_permissions ->> 'role_key',
        member.role::text
      )
    left join public.organization_role_templates organization_template
      on organization_template.org_id = member.org_id
      and organization_template.role_key = coalesce(
        product_permission.role_key,
        member.access_permissions ->> 'role_key',
        member.role::text
      )
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and public.has_product_access(target_org_id, 'think-education', false)
      and (
        public.is_org_product_admin(target_org_id)
        or exists (
          select 1
          from public.organization_product_access_assignments assignment
          where assignment.org_id = target_org_id
            and assignment.user_id = auth.uid()
            and assignment.product_slug = 'think-education'
            and assignment.is_active
        )
      )
      and (
        member.role = 'owner'
        or case
          when product_permission.permissions_mode = 'custom' then
            coalesce(product_permission.permissions -> 'education_audit', '[]'::jsonb) ? 'view_audit'
          when product_template.org_id is not null then
            coalesce(product_template.permissions -> 'education_audit', '[]'::jsonb) ? 'view_audit'
          when organization_template.org_id is not null then
            coalesce(organization_template.permissions -> 'education_audit', '[]'::jsonb) ? 'view_audit'
          else
            coalesce(member.access_permissions -> 'role_defaults_fallback' -> 'education_audit', '[]'::jsonb)
              ? 'view_audit'
        end
      )
  );
$$;

revoke all on function public.education_user_can_view_audit(uuid) from public, anon;
grant execute on function public.education_user_can_view_audit(uuid) to authenticated;

create or replace function public.education_audit_member_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scope_row public.education_member_branch_scopes%rowtype;
  audit_action text;
begin
  if tg_op = 'INSERT' then
    scope_row := new;
    audit_action := 'education_member_scope_granted';
  else
    scope_row := old;
    audit_action := 'education_member_scope_revoked';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    scope_row.org_id,
    auth.uid(),
    audit_action,
    'education_member_branch_scope',
    scope_row.branch_id,
    jsonb_build_object(
      'scope_type', scope_row.scope_type,
      'branch_id', scope_row.branch_id,
      'member_user_id', scope_row.user_id
    )
  );
  if tg_op = 'INSERT' then
    return new;
  end if;
  return old;
end;
$$;

revoke all on function public.education_audit_member_scope_change() from public, anon, authenticated;

drop trigger if exists education_member_scope_audit on public.education_member_branch_scopes;
create trigger education_member_scope_audit
  after insert or delete on public.education_member_branch_scopes
  for each row execute function public.education_audit_member_scope_change();

create or replace function public.education_get_audit_activity(
  p_org_id uuid,
  p_branch_id uuid default null,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid,
  actor_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null or p_org_id is null
    or p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 100000
    or (p_search is not null and length(p_search) > 100)
    or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception 'Education activity filters are invalid.' using errcode = '22023';
  end if;
  if not public.education_user_can_view_audit(p_org_id)
    or not public.education_user_has_any_branch_scope(p_org_id) then
    raise exception 'You are not authorized to view Think Education activity.' using errcode = '42501';
  end if;
  if p_branch_id is not null
    and not public.education_user_has_branch_scope(p_org_id, p_branch_id) then
    raise exception 'You do not have access to that Think Education campus.' using errcode = '42501';
  end if;

  return query
  select
    log.id,
    log.actor_id,
    log.action,
    log.entity_type,
    log.entity_id,
    log.metadata,
    log.created_at,
    count(*) over () as total_count
  from public.audit_logs log
  where log.org_id = p_org_id
    and (
      left(log.entity_type, 10) = 'education_'
      or left(log.action, 10) = 'education_'
    )
    and (
      (
        p_branch_id is not null
        and coalesce(log.metadata ->> 'branch_id', log.metadata ->> 'location_id') = p_branch_id::text
      )
      or (
        p_branch_id is null
        and (
          public.education_user_has_branch_scope(p_org_id, null)
          or exists (
            select 1
            from public.education_member_branch_scopes scope
            where scope.org_id = p_org_id
              and scope.user_id = auth.uid()
              and scope.scope_type = 'branch'
              and scope.branch_id::text = coalesce(log.metadata ->> 'branch_id', log.metadata ->> 'location_id')
          )
        )
      )
    )
    and (p_from is null or log.created_at >= p_from)
    and (p_to is null or log.created_at < p_to)
    and (
      nullif(btrim(p_search), '') is null
      or position(
        lower(btrim(p_search)) in lower(concat_ws(' ', log.action, log.entity_type, log.entity_id::text, log.metadata::text))
      ) > 0
    )
  order by log.created_at desc, log.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.education_get_audit_activity(uuid, uuid, text, timestamptz, timestamptz, integer, integer)
  from public, anon;
grant execute on function public.education_get_audit_activity(uuid, uuid, text, timestamptz, timestamptz, integer, integer)
  to authenticated;
