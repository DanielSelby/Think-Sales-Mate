begin;

alter table public.education_expenses
  add column if not exists request_id uuid;

create unique index if not exists education_expenses_request_id_unique_idx
  on public.education_expenses (org_id, created_by, request_id)
  where request_id is not null;

drop function if exists public.education_create_expense(uuid, uuid, text, text, text, numeric, date, text);

create function public.education_create_expense(
  p_org_id uuid,
  p_branch_id uuid,
  p_category text,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_reference text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_id uuid;
begin
  if auth.uid() is null
    or p_category is null or char_length(btrim(p_category)) not between 1 and 100
    or char_length(coalesce(p_vendor, '')) > 160
    or p_description is null or char_length(btrim(p_description)) not between 1 and 500
    or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
    or p_amount <> round(p_amount, 2)
    or p_expense_date is null or p_expense_date > current_date
    or char_length(coalesce(p_reference, '')) > 120
    or p_request_id is null then
    raise exception 'Expense details are invalid.'
      using errcode = '22023';
  end if;

  if not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_expenses', 'create'
  ) then
    raise exception 'You are not authorized to create expenses at this campus.'
      using errcode = '42501';
  end if;

  insert into public.education_expenses (
    org_id, branch_id, category, vendor, description, amount,
    expense_date, reference, created_by, request_id
  ) values (
    p_org_id, p_branch_id, btrim(p_category), nullif(btrim(p_vendor), ''),
    btrim(p_description), p_amount, p_expense_date, nullif(btrim(p_reference), ''),
    auth.uid(), p_request_id
  )
  on conflict (org_id, created_by, request_id) where request_id is not null
  do nothing
  returning id into expense_id;

  if expense_id is null then
    select expense.id into expense_id
    from public.education_expenses expense
    where expense.org_id = p_org_id
      and expense.created_by = auth.uid()
      and expense.request_id = p_request_id;
    if expense_id is null then
      raise exception 'The duplicate expense submission could not be resolved.'
        using errcode = 'P0001';
    end if;
    return expense_id;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_expense_created', 'education_expense', expense_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'category', btrim(p_category),
      'amount', p_amount,
      'expense_date', p_expense_date,
      'status', 'pending_approval'
    )
  );
  return expense_id;
end;
$$;

create or replace function public.education_update_expense(
  p_org_id uuid,
  p_expense_id uuid,
  p_category text,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_reference text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row public.education_expenses%rowtype;
begin
  select * into expense_row
  from public.education_expenses
  where org_id = p_org_id and id = p_expense_id
  for update;
  if not found then
    raise exception 'The expense record was not found.' using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, expense_row.branch_id, 'education_expenses', 'edit'
  ) then
    raise exception 'You are not authorized to edit expenses at this campus.' using errcode = '42501';
  end if;

  if expense_row.status not in ('pending_approval', 'rejected')
    or expense_row.payment_status <> 'unpaid'
    or p_category is null or char_length(btrim(p_category)) not between 1 and 100
    or char_length(coalesce(p_vendor, '')) > 160
    or p_description is null or char_length(btrim(p_description)) not between 1 and 500
    or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
    or p_amount <> round(p_amount, 2)
    or p_expense_date is null or p_expense_date > current_date
    or char_length(coalesce(p_reference, '')) > 120 then
    raise exception 'Only pending or rejected unpaid expenses can be edited with valid details.'
      using errcode = '22023';
  end if;

  update public.education_expenses
  set category = btrim(p_category),
      vendor = nullif(btrim(p_vendor), ''),
      description = btrim(p_description),
      amount = p_amount,
      expense_date = p_expense_date,
      reference = nullif(btrim(p_reference), ''),
      status = 'pending_approval',
      rejection_reason = null,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
  where org_id = p_org_id and id = p_expense_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_expense_updated', 'education_expense', p_expense_id,
    jsonb_build_object(
      'branch_id', expense_row.branch_id,
      'previous_status', expense_row.status,
      'previous_amount', expense_row.amount,
      'amount', p_amount,
      'expense_date', p_expense_date,
      'status', 'pending_approval'
    )
  );
  return true;
end;
$$;

create or replace function public.education_delete_expense(
  p_org_id uuid,
  p_expense_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row public.education_expenses%rowtype;
begin
  select * into expense_row
  from public.education_expenses
  where org_id = p_org_id and id = p_expense_id
  for update;
  if not found then
    raise exception 'The expense record was not found.' using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, expense_row.branch_id, 'education_expenses', 'delete'
  ) then
    raise exception 'You are not authorized to delete expenses at this campus.' using errcode = '42501';
  end if;

  if expense_row.status not in ('pending_approval', 'rejected')
    or expense_row.payment_status <> 'unpaid' then
    raise exception 'Only pending or rejected unpaid expenses can be deleted.'
      using errcode = '22023';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_expense_deleted', 'education_expense', p_expense_id,
    jsonb_build_object(
      'branch_id', expense_row.branch_id,
      'expense_number', expense_row.expense_number,
      'category', expense_row.category,
      'description', expense_row.description,
      'amount', expense_row.amount,
      'expense_date', expense_row.expense_date,
      'status', expense_row.status
    )
  );

  delete from public.education_expenses
  where org_id = p_org_id and id = p_expense_id;
  return true;
end;
$$;

revoke all on function public.education_create_expense(uuid, uuid, text, text, text, numeric, date, text, uuid)
  from public, anon;
grant execute on function public.education_create_expense(uuid, uuid, text, text, text, numeric, date, text, uuid)
  to authenticated;
revoke all on function public.education_update_expense(uuid, uuid, text, text, text, numeric, date, text)
  from public, anon;
grant execute on function public.education_update_expense(uuid, uuid, text, text, text, numeric, date, text)
  to authenticated;
revoke all on function public.education_delete_expense(uuid, uuid)
  from public, anon;
grant execute on function public.education_delete_expense(uuid, uuid)
  to authenticated;

commit;
