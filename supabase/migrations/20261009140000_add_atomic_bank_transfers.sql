create or replace function public.transfer_bank_funds(
  p_org_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_name text;
  destination_name text;
begin
  if auth.uid() is null or not public.has_org_role(p_org_id, 'manager') then
    raise exception 'You do not have permission to transfer funds.';
  end if;
  if p_source_account_id = p_destination_account_id then
    raise exception 'Choose two different accounts.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid transfer amount.';
  end if;

  select name into source_name
  from public.bank_accounts
  where id = p_source_account_id and org_id = p_org_id;

  select name into destination_name
  from public.bank_accounts
  where id = p_destination_account_id and org_id = p_org_id;

  if source_name is null or destination_name is null then
    raise exception 'Both accounts must belong to your organization.';
  end if;

  insert into public.bank_transactions (
    org_id, account_id, type, amount, description, transaction_date, recorded_by
  ) values (
    p_org_id,
    p_source_account_id,
    'withdrawal',
    p_amount,
    concat('Transfer to ', destination_name, case when nullif(trim(p_description), '') is null then '' else ' - ' || trim(p_description) end),
    coalesce(p_transaction_date, current_date),
    auth.uid()
  );

  insert into public.bank_transactions (
    org_id, account_id, type, amount, description, transaction_date, recorded_by
  ) values (
    p_org_id,
    p_destination_account_id,
    'deposit',
    p_amount,
    concat('Transfer from ', source_name, case when nullif(trim(p_description), '') is null then '' else ' - ' || trim(p_description) end),
    coalesce(p_transaction_date, current_date),
    auth.uid()
  );
end;
$$;

revoke all on function public.transfer_bank_funds(uuid, uuid, uuid, numeric, date, text) from public;
grant execute on function public.transfer_bank_funds(uuid, uuid, uuid, numeric, date, text) to authenticated;
