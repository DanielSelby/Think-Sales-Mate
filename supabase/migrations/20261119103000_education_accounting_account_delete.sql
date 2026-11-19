begin;

create or replace function public.education_delete_accounting_account(
  p_org_id uuid,
  p_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.education_accounting_accounts%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_account_id is null then
    raise exception 'An organization and account are required to delete an account.'
      using errcode = '22023';
  end if;

  select * into account_row
  from public.education_accounting_accounts
  where org_id = p_org_id and id = p_account_id
  for update;
  if not found then
    raise exception 'The account was not found.'
      using errcode = 'P0002';
  end if;

  if account_row.branch_id is null then
    if not public.education_can_access_organization(p_org_id, 'education_finance', 'edit') then
      raise exception 'Organization-wide accounting edit access is required to delete this account.'
        using errcode = '42501';
    end if;
  elsif not public.education_can_access_branch(p_org_id, account_row.branch_id, 'education_finance', 'edit') then
    raise exception 'Accounting edit access at this campus is required to delete this account.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.education_accounting_accounts child
    where child.org_id = p_org_id and child.parent_account_id = p_account_id
  ) or exists (
    select 1 from public.education_accounting_source_mappings mapping
    where mapping.org_id = p_org_id and mapping.account_id = p_account_id
  ) or exists (
    select 1 from public.education_accounting_journal_lines line
    where line.org_id = p_org_id and line.account_id = p_account_id
  ) or exists (
    select 1 from public.education_accounting_bank_statements statement
    where statement.org_id = p_org_id and statement.account_id = p_account_id
  ) then
    raise exception 'This account is in use by a journal, mapping, reconciliation, or child account. Deactivate it instead.'
      using errcode = '23503';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    'education_account_deleted',
    'education_accounting_account',
    p_account_id,
    jsonb_build_object(
      'branch_id', account_row.branch_id,
      'code', account_row.code,
      'name', account_row.name,
      'account_type', account_row.account_type
    )
  );

  delete from public.education_accounting_accounts
  where org_id = p_org_id and id = p_account_id;
  return true;
end;
$$;

revoke all on function public.education_delete_accounting_account(uuid, uuid)
  from public, anon;
grant execute on function public.education_delete_accounting_account(uuid, uuid)
  to authenticated;

commit;
