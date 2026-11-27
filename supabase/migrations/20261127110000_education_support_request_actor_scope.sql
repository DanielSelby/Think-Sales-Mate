begin;

create or replace function public.education_create_support_request(
  p_org_id uuid,
  p_branch_id uuid,
  p_request_kind text,
  p_category text,
  p_priority text,
  p_subject text,
  p_description text,
  p_requester_name text,
  p_student_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  actor_student_id uuid;
  actor_guardian_id uuid;
  resolved_student_id uuid := p_student_id;
  staff_can_create boolean;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_request_kind is null or p_request_kind not in ('helpdesk', 'complaint')
    or char_length(btrim(coalesce(p_category, ''))) not between 1 and 80
    or p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent')
    or char_length(btrim(coalesce(p_subject, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_description, ''))) not between 1 and 5000
    or char_length(btrim(coalesce(p_requester_name, ''))) not between 1 and 160 then
    raise exception 'Support request details are invalid.' using errcode = '22023';
  end if;

  staff_can_create := coalesce(
    public.education_can_access_branch(p_org_id, p_branch_id, 'education_support', 'create'),
    false
  );

  if not staff_can_create then
    select student.id into actor_student_id
    from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.user_id = auth.uid()
      and student.status = 'active'
    order by student.id
    limit 1;

    if actor_student_id is not null then
      if p_student_id is not null and p_student_id <> actor_student_id then
        raise exception 'You are not authorized to create a support request for this student.' using errcode = '42501';
      end if;
      resolved_student_id := actor_student_id;
    else
      select guardian.id into actor_guardian_id
      from public.education_guardians guardian
      join public.education_student_guardians relationship
        on relationship.org_id = guardian.org_id
        and relationship.guardian_id = guardian.id
        and relationship.branch_id = p_branch_id
        and relationship.status = 'verified'
        and (p_student_id is null or relationship.student_id = p_student_id)
      where guardian.org_id = p_org_id
        and guardian.user_id = auth.uid()
        and guardian.status = 'active'
      order by guardian.id
      limit 1;

      if actor_guardian_id is null then
        raise exception 'You are not authorized to create a support request for this student or campus.' using errcode = '42501';
      end if;
    end if;
  end if;

  if resolved_student_id is not null and not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = resolved_student_id
  ) then
    raise exception 'The selected student was not found.' using errcode = 'P0002';
  end if;

  insert into public.education_support_requests (
    org_id, branch_id, student_id, requester_user_id, requester_name,
    request_kind, category, priority, subject, description, status,
    created_by, updated_at
  ) values (
    p_org_id, p_branch_id, resolved_student_id, auth.uid(), btrim(p_requester_name),
    p_request_kind, btrim(p_category), p_priority, btrim(p_subject), btrim(p_description),
    'open', auth.uid(), now()
  ) returning id into request_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_support_request_created',
    'education_support_request', request_id,
    jsonb_build_object('branch_id', p_branch_id, 'request_kind', p_request_kind,
      'category', p_category, 'priority', p_priority)
  );
  return request_id;
end;
$$;

revoke all on function public.education_create_support_request(uuid, uuid, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.education_create_support_request(uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;

commit;
