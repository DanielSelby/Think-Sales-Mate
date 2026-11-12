revoke insert, update on public.education_academic_terms from authenticated;

create or replace function public.education_guard_academic_year_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status
    and exists (
      select 1
      from public.education_academic_terms term
      where term.org_id = old.org_id
        and term.academic_year_id = old.id
        and term.status in ('planned', 'active')
    ) then
    raise exception 'Complete or remove all planned academic terms before completing the academic year.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.education_guard_academic_year_completion() from public, anon, authenticated;
drop trigger if exists education_academic_year_completion_guard on public.education_academic_years;
create trigger education_academic_year_completion_guard
  before update of status on public.education_academic_years
  for each row execute function public.education_guard_academic_year_completion();

create or replace function public.education_create_academic_term(
  p_org_id uuid,
  p_academic_year_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_sequence_number integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  academic_year public.education_academic_years%rowtype;
  term_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_academic_year_id is null
    or p_name is null or char_length(btrim(p_name)) not between 1 and 80
    or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
    or p_sequence_number is null or p_sequence_number < 1 then
    raise exception 'Academic term details are invalid.' using errcode = '22023';
  end if;
  if not public.education_user_has_branch_scope(p_org_id, null)
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_academics', 'create') then
    raise exception 'Organization-wide Think Education access is required to create academic terms.'
      using errcode = '42501';
  end if;

  select year.* into academic_year
  from public.education_academic_years year
  where year.org_id = p_org_id
    and year.id = p_academic_year_id
  for update;
  if not found then
    raise exception 'The academic year was not found.' using errcode = 'P0002';
  end if;
  if academic_year.status not in ('planned', 'active')
    or p_starts_on < academic_year.starts_on
    or p_ends_on > academic_year.ends_on then
    raise exception 'Academic term dates must fall within a planned or active academic year.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.education_academic_terms term
    where term.org_id = p_org_id
      and term.academic_year_id = p_academic_year_id
      and daterange(term.starts_on, term.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    raise exception 'Academic term dates cannot overlap another term in the same year.'
      using errcode = '23514';
  end if;

  insert into public.education_academic_terms (
    org_id, academic_year_id, name, starts_on, ends_on, sequence_number, status
  ) values (
    p_org_id, p_academic_year_id, btrim(p_name), p_starts_on, p_ends_on, p_sequence_number, 'planned'
  )
  returning id into term_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_academic_term_created',
    'education_academic_term', term_id,
    jsonb_build_object(
      'academic_year_id', p_academic_year_id,
      'name', btrim(p_name),
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'sequence_number', p_sequence_number
    )
  );
  return term_id;
end;
$$;

create or replace function public.education_transition_academic_term(
  p_org_id uuid,
  p_term_id uuid,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  term_row public.education_academic_terms%rowtype;
  year_row public.education_academic_years%rowtype;
  required_action text;
begin
  if auth.uid() is null or p_org_id is null or p_term_id is null
    or p_status is null or p_status not in ('active', 'completed') then
    raise exception 'Academic term status transition is invalid.' using errcode = '22023';
  end if;
  if not public.education_user_has_branch_scope(p_org_id, null) then
    raise exception 'Organization-wide Think Education access is required to update academic terms.'
      using errcode = '42501';
  end if;

  select term.* into term_row
  from public.education_academic_terms term
  where term.org_id = p_org_id
    and term.id = p_term_id
  for update;
  if not found then
    raise exception 'The academic term was not found.' using errcode = 'P0002';
  end if;
  required_action := case when p_status = 'completed' then 'approve' else 'edit' end;
  if not public.has_org_product_permission(p_org_id, 'think-education', 'education_academics', required_action)
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_academics', 'edit') then
    raise exception 'You do not have permission to change this academic term status.'
      using errcode = '42501';
  end if;

  select year.* into year_row
  from public.education_academic_years year
  where year.org_id = p_org_id
    and year.id = term_row.academic_year_id;
  if not found then
    raise exception 'The academic year was not found.' using errcode = 'P0002';
  end if;
  if (p_status = 'active' and (
      term_row.status <> 'planned'
      or year_row.status <> 'active'
      or current_date < term_row.starts_on
      or current_date > term_row.ends_on
    ))
    or (p_status = 'completed' and (
      term_row.status <> 'active'
      or current_date <= term_row.ends_on
    )) then
    raise exception 'Academic term status transition is not available for its current date and academic year.'
      using errcode = '22023';
  end if;

  update public.education_academic_terms
  set status = p_status
  where org_id = p_org_id
    and id = p_term_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_academic_term_' || p_status,
    'education_academic_term', p_term_id,
    jsonb_build_object(
      'academic_year_id', term_row.academic_year_id,
      'previous_status', term_row.status,
      'status', p_status,
      'starts_on', term_row.starts_on,
      'ends_on', term_row.ends_on
    )
  );
  return true;
end;
$$;

revoke all on function public.education_create_academic_term(uuid, uuid, text, date, date, integer)
  from public, anon;
grant execute on function public.education_create_academic_term(uuid, uuid, text, date, date, integer)
  to authenticated;
revoke all on function public.education_transition_academic_term(uuid, uuid, text)
  from public, anon;
grant execute on function public.education_transition_academic_term(uuid, uuid, text)
  to authenticated;
