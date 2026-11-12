begin;

create table if not exists public.education_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  expense_number bigint generated always as identity,
  category text not null check (char_length(btrim(category)) between 1 and 100),
  vendor text check (vendor is null or char_length(btrim(vendor)) <= 160),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  reference text check (reference is null or char_length(btrim(reference)) <= 120),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'rejected')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid')),
  payment_method text check (
    payment_method is null
    or payment_method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')
  ),
  paid_on date,
  rejection_reason text check (rejection_reason is null or char_length(btrim(rejection_reason)) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, expense_number),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  check (
    (status = 'pending_approval' and reviewed_by is null and reviewed_at is null and rejection_reason is null)
    or (status = 'approved' and reviewed_by is not null and reviewed_at is not null and rejection_reason is null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null and rejection_reason is not null)
  ),
  check (
    (payment_status = 'unpaid' and payment_method is null and paid_on is null)
    or (payment_status = 'paid' and status = 'approved' and payment_method is not null and paid_on is not null)
  )
);

create index if not exists education_expenses_branch_date_idx
  on public.education_expenses (org_id, branch_id, expense_date desc, created_at desc);
create index if not exists education_expenses_approval_idx
  on public.education_expenses (org_id, branch_id, status, created_at desc);

alter table public.education_expenses enable row level security;

create policy "education expenses read"
  on public.education_expenses for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_expenses', 'view'));

create or replace function public.education_create_expense(
  p_org_id uuid,
  p_branch_id uuid,
  p_category text,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_reference text
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
    or char_length(coalesce(p_reference, '')) > 120 then
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
    expense_date, reference, created_by
  ) values (
    p_org_id, p_branch_id, btrim(p_category), nullif(btrim(p_vendor), ''),
    btrim(p_description), p_amount, p_expense_date, nullif(btrim(p_reference), ''),
    auth.uid()
  ) returning id into expense_id;

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

create or replace function public.education_review_expense(
  p_org_id uuid,
  p_expense_id uuid,
  p_decision text,
  p_reason text default null
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
    raise exception 'The expense record was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, expense_row.branch_id, 'education_expenses', 'approve'
  ) then
    raise exception 'You are not authorized to review expenses at this campus.'
      using errcode = '42501';
  end if;

  if expense_row.status <> 'pending_approval'
    or p_decision is null
    or p_decision not in ('approved', 'rejected')
    or (p_decision = 'rejected' and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500)
    or (p_decision = 'approved' and char_length(coalesce(p_reason, '')) > 500) then
    raise exception 'Only pending expenses can be approved or rejected, and rejection requires a reason.'
      using errcode = '22023';
  end if;

  update public.education_expenses
  set status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then btrim(p_reason) else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where org_id = p_org_id and id = p_expense_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_expense_' || p_decision, 'education_expense', p_expense_id,
    jsonb_build_object(
      'branch_id', expense_row.branch_id,
      'amount', expense_row.amount,
      'reason', case when p_decision = 'rejected' then btrim(p_reason) else null end
    )
  );
  return true;
end;
$$;

create or replace function public.education_mark_expense_paid(
  p_org_id uuid,
  p_expense_id uuid,
  p_payment_method text,
  p_paid_on date
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
    raise exception 'The expense record was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, expense_row.branch_id, 'education_expenses', 'edit'
  ) then
    raise exception 'You are not authorized to record expense payments at this campus.'
      using errcode = '42501';
  end if;

  if expense_row.status <> 'approved'
    or expense_row.payment_status <> 'unpaid'
    or p_payment_method is null
    or p_payment_method not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')
    or p_paid_on is null
    or p_paid_on > current_date then
    raise exception 'Only approved unpaid expenses can be marked paid with valid payment details.'
      using errcode = '22023';
  end if;

  update public.education_expenses
  set payment_status = 'paid',
      payment_method = p_payment_method,
      paid_on = p_paid_on,
      updated_at = now()
  where org_id = p_org_id and id = p_expense_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_expense_paid', 'education_expense', p_expense_id,
    jsonb_build_object(
      'branch_id', expense_row.branch_id,
      'amount', expense_row.amount,
      'payment_method', p_payment_method,
      'paid_on', p_paid_on
    )
  );
  return true;
end;
$$;

revoke all on function public.education_create_expense(uuid, uuid, text, text, text, numeric, date, text)
  from public, anon;
grant execute on function public.education_create_expense(uuid, uuid, text, text, text, numeric, date, text)
  to authenticated;
revoke all on function public.education_review_expense(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.education_review_expense(uuid, uuid, text, text)
  to authenticated;
revoke all on function public.education_mark_expense_paid(uuid, uuid, text, date)
  from public, anon;
grant execute on function public.education_mark_expense_paid(uuid, uuid, text, date)
  to authenticated;

grant select on public.education_expenses to authenticated;
revoke insert, update, delete on public.education_expenses from authenticated;
revoke all on public.education_expenses from anon;

commit;
