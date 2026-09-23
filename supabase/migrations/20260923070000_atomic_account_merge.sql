create or replace function public.merge_accounting_accounts(
  p_org_id uuid,
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_account public.accounting_accounts%rowtype;
  target_account public.accounting_accounts%rowtype;
begin
  if p_source_id = p_target_id then
    raise exception 'Choose two different accounts.';
  end if;

  select *
    into source_account
    from public.accounting_accounts
   where id = p_source_id
     and org_id = p_org_id
   for update;

  select *
    into target_account
    from public.accounting_accounts
   where id = p_target_id
     and org_id = p_org_id
   for update;

  if source_account.id is null or target_account.id is null then
    raise exception 'Account not found.';
  end if;
  if not source_account.is_active or not target_account.is_active then
    raise exception 'Only active accounts can be merged.';
  end if;
  if source_account.type <> target_account.type
     or source_account.currency <> target_account.currency then
    raise exception 'Accounts must have the same type and currency.';
  end if;

  update public.journal_entry_lines
     set account_id = p_target_id
   where org_id = p_org_id
     and account_id = p_source_id;

  update public.accounting_accounts
     set current_balance = coalesce(target_account.current_balance, 0)
                           + coalesce(source_account.current_balance, 0)
   where id = p_target_id
     and org_id = p_org_id;

  update public.accounting_accounts
     set is_active = false,
         description = 'Merged into account ' || p_target_id::text
   where id = p_source_id
     and org_id = p_org_id;
end;
$$;
