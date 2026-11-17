begin;

alter table public.education_results
  add constraint education_results_component_scope_unique
  unique (org_id, branch_id, examination_id, subject_id, id);

create table public.education_assessment_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  examination_id uuid not null,
  subject_id uuid not null,
  name text not null,
  weight_percentage numeric(5, 2) not null check (weight_percentage > 0 and weight_percentage <= 100),
  maximum_score numeric(8, 2) not null check (maximum_score > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, branch_id, examination_id, subject_id, id),
  foreign key (org_id, branch_id, examination_id)
    references public.education_examinations(org_id, branch_id, id) on delete cascade,
  foreign key (org_id, subject_id)
    references public.education_subjects(org_id, id) on delete restrict,
  check (char_length(btrim(name)) between 1 and 80)
);

create unique index education_assessment_components_name_unique
  on public.education_assessment_components (org_id, branch_id, examination_id, subject_id, lower(name));
create index education_assessment_components_scope_idx
  on public.education_assessment_components (org_id, branch_id, examination_id, subject_id);

create table public.education_result_component_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  branch_id uuid not null,
  examination_id uuid not null,
  subject_id uuid not null,
  result_id uuid not null,
  component_id uuid not null,
  score numeric(8, 2) not null check (score >= 0),
  created_at timestamptz not null default now(),
  unique (org_id, result_id, component_id),
  foreign key (org_id, branch_id, examination_id, subject_id, result_id)
    references public.education_results(org_id, branch_id, examination_id, subject_id, id)
    on delete cascade,
  foreign key (org_id, branch_id, examination_id, subject_id, component_id)
    references public.education_assessment_components(org_id, branch_id, examination_id, subject_id, id)
    on delete restrict
);

alter table public.education_assessment_components enable row level security;
alter table public.education_result_component_scores enable row level security;

create policy "education assessment components read"
  on public.education_assessment_components for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_results', 'view'));

create policy "education result component scores read"
  on public.education_result_component_scores for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_results', 'view'));

revoke all on public.education_assessment_components from anon;
revoke all on public.education_result_component_scores from anon;
grant select on public.education_assessment_components to authenticated;
grant select on public.education_result_component_scores to authenticated;
revoke insert, update, delete on public.education_assessment_components from authenticated;
revoke insert, update, delete on public.education_result_component_scores from authenticated;
revoke insert on public.education_results from authenticated;
revoke update on public.education_results from authenticated;
grant update (status, approved_by, updated_at) on public.education_results to authenticated;

