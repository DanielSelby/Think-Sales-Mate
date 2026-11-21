begin;

create or replace function public.education_update_guardian_relationship(
  p_org_id uuid,
  p_relationship_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_relationship text,
  p_is_primary boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  relationship_row public.education_student_guardians%rowtype;
begin
  if p_first_name is null or char_length(btrim(p_first_name)) not between 1 and 100
    or p_last_name is null or char_length(btrim(p_last_name)) not between 1 and 100
    or char_length(coalesce(p_email, '')) > 254
    or (nullif(btrim(p_email), '') is not null
      and btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or char_length(coalesce(p_phone, '')) > 40
    or p_relationship is null or char_length(btrim(p_relationship)) not between 1 and 60 then
    raise exception 'Guardian name, contact details, and relationship are invalid.'
      using errcode = '22023';
  end if;

  select * into relationship_row
  from public.education_student_guardians
  where org_id = p_org_id and id = p_relationship_id
  for update;
  if not found then
    raise exception 'The guardian relationship was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, relationship_row.branch_id, 'education_guardians', 'edit'
  ) then
    raise exception 'You are not authorized to edit guardian relationships at this campus.'
      using errcode = '42501';
  end if;

  perform 1
  from public.education_guardians
  where org_id = p_org_id and id = relationship_row.guardian_id
  for update;
  if not found then
    raise exception 'The guardian profile was not found.'
      using errcode = 'P0002';
  end if;

  update public.education_guardians
  set first_name = btrim(p_first_name),
      last_name = btrim(p_last_name),
      email = nullif(lower(btrim(p_email)), ''),
      phone = nullif(btrim(p_phone), ''),
      updated_at = now()
  where org_id = p_org_id and id = relationship_row.guardian_id;

  if coalesce(p_is_primary, false) then
    update public.education_student_guardians
    set is_primary = false
    where org_id = p_org_id
      and student_id = relationship_row.student_id
      and id <> p_relationship_id
      and is_primary;
  end if;

  update public.education_student_guardians
  set relationship = btrim(p_relationship),
      is_primary = coalesce(p_is_primary, false)
  where org_id = p_org_id and id = p_relationship_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_relationship_updated', 'education_student_guardian',
    p_relationship_id, jsonb_build_object(
      'branch_id', relationship_row.branch_id,
      'student_id', relationship_row.student_id,
      'guardian_id', relationship_row.guardian_id
    )
  );
  return true;
end;
$$;

create or replace function public.education_delete_guardian_relationship(
  p_org_id uuid,
  p_relationship_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  relationship_row public.education_student_guardians%rowtype;
begin
  select * into relationship_row
  from public.education_student_guardians
  where org_id = p_org_id and id = p_relationship_id
  for update;
  if not found then
    raise exception 'The guardian relationship was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, relationship_row.branch_id, 'education_guardians', 'delete'
  ) then
    raise exception 'You are not authorized to remove guardian relationships at this campus.'
      using errcode = '42501';
  end if;

  delete from public.education_student_guardians
  where org_id = p_org_id and id = p_relationship_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_relationship_deleted', 'education_student_guardian',
    p_relationship_id, jsonb_build_object(
      'branch_id', relationship_row.branch_id,
      'student_id', relationship_row.student_id,
      'guardian_id', relationship_row.guardian_id
    )
  );
  return true;
end;
$$;

create or replace function public.education_delete_guardian_profile(
  p_org_id uuid,
  p_guardian_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian_row public.education_guardians%rowtype;
  relationship_row public.education_student_guardians%rowtype;
  relationship_count integer := 0;
begin
  select * into guardian_row
  from public.education_guardians
  where org_id = p_org_id and id = p_guardian_id
  for update;
  if not found then
    raise exception 'The guardian profile was not found.'
      using errcode = 'P0002';
  end if;

  for relationship_row in
    select * from public.education_student_guardians
    where org_id = p_org_id and guardian_id = p_guardian_id
    for update
  loop
    relationship_count := relationship_count + 1;
    if not public.education_can_access_branch(
      p_org_id, relationship_row.branch_id, 'education_guardians', 'delete'
    ) then
      raise exception 'You must have delete access to every campus linked to this guardian.'
        using errcode = '42501';
    end if;
  end loop;

  if relationship_count = 0 and not public.education_can_access_organization(
    p_org_id, 'education_guardians', 'delete'
  ) then
    raise exception 'Organization-wide access is required to remove an unlinked guardian profile.'
      using errcode = '42501';
  end if;

  delete from public.education_student_guardians
  where org_id = p_org_id and guardian_id = p_guardian_id;

  delete from public.education_guardians
  where org_id = p_org_id and id = p_guardian_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_profile_deleted', 'education_guardian',
    p_guardian_id, jsonb_build_object('removed_relationships', relationship_count)
  );
  return true;
end;
$$;

revoke all on function public.education_update_guardian_relationship(uuid, uuid, text, text, text, text, text, boolean)
  from public, anon;
revoke all on function public.education_delete_guardian_relationship(uuid, uuid)
  from public, anon;
revoke all on function public.education_delete_guardian_profile(uuid, uuid)
  from public, anon;

grant execute on function public.education_update_guardian_relationship(uuid, uuid, text, text, text, text, text, boolean)
  to authenticated;
grant execute on function public.education_delete_guardian_relationship(uuid, uuid)
  to authenticated;
grant execute on function public.education_delete_guardian_profile(uuid, uuid)
  to authenticated;

commit;
