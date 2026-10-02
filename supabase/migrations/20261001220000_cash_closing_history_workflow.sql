begin;

drop index if exists public.cash_closings_org_location_date_shift_idx;

create index if not exists cash_closings_org_location_date_shift_idx
  on public.cash_closings (
    org_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    closing_date desc,
    shift
  );

alter table public.cash_closings
  drop constraint if exists cash_closings_status_check;

alter table public.cash_closings
  add constraint cash_closings_status_check
    check (status in ('pending_approval', 'approved', 'rejected', 'reopened'));

alter table public.cash_closings
  add column if not exists staff_id uuid references auth.users(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists approval_decision text
    check (approval_decision in ('approved', 'rejected')),
  add column if not exists approval_comments text;

update public.cash_closings
set staff_id = created_by,
    submitted_at = coalesce(submitted_at, created_at),
    closed_at = coalesce(closed_at, created_at)
where staff_id is null or submitted_at is null or closed_at is null;

alter table public.cash_closing_audit
  add column if not exists location_id uuid references public.business_locations(id) on delete set null;

update public.cash_closing_audit a
set location_id = c.location_id
from public.cash_closings c
where a.closing_id = c.id
  and a.org_id = c.org_id
  and a.location_id is null
  and c.location_id is not null;

alter table public.cash_closing_audit
  drop constraint if exists cash_closing_audit_action_check;

alter table public.cash_closing_audit
  add constraint cash_closing_audit_action_check
  check (action in (
    'created', 'submitted', 'approved', 'rejected', 'explanation_requested',
    'exported', 'printed', 'reopened', 'corrected',
    'reopen_requested', 'reopen_approved', 'reopen_rejected'
  ));

create index if not exists cash_closing_audit_org_location_created_idx
  on public.cash_closing_audit(org_id, location_id, created_at desc);

drop policy if exists "cash closings members read" on public.cash_closings;
create policy "cash closings members read"
  on public.cash_closings for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));

drop policy if exists "cash closings staff create" on public.cash_closings;
create policy "cash closings staff create"
  on public.cash_closings for insert
  with check (
    public.has_org_role(org_id, 'staff')
    and created_by = auth.uid()
    and staff_id = auth.uid()
    and public.can_access_org_location(org_id, location_id)
  );

drop policy if exists "cash closings managers update" on public.cash_closings;
create policy "cash closings managers update"
  on public.cash_closings for update
  using (public.has_org_role(org_id, 'manager') and public.can_access_org_location(org_id, location_id))
  with check (public.has_org_role(org_id, 'manager') and public.can_access_org_location(org_id, location_id));

drop policy if exists "cash closing lines members read" on public.cash_closing_lines;
create policy "cash closing lines members read"
  on public.cash_closing_lines for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.cash_closings c
      where c.id = public.cash_closing_lines.closing_id and c.org_id = public.cash_closing_lines.org_id
        and public.can_access_org_location(c.org_id, c.location_id)
    )
  );

drop policy if exists "cash closing lines staff create" on public.cash_closing_lines;
create policy "cash closing lines staff create"
  on public.cash_closing_lines for insert
  with check (
    public.has_org_role(org_id, 'staff')
    and exists (
      select 1 from public.cash_closings c
      where c.id = public.cash_closing_lines.closing_id and c.org_id = public.cash_closing_lines.org_id
        and c.created_by = auth.uid()
        and public.can_access_org_location(c.org_id, c.location_id)
    )
  );

drop policy if exists "cash closing audit members read" on public.cash_closing_audit;
create policy "cash closing audit members read"
  on public.cash_closing_audit for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));

drop policy if exists "cash closing audit members write" on public.cash_closing_audit;
create policy "cash closing audit members write"
  on public.cash_closing_audit for insert
  with check (
    public.is_org_member(org_id)
    and actor_id = auth.uid()
    and public.can_access_org_location(org_id, location_id)
    and exists (
      select 1 from public.cash_closings c
      where c.id = public.cash_closing_audit.closing_id and c.org_id = public.cash_closing_audit.org_id
        and c.location_id is not distinct from public.cash_closing_audit.location_id
    )
  );

create or replace function public.guard_cash_closing_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_data jsonb;
  new_data jsonb;
begin
  old_data := to_jsonb(old) - array[
    'status', 'approval_decision', 'approval_comments', 'approved_by', 'approved_at',
    'reopen_status', 'reopen_requested_by', 'reopen_requested_at'
  ];
  new_data := to_jsonb(new) - array[
    'status', 'approval_decision', 'approval_comments', 'approved_by', 'approved_at',
    'reopen_status', 'reopen_requested_by', 'reopen_requested_at'
  ];

  if old_data is distinct from new_data
    and not (old.status = 'reopened' and old.reopen_status = 'approved' and new.status = old.status) then
    raise exception 'Cash closing history is immutable. Use the approved reopen workflow to correct a record.';
  end if;

  if old.status <> 'reopened'
    and (new.approval_decision is distinct from old.approval_decision
      or new.approval_comments is distinct from old.approval_comments
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at)
    and not (old.status = 'pending_approval' and new.status in ('approved', 'rejected')) then
    raise exception 'Approval history is immutable outside the approval workflow.';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending_approval' and new.status in ('approved', 'rejected') then
      if new.approved_by is distinct from auth.uid()
        or new.approved_at is null
        or new.approval_decision is distinct from new.status then
        raise exception 'A pending cash closing requires a recorded approval or rejection decision.';
      end if;
    elsif old.status = 'approved' and new.status = 'reopened' then
      if old.reopen_status <> 'requested' or new.reopen_status <> 'approved' then
        raise exception 'Cash closing must follow the approved reopen workflow.';
      end if;
    else
      raise exception 'Invalid cash closing status transition.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cash_closing_history_guard on public.cash_closings;
create trigger cash_closing_history_guard
  before update on public.cash_closings
  for each row execute procedure public.guard_cash_closing_history();

commit;