create or replace function public.education_save_assessment_components(
  p_org_id uuid,
  p_examination_id uuid,
  p_subject_id uuid,
  p_components jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  examination_row public.education_examinations%rowtype;
  parsed_component_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to configure assessment components.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_components) is distinct from 'array' then
    raise exception 'Assessment components must be a JSON array.' using errcode = '22023';
  end if;
  parsed_component_count := jsonb_array_length(p_components);
  if parsed_component_count not between 1 and 20 then
    raise exception 'Configure between one and twenty assessment components.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_components) as component(id uuid, name text, weight_percentage numeric, maximum_score numeric)
    where component.id is null
      or component.name is null
      or char_length(btrim(component.name)) not between 1 and 80
      or component.weight_percentage is null
      or component.weight_percentage <= 0
      or component.weight_percentage > 100
      or component.maximum_score is null
      or component.maximum_score <= 0
      or component.maximum_score > 999999.99
  ) then
    raise exception 'One or more assessment components contain invalid values.' using errcode = '22023';
  end if;
  if (
    select count(distinct component.id)
    from jsonb_to_recordset(p_components) as component(id uuid)
  ) <> parsed_component_count
  or (
    select count(distinct lower(btrim(component.name)))
    from jsonb_to_recordset(p_components) as component(name text)
  ) <> parsed_component_count then
    raise exception 'Assessment component IDs and names must be unique.' using errcode = '22023';
  end if;
  if (
    select round(sum(component.weight_percentage), 2)
    from jsonb_to_recordset(p_components) as component(weight_percentage numeric)
  ) <> 100 then
    raise exception 'Assessment component weights must total exactly 100 percent.' using errcode = '22023';
  end if;

  select * into examination_row
  from public.education_examinations
  where org_id = p_org_id and id = p_examination_id
  for update;
  if not found then
    raise exception 'The examination was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, examination_row.branch_id, 'education_results', 'edit') then
    raise exception 'You are not authorized to configure assessments at this campus.' using errcode = '42501';
  end if;
  if examination_row.status in ('published', 'cancelled') then
    raise exception 'Assessment components cannot be changed for a published or cancelled examination.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.education_subjects subject
    where subject.org_id = p_org_id and subject.id = p_subject_id and subject.status = 'active'
  ) then
    raise exception 'Choose an active subject in this organization.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.education_results result
    where result.org_id = p_org_id
      and result.examination_id = p_examination_id
      and result.subject_id = p_subject_id
  ) then
    raise exception 'Assessment components are locked after the first result is entered.' using errcode = '22023';
  end if;

  delete from public.education_assessment_components
  where org_id = p_org_id
    and branch_id = examination_row.branch_id
    and examination_id = p_examination_id
    and subject_id = p_subject_id;

  insert into public.education_assessment_components (
    id, org_id, branch_id, examination_id, subject_id, name, weight_percentage, maximum_score, created_by
  )
  select component.id, p_org_id, examination_row.branch_id, p_examination_id, p_subject_id,
         btrim(component.name), component.weight_percentage, component.maximum_score, auth.uid()
  from jsonb_to_recordset(p_components) as component(
    id uuid, name text, weight_percentage numeric, maximum_score numeric
  );

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_assessment_components_saved', 'education_examination', p_examination_id,
    jsonb_build_object(
      'branch_id', examination_row.branch_id,
      'subject_id', p_subject_id,
      'component_count', parsed_component_count,
      'weight_total', 100
    )
  );
  return true;
end;
$$;

create or replace function public.education_create_result(
  p_org_id uuid,
  p_examination_id uuid,
  p_student_id uuid,
  p_subject_id uuid,
  p_score numeric,
  p_maximum_score numeric,
  p_grade_override text,
  p_component_scores jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  examination_row public.education_examinations%rowtype;
  subject_row public.education_subjects%rowtype;
  created_result_id uuid;
  configured_component_count integer;
  aggregate_score numeric(8, 2);
  automatic_grade text;
  final_grade text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to enter results.' using errcode = '42501';
  end if;
  select * into examination_row from public.education_examinations
  where org_id = p_org_id and id = p_examination_id for update;
  if not found then
    raise exception 'The examination was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, examination_row.branch_id, 'education_results', 'create') then
    raise exception 'You are not authorized to enter results at this campus.' using errcode = '42501';
  end if;
  if examination_row.status not in ('completed', 'results_pending') then
    raise exception 'Results can only be entered after an examination is completed.' using errcode = '22023';
  end if;
  select * into subject_row from public.education_subjects
  where org_id = p_org_id and id = p_subject_id and status = 'active';
  if not found then
    raise exception 'Choose an active subject in this organization.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = examination_row.branch_id
      and student.id = p_student_id
  ) then
    raise exception 'The student is not enrolled at the examination campus.' using errcode = '22023';
  end if;
  if p_grade_override is not null and char_length(btrim(p_grade_override)) > 10 then
    raise exception 'The grade override is too long.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_component_scores) is distinct from 'array' then
    raise exception 'Component scores must be a JSON array.' using errcode = '22023';
  end if;

  select count(*) into configured_component_count
  from public.education_assessment_components
  where org_id = p_org_id and branch_id = examination_row.branch_id
    and examination_id = p_examination_id and subject_id = p_subject_id;

  if configured_component_count > 0 then
    if jsonb_array_length(p_component_scores) <> configured_component_count then
      raise exception 'Enter a score for every configured assessment component.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_to_recordset(p_component_scores) as score(component_id uuid, score numeric)
      left join public.education_assessment_components component
        on component.org_id = p_org_id
        and component.branch_id = examination_row.branch_id
        and component.examination_id = p_examination_id
        and component.subject_id = p_subject_id
        and component.id = score.component_id
      where score.component_id is null or score.score is null
        or component.id is null or score.score < 0 or score.score > component.maximum_score
    ) or (
      select count(distinct score.component_id)
      from jsonb_to_recordset(p_component_scores) as score(component_id uuid)
    ) <> configured_component_count then
      raise exception 'A component score is invalid or does not match the configured components.' using errcode = '22023';
    end if;

    select round(sum(score.score / component.maximum_score * component.weight_percentage), 2)
    into aggregate_score
    from jsonb_to_recordset(p_component_scores) as score(component_id uuid, score numeric)
    join public.education_assessment_components component
      on component.org_id = p_org_id
      and component.branch_id = examination_row.branch_id
      and component.examination_id = p_examination_id
      and component.subject_id = p_subject_id
      and component.id = score.component_id;
    p_score := aggregate_score;
    p_maximum_score := 100;
  else
    if jsonb_array_length(p_component_scores) <> 0
      or p_score is null or p_maximum_score is null
      or p_score < 0 or p_maximum_score <= 0 or p_score > p_maximum_score then
      raise exception 'The score and maximum score are invalid.' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1 from public.education_grade_bands
    where org_id = p_org_id and minimum_percentage = 0
  ) then
    select label into automatic_grade
    from public.education_grade_bands
    where org_id = p_org_id
      and minimum_percentage <= p_score / p_maximum_score * 100
    order by minimum_percentage desc
    limit 1;
  end if;
  final_grade := coalesce(nullif(btrim(p_grade_override), ''), automatic_grade);

  insert into public.education_results (
    org_id, branch_id, examination_id, student_id, subject_id, subject_name,
    score, maximum_score, grade, grade_override, entered_by
  ) values (
    p_org_id, examination_row.branch_id, p_examination_id, p_student_id,
    p_subject_id, subject_row.name, p_score, p_maximum_score, final_grade,
    nullif(btrim(p_grade_override), ''), auth.uid()
  ) returning id into created_result_id;

  if configured_component_count > 0 then
    insert into public.education_result_component_scores (
      org_id, branch_id, examination_id, subject_id, result_id, component_id, score
    )
    select p_org_id, examination_row.branch_id, p_examination_id, p_subject_id,
           created_result_id, score.component_id, score.score
    from jsonb_to_recordset(p_component_scores) as score(component_id uuid, score numeric);
  end if;
  return created_result_id;
