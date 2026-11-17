begin;

create or replace function public.education_communication_update_draft(
  p_org_id uuid,
  p_communication_id uuid,
  p_title text,
  p_body text,
  p_audience text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  communication_row public.education_communications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to edit an announcement.' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000
    or p_audience is null or p_audience not in ('all', 'guardians', 'students', 'staff') then
    raise exception 'Announcement details are invalid.' using errcode = '22023';
  end if;

  select * into communication_row
  from public.education_communications
  where org_id = p_org_id and id = p_communication_id
  for update;
  if not found then
    raise exception 'The announcement was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, communication_row.branch_id, 'education_communication', 'edit'
  ) then
    raise exception 'You are not authorized to edit announcements at this campus.' using errcode = '42501';
  end if;
  if communication_row.status <> 'draft' then
    raise exception 'Only a draft announcement can be edited.' using errcode = '22023';
  end if;

  update public.education_communications
  set title = btrim(p_title),
      body = btrim(p_body),
      audience = p_audience,
      updated_at = now()
  where org_id = p_org_id and id = p_communication_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_communication_draft_updated',
    'education_communication', p_communication_id,
    jsonb_build_object(
      'branch_id', communication_row.branch_id,
      'previous_title', communication_row.title,
      'title', btrim(p_title),
      'previous_audience', communication_row.audience,
      'audience', p_audience
    )
  );
  return true;
end;
$$;

revoke all on function public.education_communication_update_draft(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.education_communication_update_draft(uuid, uuid, text, text, text) to authenticated;

commit;
