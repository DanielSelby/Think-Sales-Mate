begin;

create or replace function public.education_archive_fee_schedule(
  p_org_id uuid,
  p_schedule_id uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_row public.education_fee_schedules%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason between 3 and 500 characters is required to archive a fee schedule.'
      using errcode = '22023';
  end if;

  select * into schedule_row
  from public.education_fee_schedules
  where org_id = p_org_id and id = p_schedule_id
  for update;
  if not found then
    raise exception 'The fee schedule was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, schedule_row.branch_id, 'education_finance', 'edit'
  ) then
    raise exception 'You are not authorized to archive fee schedules at this campus.'
      using errcode = '42501';
  end if;

  if schedule_row.status <> 'active' then
    raise exception 'Only active fee schedules can be archived.'
      using errcode = '22023';
  end if;

  update public.education_fee_schedules
  set status = 'archived'
  where org_id = p_org_id and id = p_schedule_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'schedule_archived', 'education_fee_schedule', schedule_row.id,
    jsonb_build_object(
      'branch_id', schedule_row.branch_id,
      'class_id', schedule_row.class_id,
      'academic_year_id', schedule_row.academic_year_id,
      'description', schedule_row.description,
      'amount', schedule_row.amount,
      'reason', btrim(p_reason)
    )
  );
  return true;
end;
$$;

revoke all on function public.education_archive_fee_schedule(uuid, uuid, text) from public, anon;
grant execute on function public.education_archive_fee_schedule(uuid, uuid, text) to authenticated;

commit;