end;
$$;

create or replace function public.education_update_draft_result_score(
  p_org_id uuid,
  p_result_id uuid,
  p_score numeric,
  p_maximum_score numeric,
  p_grade_override text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.education_results%rowtype;
  automatic_grade text;
  final_grade text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to correct a result.' using errcode = '42501';
  end if;
  select * into result_row
  from public.education_results
  where org_id = p_org_id and id = p_result_id
  for update;
  if not found then
    raise exception 'The result was not found.' using errcode = 'P0002';
  end if;
  if result_row.status <> 'draft' then
    raise exception 'Only draft results can be corrected.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(
    p_org_id, result_row.branch_id, 'education_results', 'edit'
  ) then
    raise exception 'You are not authorized to correct this result.' using errcode = '42501';
  end if;
  if p_score is null or p_maximum_score is null
    or p_score < 0 or p_maximum_score <= 0 or p_score > p_maximum_score
    or p_grade_override is not null and char_length(btrim(p_grade_override)) > 10 then
    raise exception 'The score, maximum score, or grade override is invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.education_assessment_components
    where org_id = p_org_id
      and branch_id = result_row.branch_id
      and examination_id = result_row.examination_id
      and subject_id = result_row.subject_id
  ) then
    raise exception 'Use the component score editor for this weighted result.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.education_grade_bands
    where org_id = p_org_id and minimum_percentage = 0
  ) then
    select label into automatic_grade
    from public.education_grade_bands
    where org_id = p_org_id
      and minimum_percentage <= p_score / p_maximum_score * 100
    order by minimum_percentage desc limit 1;
  end if;
  final_grade := coalesce(nullif(btrim(p_grade_override), ''), automatic_grade);

  update public.education_results
  set score = p_score,
      maximum_score = p_maximum_score,
      grade = final_grade,
      grade_override = nullif(btrim(p_grade_override), ''),
      updated_at = now()
  where org_id = p_org_id and id = p_result_id;
  return true;
end;
$$;

