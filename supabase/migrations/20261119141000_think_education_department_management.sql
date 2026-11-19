begin;

create or replace function public.education_department_save(
  p_org_id uuid,
  p_department_id uuid,
  p_branch_id uuid,
  p_name text,
  p_department_type text,
  p_is_active boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  department_row public.education_departments%rowtype;
  saved_department_id uuid;
  required_action text;
begin
  if auth.uid() is null or p_org_id is null
    or p_name is null or char_length(btrim(p_name)) not between 1 and 120
    or p_department_type is null
    or p_department_type not in ('academic', 'administrative', 'support')
    or p_is_active is null then
    raise exception 'Department details are invalid.' using errcode = '22023';
  end if;

  if p_department_id is null then
    required_action := 'create';
    if p_branch_id is null then
      if not public.education_can_access_organization(p_org_id, 'education_academics', required_action) then
        raise exception 'Organization-wide access is required to create an institution-wide department.'
          using errcode = '42501';
      end if;
    else
      if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_academics', required_action)
        or not exists (
          select 1
          from public.education_campuses campus
          join public.business_locations location
            on location.org_id = campus.org_id and location.id = campus.branch_id
          where campus.org_id = p_org_id
            and campus.branch_id = p_branch_id
            and campus.status = 'active'
            and location.is_active
        ) then
        raise exception 'Choose an active campus within your assigned scope.'
          using errcode = '42501';
      end if;
    end if;
    insert into public.education_departments (
      org_id, branch_id, name, department_type, is_active
    ) values (
      p_org_id, p_branch_id, btrim(p_name), p_department_type, p_is_active
    ) returning id into saved_department_id;
  else
    select department.* into department_row
    from public.education_departments department
    where department.org_id = p_org_id
      and department.id = p_department_id
    for update;
    if not found then
      raise exception 'The department was not found.' using errcode = 'P0002';
    end if;

    required_action := 'edit';
    if department_row.branch_id is null then
      if not public.education_can_access_organization(p_org_id, 'education_academics', required_action) then
        raise exception 'Organization-wide access is required to edit this department.'
          using errcode = '42501';
      end if;
    elsif not public.education_can_access_branch(
      p_org_id, department_row.branch_id, 'education_academics', required_action
    ) then
      raise exception 'You cannot edit this campus department.' using errcode = '42501';
    end if;

    update public.education_departments
    set name = btrim(p_name),
        department_type = p_department_type,
        is_active = p_is_active
    where org_id = p_org_id
      and id = p_department_id
    returning id into saved_department_id;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    case when p_department_id is null then 'education_department_created' else 'education_department_updated' end,
    'education_department',
    saved_department_id,
    jsonb_build_object(
      'branch_id', coalesce(department_row.branch_id, p_branch_id),
      'name', btrim(p_name),
      'department_type', p_department_type,
      'is_active', p_is_active
    )
  );
  return saved_department_id;
end;
$$;

revoke all on function public.education_department_save(uuid, uuid, uuid, text, text, boolean)
  from public, anon;
grant execute on function public.education_department_save(uuid, uuid, uuid, text, text, boolean)
  to authenticated;

commit;
