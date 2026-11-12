alter table public.education_staff
  add column if not exists other_names text,
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

create table if not exists public.education_staff_employment_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  staff_id uuid not null,
  employment_type text not null
    check (employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'casual')),
  job_title text not null check (char_length(btrim(job_title)) between 1 and 120),
  department_id uuid,
  department_name text,
  effective_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, staff_id, effective_on),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, staff_id)
    references public.education_staff(org_id, id) on delete restrict,
  foreign key (org_id, department_id)
    references public.education_departments(org_id, id) on delete restrict
);

create index if not exists education_staff_employment_history_idx
  on public.education_staff_employment_records (org_id, staff_id, effective_on desc, created_at desc);

alter table public.education_staff_employment_records enable row level security;
create policy "education staff employment read"
  on public.education_staff_employment_records for select
  using (
    public.education_can_access_branch(org_id, branch_id, 'education_staff', 'view')
    or exists (
      select 1
      from public.education_staff staff
      where staff.org_id = education_staff_employment_records.org_id
        and staff.id = education_staff_employment_records.staff_id
        and public.education_can_access_branch(staff.org_id, staff.branch_id, 'education_staff', 'view')
    )
  );

revoke all on public.education_staff_employment_records from anon, authenticated;
grant select on public.education_staff_employment_records to authenticated;

revoke update on public.education_staff from authenticated;

create or replace function public.education_staff_update_profile(
  p_org_id uuid,
  p_staff_id uuid,
  p_first_name text,
  p_last_name text,
  p_other_names text,
  p_email text,
  p_phone text,
  p_date_of_birth date,
  p_address text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_staff_id is null
    or p_first_name is null or char_length(btrim(p_first_name)) not between 1 and 100
    or p_last_name is null or char_length(btrim(p_last_name)) not between 1 and 100
    or (p_other_names is not null and char_length(btrim(p_other_names)) > 100)
    or (p_email is not null and (
      char_length(btrim(p_email)) > 254
      or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_phone is not null and char_length(btrim(p_phone)) > 32)
    or (p_date_of_birth is not null and p_date_of_birth > current_date)
    or (p_address is not null and char_length(btrim(p_address)) > 500)
    or (p_emergency_contact_name is not null and char_length(btrim(p_emergency_contact_name)) > 120)
    or (p_emergency_contact_phone is not null and char_length(btrim(p_emergency_contact_phone)) > 32) then
    raise exception 'Staff profile details are invalid.' using errcode = '22023';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.id = p_staff_id
  for update;
  if not found then
    raise exception 'The staff member is unavailable.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, staff_row.branch_id, 'education_staff', 'edit') then
    raise exception 'You cannot edit this staff profile.' using errcode = '42501';
  end if;

  update public.education_staff
  set first_name = btrim(p_first_name),
      last_name = btrim(p_last_name),
      other_names = nullif(btrim(p_other_names), ''),
      email = nullif(btrim(p_email), ''),
      phone = nullif(btrim(p_phone), ''),
      date_of_birth = p_date_of_birth,
      address = nullif(btrim(p_address), ''),
      emergency_contact_name = nullif(btrim(p_emergency_contact_name), ''),
      emergency_contact_phone = nullif(btrim(p_emergency_contact_phone), ''),
      updated_at = now()
  where org_id = p_org_id
    and id = p_staff_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_staff_profile_updated',
    'education_staff', p_staff_id,
    jsonb_build_object(
      'branch_id', staff_row.branch_id,
      'updated_fields', jsonb_build_array(
        'first_name', 'last_name', 'other_names', 'email', 'phone',
        'date_of_birth', 'address', 'emergency_contact_name', 'emergency_contact_phone'
      )
    )
  );
  return true;
end;
$$;

create or replace function public.education_staff_record_employment(
  p_org_id uuid,
  p_staff_id uuid,
  p_employment_type text,
  p_job_title text,
  p_department_id uuid,
  p_effective_on date,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
  department_row public.education_departments%rowtype;
  employment_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_staff_id is null
    or p_employment_type is null
    or p_employment_type not in ('full_time', 'part_time', 'contract', 'temporary', 'casual')
    or p_job_title is null or char_length(btrim(p_job_title)) not between 1 and 120
    or p_effective_on is null or p_effective_on > current_date
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Employment record details are invalid.' using errcode = '22023';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.id = p_staff_id
  for update;
  if not found then
    raise exception 'The staff member is unavailable.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, staff_row.branch_id, 'education_staff', 'edit') then
    raise exception 'You cannot update employment details at this campus.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.education_staff_employment_records record
    where record.org_id = p_org_id
      and record.staff_id = p_staff_id
      and record.effective_on >= p_effective_on
  ) then
    raise exception 'Employment changes must be recorded after the latest effective date.' using errcode = '23514';
  end if;

  if p_department_id is not null then
    select department.* into department_row
    from public.education_departments department
    where department.org_id = p_org_id
      and department.id = p_department_id
      and department.is_active
      and (department.branch_id is null or department.branch_id = staff_row.branch_id);
    if not found then
      raise exception 'The selected department is unavailable at this campus.' using errcode = '22023';
    end if;
  end if;

  insert into public.education_staff_employment_records (
    org_id, branch_id, staff_id, employment_type, job_title,
    department_id, department_name, effective_on, reason, created_by
  ) values (
    p_org_id, staff_row.branch_id, p_staff_id, p_employment_type, btrim(p_job_title),
    p_department_id, department_row.name, p_effective_on, btrim(p_reason), auth.uid()
  )
  returning id into employment_id;

  update public.education_staff
  set job_title = btrim(p_job_title),
      department_id = p_department_id,
      updated_at = now()
  where org_id = p_org_id
    and id = p_staff_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_staff_employment_recorded',
    'education_staff_employment_record', employment_id,
    jsonb_build_object(
      'branch_id', staff_row.branch_id,
      'staff_id', p_staff_id,
      'employment_type', p_employment_type,
      'job_title', btrim(p_job_title),
      'department_id', p_department_id,
      'effective_on', p_effective_on
    )
  );
  return employment_id;
end;
$$;

revoke all on function public.education_staff_update_profile(uuid, uuid, text, text, text, text, text, date, text, text, text)
  from public, anon;
grant execute on function public.education_staff_update_profile(uuid, uuid, text, text, text, text, text, date, text, text, text)
  to authenticated;
revoke all on function public.education_staff_record_employment(uuid, uuid, text, text, uuid, date, text)
  from public, anon;
grant execute on function public.education_staff_record_employment(uuid, uuid, text, text, uuid, date, text)
  to authenticated;