create or replace function public.education_update_draft_result_components(
  p_org_id uuid,
  p_result_id uuid,
  p_grade_override text,
  p_component_scores jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.education_results%rowtype;
  configured_component_count integer;
  aggregate_score numeric(8, 2);
  automatic_grade text;
  final_grade text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update result components.' using errcode = '42501';
  end if;
  select * into result_row
  from public.education_results
  where org_id = p_org_id and id = p_result_id
  for update;
  if not found then
    raise exception 'The result was not found.' using errcode = 'P0002';
  end if;
  if result_row.status <> 'draft' then
    raise exception 'Only draft results can be corrected.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(
    p_org_id, result_row.branch_id, 'education_results', 'edit'
  ) then
    raise exception 'You are not authorized to update this result.' using errcode = '42501';
  end if;
  if p_grade_override is not null and char_length(btrim(p_grade_override)) > 10
    or jsonb_typeof(p_component_scores) is distinct from 'array' then
    raise exception 'The grade override or component scores are invalid.' using errcode = '22023';
  end if;

  select count(*) into configured_component_count
  from public.education_assessment_components
  where org_id = p_org_id and branch_id = result_row.branch_id
    and examination_id = result_row.examination_id and subject_id = result_row.subject_id;
  if configured_component_count = 0
    or jsonb_array_length(p_component_scores) <> configured_component_count then
    raise exception 'Enter a score for every configured assessment component.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_component_scores) as score(component_id uuid, score numeric)
    left join public.education_assessment_components component
      on component.org_id = p_org_id
      and component.branch_id = result_row.branch_id
      and component.examination_id = result_row.examination_id
      and component.subject_id = result_row.subject_id
      and component.id = score.component_id
    where score.component_id is null or score.score is null
      or component.id is null or score.score < 0 or score.score > component.maximum_score
  ) or (
    select count(distinct score.component_id)
    from jsonb_to_recordset(p_component_scores) as score(component_id uuid)
  ) <> configured_component_count then
    raise exception 'A component score is invalid or does not match the configured components.' using errcode = '22023';
  end if;

  select round(sum(score.score / component.maximum_score * component.weight_percentage), 2)
  into aggregate_score
  from jsonb_to_recordset(p_component_scores) as score(component_id uuid, score numeric)
  join public.education_assessment_components component
    on component.org_id = p_org_id
    and component.branch_id = result_row.branch_id
    and component.examination_id = result_row.examination_id
    and component.subject_id = result_row.subject_id
    and component.id = score.component_id;

  if exists (
    select 1 from public.education_grade_bands
    where org_id = p_org_id and minimum_percentage = 0
  ) then
    select label into automatic_grade
    from public.education_grade_bands
    where org_id = p_org_id and minimum_percentage <= aggregate_score
    order by minimum_percentage desc limit 1;
  end if;
  final_grade := coalesce(nullif(btrim(p_grade_override), ''), automatic_grade);

  delete from public.education_result_component_scores
  where org_id = p_org_id and result_id = p_result_id;
  insert into public.education_result_component_scores (
    org_id, branch_id, examination_id, subject_id, result_id, component_id, score
  )
  select p_org_id, result_row.branch_id, result_row.examination_id, result_row.subject_id,
         p_result_id, score.component_id, score.score
  from jsonb_to_recordset(p_component_scores) as score(component_id uuid, score numeric);

  update public.education_results
  set score = aggregate_score,
      maximum_score = 100,
      grade = final_grade,
      grade_override = nullif(btrim(p_grade_override), ''),
      updated_at = now()
  where org_id = p_org_id and id = p_result_id;
  return true;
end;
$$;

revoke all on function public.education_save_assessment_components(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.education_save_assessment_components(uuid, uuid, uuid, jsonb) to authenticated;
revoke all on function public.education_create_result(uuid, uuid, uuid, uuid, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.education_create_result(uuid, uuid, uuid, uuid, numeric, numeric, text, jsonb) to authenticated;
revoke all on function public.education_update_draft_result_score(uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.education_update_draft_result_score(uuid, uuid, numeric, numeric, text) to authenticated;
revoke all on function public.education_update_draft_result_components(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.education_update_draft_result_components(uuid, uuid, text, jsonb) to authenticated;

commit;
