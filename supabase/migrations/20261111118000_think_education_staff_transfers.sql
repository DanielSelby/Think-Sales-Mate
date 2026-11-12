-- Historical staff activity belongs to the campus where it happened. Keep those
-- branch IDs while linking records to the stable organization-scoped staff ID.
do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'education_timetable_entries',
    'education_asset_assignments',
    'education_staff_leave_requests'
  ] loop
    for constraint_name in
      select constraint_row.conname
      from pg_constraint constraint_row
      where constraint_row.conrelid = format('public.%I', table_name)::regclass
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = 'public.education_staff'::regclass
        and exists (
          select 1
          from unnest(constraint_row.conkey) key_column(attnum)
          join pg_attribute attribute_row
            on attribute_row.attrelid = constraint_row.conrelid
            and attribute_row.attnum = key_column.attnum
          where attribute_row.attname = 'branch_id'
        )
        and exists (
          select 1
          from unnest(constraint_row.conkey) key_column(attnum)
          join pg_attribute attribute_row
            on attribute_row.attrelid = constraint_row.conrelid
            and attribute_row.attnum = key_column.attnum
          where attribute_row.attname = 'staff_id'
        )
    loop
      execute format('alter table public.%I drop constraint %I', table_name, constraint_name);
    end loop;
  end loop;
end;
$$;

alter table public.education_timetable_entries
  add constraint education_timetable_entries_org_staff_fkey
  foreign key (org_id, staff_id)
  references public.education_staff(org_id, id) on delete restrict;

alter table public.education_asset_assignments
  add constraint education_asset_assignments_org_staff_fkey
  foreign key (org_id, staff_id)
  references public.education_staff(org_id, id) on delete restrict;

alter table public.education_staff_leave_requests
  add constraint education_staff_leave_requests_org_staff_fkey
  foreign key (org_id, staff_id)
  references public.education_staff(org_id, id) on delete restrict;

create table if not exists public.education_staff_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null,
  source_branch_id uuid not null,
  destination_branch_id uuid not null,
  effective_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'completed')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(btrim(review_note)) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check (source_branch_id <> destination_branch_id),
  foreign key (org_id, staff_id)
    references public.education_staff(org_id, id) on delete restrict,
  foreign key (org_id, source_branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, destination_branch_id)
    references public.business_locations(org_id, id) on delete restrict
);

create index if not exists education_staff_transfers_org_status_date_idx
  on public.education_staff_transfers (org_id, status, created_at desc);
create index if not exists education_staff_transfers_staff_history_idx
  on public.education_staff_transfers (org_id, staff_id, created_at desc);
create unique index if not exists education_staff_one_pending_transfer_idx
  on public.education_staff_transfers (org_id, staff_id)
  where status in ('pending', 'approved');

alter table public.education_staff_transfers enable row level security;
create policy "education staff transfers read"
  on public.education_staff_transfers for select
  using (
    public.education_can_access_branch(org_id, source_branch_id, 'education_staff', 'view')
    and public.education_can_access_branch(org_id, destination_branch_id, 'education_staff', 'view')
  );
revoke all on public.education_staff_transfers from anon, authenticated;
grant select on public.education_staff_transfers to authenticated;

create or replace function public.education_guard_staff_branch_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is distinct from old.branch_id
    and not (
      current_setting('app.education_staff_transfer_id', true) is not null
      and exists (
        select 1
        from public.education_staff_transfers transfer
        where transfer.org_id = old.org_id
          and transfer.id::text = current_setting('app.education_staff_transfer_id', true)
          and transfer.staff_id = old.id
          and transfer.source_branch_id = old.branch_id
          and transfer.destination_branch_id = new.branch_id
          and transfer.status = 'completed'
      )
    ) then
    raise exception 'Staff campus changes must use the approved audited transfer workflow.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.education_guard_staff_branch_transfer() from public, anon, authenticated;
drop trigger if exists education_staff_transfer_guard on public.education_staff;
create trigger education_staff_transfer_guard
  before update of branch_id on public.education_staff
  for each row execute function public.education_guard_staff_branch_transfer();

