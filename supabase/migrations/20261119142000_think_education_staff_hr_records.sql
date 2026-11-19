begin;

create table if not exists public.education_staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  staff_id uuid not null,
  qualification text not null check (char_length(btrim(qualification)) between 1 and 160),
  institution text,
  field_of_study text,
  awarded_on date,
  expires_on date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict,
  check (institution is null or char_length(btrim(institution)) <= 160),
  check (field_of_study is null or char_length(btrim(field_of_study)) <= 160),
  check (expires_on is null or awarded_on is null or expires_on >= awarded_on)
);

create table if not exists public.education_staff_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  staff_id uuid not null,
  contract_type text not null check (contract_type in ('permanent', 'fixed_term', 'temporary', 'casual', 'consultant')),
  reference_number text,
  position_title text not null check (char_length(btrim(position_title)) between 1 and 120),
  start_on date not null,
  end_on date,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'terminated')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict,
  check (reference_number is null or char_length(btrim(reference_number)) <= 80),
  check (notes is null or char_length(btrim(notes)) <= 1000),
  check (end_on is null or end_on >= start_on)
);

create index if not exists education_staff_qualifications_staff_idx
  on public.education_staff_qualifications (org_id, branch_id, staff_id, awarded_on desc);
create index if not exists education_staff_contracts_staff_idx
  on public.education_staff_contracts (org_id, branch_id, staff_id, start_on desc);

alter table public.education_staff_qualifications enable row level security;
alter table public.education_staff_contracts enable row level security;

create policy "education staff qualifications read"
  on public.education_staff_qualifications for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'view'));
create policy "education staff contracts read"
  on public.education_staff_contracts for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'view'));

grant select on public.education_staff_qualifications, public.education_staff_contracts to authenticated;
revoke insert, update, delete on public.education_staff_qualifications, public.education_staff_contracts from authenticated;
revoke all on public.education_staff_qualifications, public.education_staff_contracts from anon;

create or replace function public.education_staff_qualification_save(
  p_org_id uuid,
  p_staff_id uuid,
  p_qualification_id uuid,
  p_qualification text,
  p_institution text,
  p_field_of_study text,
  p_awarded_on date,
  p_expires_on date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
  record_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_staff_id is null
    or p_qualification is null or char_length(btrim(p_qualification)) not between 1 and 160
    or char_length(btrim(coalesce(p_institution, ''))) > 160
    or char_length(btrim(coalesce(p_field_of_study, ''))) > 160
    or (p_awarded_on is not null and p_expires_on is not null and p_expires_on < p_awarded_on) then
    raise exception 'Qualification details are invalid.' using errcode = '22023';
  end if;

  select * into staff_row
  from public.education_staff
  where org_id = p_org_id and id = p_staff_id
  for update;
  if not found then
    raise exception 'The staff record was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, staff_row.branch_id, 'education_staff', 'edit') then
    raise exception 'You cannot edit staff records at this campus.' using errcode = '42501';
  end if;

  if p_qualification_id is null then
    insert into public.education_staff_qualifications (
      org_id, branch_id, staff_id, qualification, institution, field_of_study, awarded_on, expires_on
    ) values (
      p_org_id, staff_row.branch_id, p_staff_id, btrim(p_qualification),
      nullif(btrim(p_institution), ''), nullif(btrim(p_field_of_study), ''), p_awarded_on, p_expires_on
    ) returning id into record_id;
  else
    update public.education_staff_qualifications
    set qualification = btrim(p_qualification),
        institution = nullif(btrim(p_institution), ''),
        field_of_study = nullif(btrim(p_field_of_study), ''),
        awarded_on = p_awarded_on,
        expires_on = p_expires_on,
        updated_at = now()
    where org_id = p_org_id
      and branch_id = staff_row.branch_id
      and staff_id = p_staff_id
      and id = p_qualification_id
    returning id into record_id;
    if not found then
      raise exception 'The qualification was not found.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(),
    case when p_qualification_id is null then 'education_staff_qualification_created' else 'education_staff_qualification_updated' end,
    'education_staff_qualification', record_id,
    jsonb_build_object('staff_id', p_staff_id, 'branch_id', staff_row.branch_id, 'qualification', btrim(p_qualification))
  );
  return record_id;
end;
$$;

create or replace function public.education_staff_contract_save(
  p_org_id uuid,
  p_staff_id uuid,
  p_contract_id uuid,
  p_contract_type text,
  p_reference_number text,
  p_position_title text,
  p_start_on date,
  p_end_on date,
  p_status text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
  record_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_staff_id is null
    or p_contract_type is null or p_contract_type not in ('permanent', 'fixed_term', 'temporary', 'casual', 'consultant')
    or char_length(btrim(coalesce(p_reference_number, ''))) > 80
    or p_position_title is null or char_length(btrim(p_position_title)) not between 1 and 120
    or p_start_on is null or (p_end_on is not null and p_end_on < p_start_on)
    or p_status is null or p_status not in ('draft', 'active', 'completed', 'terminated')
    or char_length(btrim(coalesce(p_notes, ''))) > 1000 then
    raise exception 'Contract details are invalid.' using errcode = '22023';
  end if;

  select * into staff_row
  from public.education_staff
  where org_id = p_org_id and id = p_staff_id
  for update;
  if not found then
    raise exception 'The staff record was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, staff_row.branch_id, 'education_staff', 'edit') then
    raise exception 'You cannot edit staff records at this campus.' using errcode = '42501';
  end if;

  if p_contract_id is null then
    insert into public.education_staff_contracts (
      org_id, branch_id, staff_id, contract_type, reference_number, position_title,
      start_on, end_on, status, notes
    ) values (
      p_org_id, staff_row.branch_id, p_staff_id, p_contract_type,
      nullif(btrim(p_reference_number), ''), btrim(p_position_title),
      p_start_on, p_end_on, p_status, nullif(btrim(p_notes), '')
    ) returning id into record_id;
  else
    update public.education_staff_contracts
    set contract_type = p_contract_type,
        reference_number = nullif(btrim(p_reference_number), ''),
        position_title = btrim(p_position_title),
        start_on = p_start_on,
        end_on = p_end_on,
        status = p_status,
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where org_id = p_org_id
      and branch_id = staff_row.branch_id
      and staff_id = p_staff_id
      and id = p_contract_id
    returning id into record_id;
    if not found then
      raise exception 'The contract was not found.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(),
    case when p_contract_id is null then 'education_staff_contract_created' else 'education_staff_contract_updated' end,
    'education_staff_contract', record_id,
    jsonb_build_object(
      'staff_id', p_staff_id, 'branch_id', staff_row.branch_id,
      'contract_type', p_contract_type, 'status', p_status
    )
  );
  return record_id;
end;
$$;

revoke all on function public.education_staff_qualification_save(uuid, uuid, uuid, text, text, text, date, date)
  from public, anon;
grant execute on function public.education_staff_qualification_save(uuid, uuid, uuid, text, text, text, date, date)
  to authenticated;
revoke all on function public.education_staff_contract_save(uuid, uuid, uuid, text, text, text, date, date, text, text)
  from public, anon;
grant execute on function public.education_staff_contract_save(uuid, uuid, uuid, text, text, text, date, date, text, text)
  to authenticated;

commit;
