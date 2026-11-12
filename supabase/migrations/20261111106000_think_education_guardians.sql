begin;

create table if not exists public.education_guardians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, user_id)
);

create table if not exists public.education_student_guardians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null check (char_length(btrim(relationship)) between 1 and 60),
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'revoked')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, student_id, guardian_id),
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, guardian_id)
    references public.education_guardians(org_id, id) on delete restrict,
  check ((status = 'verified' and verified_at is not null) or status <> 'verified')
);

create index if not exists education_guardians_org_name_idx
  on public.education_guardians (org_id, last_name, first_name);
create index if not exists education_student_guardians_branch_student_idx
  on public.education_student_guardians (org_id, branch_id, student_id, status);
create index if not exists education_student_guardians_guardian_idx
  on public.education_student_guardians (org_id, guardian_id, status);

alter table public.education_guardians enable row level security;
alter table public.education_student_guardians enable row level security;

create or replace function public.education_guardian_user_can_view(
  target_org_id uuid,
  target_guardian_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.education_guardians guardian
    where guardian.org_id = target_org_id
      and guardian.id = target_guardian_id
      and guardian.user_id = auth.uid()
  );
$$;

revoke all on function public.education_guardian_user_can_view(uuid, uuid) from public, anon;
grant execute on function public.education_guardian_user_can_view(uuid, uuid) to authenticated;

create policy "education guardians read"
  on public.education_guardians for select
  using (
    public.education_guardian_user_can_view(org_id, id)
    or exists (
      select 1
      from public.education_student_guardians relationship
      where relationship.org_id = education_guardians.org_id
        and relationship.guardian_id = education_guardians.id
        and public.education_can_access_branch(
          relationship.org_id, relationship.branch_id, 'education_guardians', 'view'
        )
    )
  );

create policy "education guardian relationships read"
  on public.education_student_guardians for select
  using (
    public.education_can_access_branch(org_id, branch_id, 'education_guardians', 'view')
    or public.education_guardian_user_can_view(org_id, guardian_id)
  );

create or replace function public.education_create_guardian_link(
  p_org_id uuid,
  p_branch_id uuid,
  p_student_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_relationship text,
  p_is_primary boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian_id uuid;
  relationship_id uuid;
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

  if not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_guardians', 'create'
  ) or not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_students', 'view'
  ) then
    raise exception 'You are not authorized to create guardian relationships at this campus.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = p_student_id
      and student.status = 'active'
  ) then
    raise exception 'The selected student was not found at this campus.'
      using errcode = 'P0002';
  end if;

  insert into public.education_guardians (
    org_id, first_name, last_name, email, phone, created_by
  ) values (
    p_org_id, btrim(p_first_name), btrim(p_last_name),
    nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), ''), auth.uid()
  ) returning id into guardian_id;

  insert into public.education_student_guardians (
    org_id, branch_id, student_id, guardian_id, relationship, is_primary, created_by
  ) values (
    p_org_id, p_branch_id, p_student_id, guardian_id, btrim(p_relationship),
    coalesce(p_is_primary, false), auth.uid()
  ) returning id into relationship_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_relationship_created', 'education_student_guardian',
    relationship_id, jsonb_build_object(
      'branch_id', p_branch_id,
      'student_id', p_student_id,
      'guardian_id', guardian_id,
      'status', 'pending'
    )
  );
  return relationship_id;
end;
$$;

create or replace function public.education_verify_guardian_link(
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
    p_org_id, relationship_row.branch_id, 'education_guardians', 'edit'
  ) then
    raise exception 'You are not authorized to verify guardian relationships at this campus.'
      using errcode = '42501';
  end if;
  if relationship_row.status <> 'pending' then
    raise exception 'Only pending guardian relationships can be verified.'
      using errcode = '22023';
  end if;

  update public.education_student_guardians
  set status = 'verified', verified_by = auth.uid(), verified_at = now()
  where org_id = p_org_id and id = p_relationship_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_relationship_verified', 'education_student_guardian',
    p_relationship_id, jsonb_build_object(
      'branch_id', relationship_row.branch_id,
      'student_id', relationship_row.student_id,
      'guardian_id', relationship_row.guardian_id
    )
  );
  return true;
end;
$$;

create or replace function public.education_link_existing_guardian(
  p_org_id uuid,
  p_branch_id uuid,
  p_student_id uuid,
  p_guardian_id uuid,
  p_relationship text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  relationship_id uuid;
begin
  if p_relationship is null or char_length(btrim(p_relationship)) not between 1 and 60 then
    raise exception 'The guardian relationship is invalid.'
      using errcode = '22023';
  end if;

  if not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_guardians', 'create'
  ) or not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_students', 'view'
  ) then
    raise exception 'You are not authorized to create guardian relationships at this campus.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = p_student_id
      and student.status = 'active'
  ) then
    raise exception 'The selected student was not found at this campus.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.education_guardians guardian
    where guardian.org_id = p_org_id
      and guardian.id = p_guardian_id
      and guardian.status = 'active'
  ) then
    raise exception 'The active guardian profile was not found in this organization.'
      using errcode = 'P0002';
  end if;

  insert into public.education_student_guardians (
    org_id, branch_id, student_id, guardian_id, relationship, created_by
  ) values (
    p_org_id, p_branch_id, p_student_id, p_guardian_id, btrim(p_relationship), auth.uid()
  ) returning id into relationship_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_relationship_created', 'education_student_guardian',
    relationship_id, jsonb_build_object(
      'branch_id', p_branch_id,
      'student_id', p_student_id,
      'guardian_id', p_guardian_id,
      'status', 'pending'
    )
  );
  return relationship_id;
end;
$$;

revoke all on function public.education_create_guardian_link(uuid, uuid, uuid, text, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.education_create_guardian_link(uuid, uuid, uuid, text, text, text, text, text, boolean)
  to authenticated;
revoke all on function public.education_link_existing_guardian(uuid, uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.education_link_existing_guardian(uuid, uuid, uuid, uuid, text)
  to authenticated;
revoke all on function public.education_verify_guardian_link(uuid, uuid) from public, anon;
grant execute on function public.education_verify_guardian_link(uuid, uuid) to authenticated;

grant select on public.education_guardians, public.education_student_guardians to authenticated;
revoke insert, update, delete on public.education_guardians, public.education_student_guardians from authenticated;
revoke all on public.education_guardians, public.education_student_guardians from anon;

commit;