create or replace function public.education_staff_transfer_request(
  p_org_id uuid,
  p_staff_id uuid,
  p_source_branch_id uuid,
  p_destination_branch_id uuid,
  p_effective_on date,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
  transfer_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_staff_id is null
    or p_source_branch_id is null or p_destination_branch_id is null
    or p_source_branch_id = p_destination_branch_id or p_effective_on is null
    or p_effective_on < current_date
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Staff transfer details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_source_branch_id, 'education_staff', 'create')
    or not public.education_can_access_branch(p_org_id, p_destination_branch_id, 'education_staff', 'create') then
    raise exception 'You need staff transfer access to both campuses.' using errcode = '42501';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.id = p_staff_id
    and staff.branch_id = p_source_branch_id
    and staff.status = 'active'
  for update;
  if not found then
    raise exception 'The active staff member is not assigned to the source campus.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.business_locations destination
    where destination.org_id = p_org_id
      and destination.id = p_destination_branch_id
      and destination.is_active
  ) then
    raise exception 'The destination campus is not active.' using errcode = '22023';
  end if;

  insert into public.education_staff_transfers (
    org_id, staff_id, source_branch_id, destination_branch_id,
    effective_on, reason, requested_by
  ) values (
    p_org_id, p_staff_id, p_source_branch_id, p_destination_branch_id,
    p_effective_on, btrim(p_reason), auth.uid()
  )
  returning id into transfer_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_staff_transfer_requested',
    'education_staff_transfer', transfer_id,
    jsonb_build_object(
      'staff_id', p_staff_id,
      'branch_id', p_source_branch_id,
      'source_branch_id', p_source_branch_id,
      'destination_branch_id', p_destination_branch_id,
      'effective_on', p_effective_on
    )
  );
  return transfer_id;
end;
$$;

