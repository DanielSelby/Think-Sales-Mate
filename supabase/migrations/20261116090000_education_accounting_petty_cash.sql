begin;

alter table public.education_expenses
  drop constraint if exists education_expenses_payment_method_check;
alter table public.education_expenses
  add constraint education_expenses_payment_method_check
  check (
    payment_method is null
    or payment_method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'petty_cash', 'other')
  );

create or replace function public.education_save_accounting_source_mapping(
  p_org_id uuid,
  p_branch_id uuid,
  p_source_type text,
  p_source_key text,
  p_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_type text;
  mapping_key text := coalesce(p_source_key, '');
  account_row public.education_accounting_accounts%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_source_type is null
    or p_source_type not in (
      'fee_receivable', 'fee_income', 'expense_payable', 'payment_account', 'expense_category'
    ) then
    raise exception 'Accounting mapping details are invalid.'
      using errcode = '22023';
  end if;

  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_finance', 'edit') then
    raise exception 'You are not authorized to configure accounting mappings at this campus.'
      using errcode = '42501';
  end if;

  if p_source_type in ('fee_receivable', 'fee_income', 'expense_payable') and mapping_key <> '' then
    raise exception 'This accounting mapping does not use a category key.'
      using errcode = '22023';
  end if;
  if p_source_type = 'payment_account'
    and mapping_key not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'petty_cash', 'other') then
    raise exception 'The payment method mapping is invalid.'
      using errcode = '22023';
  end if;
  if p_source_type = 'expense_category'
    and (char_length(mapping_key) not between 1 and 100 or mapping_key <> lower(btrim(mapping_key))) then
    raise exception 'The expense category mapping is invalid.'
      using errcode = '22023';
  end if;

  if p_source_type = 'fee_receivable' then expected_type := 'asset';
  elsif p_source_type = 'fee_income' then expected_type := 'income';
  elsif p_source_type = 'expense_payable' then expected_type := 'liability';
  elsif p_source_type = 'payment_account' then expected_type := 'asset';
  else expected_type := 'expense';
  end if;

  if p_account_id is null then
    delete from public.education_accounting_source_mappings
    where org_id = p_org_id
      and branch_id = p_branch_id
      and source_type = p_source_type
      and source_key = mapping_key;
  else
    select * into account_row
    from public.education_accounting_accounts
    where org_id = p_org_id and id = p_account_id
    for share;
    if not found or not account_row.is_active
      or account_row.account_type <> expected_type
      or (p_source_type = 'payment_account' and not account_row.is_cash_account)
      or (account_row.branch_id is not null and account_row.branch_id <> p_branch_id) then
      raise exception 'Choose an active account of the required type and campus scope; payment accounts must be marked as cash or bank accounts.'
        using errcode = '22023';
    end if;

    insert into public.education_accounting_source_mappings (
      org_id, branch_id, source_type, source_key, account_id, created_by, updated_at
    ) values (
      p_org_id, p_branch_id, p_source_type, mapping_key, p_account_id, auth.uid(), now()
    )
    on conflict (org_id, branch_id, source_type, source_key)
    do update set account_id = excluded.account_id, updated_at = now();
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, metadata)
  values (
    p_org_id, auth.uid(), 'education_accounting_mapping_saved',
    'education_accounting_source_mapping',
    jsonb_build_object(
      'branch_id', p_branch_id,
      'source_type', p_source_type,
      'source_key', mapping_key,
      'account_id', p_account_id
    )
  );
  return true;
end;
$$;

revoke all on function public.education_save_accounting_source_mapping(uuid, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.education_save_accounting_source_mapping(uuid, uuid, text, text, uuid)
  to authenticated;

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
    or p_payment_method not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'petty_cash', 'other')
    or (lower(btrim(expense_row.category)) = 'petty cash' and p_payment_method <> 'petty_cash')
    or (lower(btrim(expense_row.category)) <> 'petty cash' and p_payment_method = 'petty_cash')
    or p_paid_on is null
    or p_paid_on > current_date then
    raise exception 'Only approved unpaid expenses can be marked paid with a matching payment method and valid payment date.'
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

revoke all on function public.education_mark_expense_paid(uuid, uuid, text, date)
  from public, anon;
grant execute on function public.education_mark_expense_paid(uuid, uuid, text, date)
  to authenticated;

commit;