create or replace function public.education_transition_staff_transfer(
  p_transfer_id uuid,
  p_status text,
  p_review_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row public.education_staff_transfers%rowtype;
  staff_row public.education_staff%rowtype;
  required_action text;
  cancelled_timetables integer := 0;
  cleared_class_assignments integer := 0;
begin
  if auth.uid() is null or p_transfer_id is null
    or p_status is null or p_status not in ('approved', 'rejected', 'completed')
    or (p_review_note is not null and char_length(btrim(p_review_note)) > 1000)
    or (p_status = 'rejected' and nullif(btrim(p_review_note), '') is null)
    or (p_status <> 'rejected' and p_review_note is not null) then
    raise exception 'Staff transfer transition is invalid.' using errcode = '22023';
  end if;

  select transfer.* into transfer_row
  from public.education_staff_transfers transfer
  where transfer.id = p_transfer_id;
  if not found then
    raise exception 'Staff transfer was not found.' using errcode = 'P0002';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = transfer_row.org_id
    and staff.id = transfer_row.staff_id
  for update;
  if not found then
    raise exception 'The transferred staff member no longer exists.' using errcode = 'P0002';
  end if;

  select transfer.* into transfer_row
  from public.education_staff_transfers transfer
  where transfer.id = p_transfer_id
  for update;
  if not found then
    raise exception 'Staff transfer was not found.' using errcode = 'P0002';
  end if;

  required_action := case when p_status in ('approved', 'rejected') then 'approve' else 'edit' end;
  if not public.education_can_access_branch(
      transfer_row.org_id, transfer_row.source_branch_id, 'education_staff', required_action
    )
    or not public.education_can_access_branch(
      transfer_row.org_id, transfer_row.destination_branch_id, 'education_staff', required_action
    ) then
    raise exception 'You do not have permission to process transfers at both campuses.' using errcode = '42501';
  end if;

  if p_status in ('approved', 'rejected') then
    if transfer_row.status <> 'pending'
      or transfer_row.requested_by = auth.uid() then
      raise exception 'This request cannot be approved or rejected by this user.' using errcode = '42501';
    end if;
    if staff_row.branch_id <> transfer_row.source_branch_id
      or staff_row.status <> 'active' then
      raise exception 'The staff member is no longer eligible for this transfer.' using errcode = '22023';
    end if;
    update public.education_staff_transfers
    set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(),
        review_note = nullif(btrim(p_review_note), ''), updated_at = now()
    where id = transfer_row.id;
  else
    if transfer_row.status <> 'approved'
      or transfer_row.effective_on > current_date
      or staff_row.branch_id <> transfer_row.source_branch_id
      or staff_row.status <> 'active' then
      raise exception 'This transfer is not eligible for completion.' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.business_locations destination
      where destination.org_id = transfer_row.org_id
        and destination.id = transfer_row.destination_branch_id
        and destination.is_active
    ) then
      raise exception 'The destination campus is no longer active.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.education_asset_assignments assignment
      where assignment.org_id = transfer_row.org_id
        and assignment.branch_id = transfer_row.source_branch_id
        and assignment.staff_id = transfer_row.staff_id
        and assignment.returned_on is null
    ) then
      raise exception 'Return the staff member’s assigned campus assets before completing the transfer.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.education_staff_leave_requests request
      where request.org_id = transfer_row.org_id
        and request.staff_id = transfer_row.staff_id
        and request.status in ('pending', 'approved')
        and request.ends_on >= transfer_row.effective_on
    ) then
      raise exception 'Resolve approved leave that overlaps or follows the transfer date before completing the transfer.' using errcode = '23514';
    end if;

    update public.education_staff_transfers
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = transfer_row.id;

    update public.education_timetable_entries
    set status = 'cancelled', updated_at = now()
    where org_id = transfer_row.org_id
      and branch_id = transfer_row.source_branch_id
      and staff_id = transfer_row.staff_id
      and status = 'active';
    get diagnostics cancelled_timetables = row_count;

    update public.education_classes
    set class_teacher_id = null, updated_at = now()
    where org_id = transfer_row.org_id
      and branch_id = transfer_row.source_branch_id
      and class_teacher_id = transfer_row.staff_id;
    get diagnostics cleared_class_assignments = row_count;

    perform set_config('app.education_staff_transfer_id', transfer_row.id::text, true);
    update public.education_staff
    set branch_id = transfer_row.destination_branch_id,
        updated_at = now()
    where org_id = transfer_row.org_id
      and id = transfer_row.staff_id
      and branch_id = transfer_row.source_branch_id;
    if not found then
      raise exception 'The staff member moved before this transfer could complete.' using errcode = '40001';
    end if;

    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      transfer_row.org_id, auth.uid(), 'education_staff_transfer_completed',
      'education_staff_transfer', transfer_row.id,
      jsonb_build_object(
        'staff_id', transfer_row.staff_id,
        'branch_id', transfer_row.source_branch_id,
        'source_branch_id', transfer_row.source_branch_id,
        'destination_branch_id', transfer_row.destination_branch_id,
        'effective_on', transfer_row.effective_on,
        'cancelled_timetable_entries', cancelled_timetables,
        'cleared_class_teacher_assignments', cleared_class_assignments
      )
    );
  end if;

  if p_status in ('approved', 'rejected') then
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      transfer_row.org_id, auth.uid(), 'education_staff_transfer_' || p_status,
      'education_staff_transfer', transfer_row.id,
      jsonb_build_object(
        'staff_id', transfer_row.staff_id,
        'branch_id', transfer_row.source_branch_id,
        'source_branch_id', transfer_row.source_branch_id,
        'destination_branch_id', transfer_row.destination_branch_id,
        'previous_status', transfer_row.status,
        'status', p_status,
        'review_note', nullif(btrim(p_review_note), '')
      )
    );
  end if;
  return true;
end;
$$;

revoke all on function public.education_staff_transfer_request(uuid, uuid, uuid, uuid, date, text)
  from public, anon;
grant execute on function public.education_staff_transfer_request(uuid, uuid, uuid, uuid, date, text)
  to authenticated;
revoke all on function public.education_transition_staff_transfer(uuid, text, text)
  from public, anon;
grant execute on function public.education_transition_staff_transfer(uuid, text, text)
  to authenticated;
