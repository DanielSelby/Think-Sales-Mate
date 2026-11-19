begin;

alter table public.education_accounting_accounts
  add column if not exists bank_account_type text not null default 'cash',
  add column if not exists bank_account_number text,
  add column if not exists bank_logo_path text;

alter table public.education_accounting_accounts
  drop constraint if exists education_accounting_accounts_bank_details_check;
alter table public.education_accounting_accounts
  add constraint education_accounting_accounts_bank_details_check
  check (
    bank_account_type in ('cash', 'checking', 'savings', 'mobile_money', 'card', 'other')
    and (bank_account_number is null or char_length(bank_account_number) <= 80)
    and (bank_logo_path is null or char_length(bank_logo_path) <= 300)
  );

grant insert (
  org_id, branch_id, code, name, account_type, normal_balance, parent_account_id,
  description, is_cash_account, cash_flow_activity, bank_account_type, bank_account_number
) on public.education_accounting_accounts to authenticated;
grant update (code, name, bank_account_type, bank_account_number, bank_logo_path, updated_at)
  on public.education_accounting_accounts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'education-bank-account-logos',
  'education-bank-account-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "education bank account logos public read" on storage.objects;
create policy "education bank account logos public read"
  on storage.objects for select
  using (bucket_id = 'education-bank-account-logos');

drop policy if exists "education bank account logos authorized upload" on storage.objects;
create policy "education bank account logos authorized upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'education-bank-account-logos'
    and exists (
      select 1
      from public.education_accounting_accounts account
      where account.org_id::text = (storage.foldername(name))[1]
        and account.id::text = (storage.foldername(name))[2]
        and account.is_cash_account
        and (
          (account.branch_id is null and public.education_can_access_organization(account.org_id, 'education_finance', 'edit'))
          or (account.branch_id is not null and public.education_can_access_branch(account.org_id, account.branch_id, 'education_finance', 'edit'))
        )
    )
  );

drop policy if exists "education bank account logos authorized update" on storage.objects;
create policy "education bank account logos authorized update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'education-bank-account-logos'
    and exists (
      select 1
      from public.education_accounting_accounts account
      where account.org_id::text = (storage.foldername(name))[1]
        and account.id::text = (storage.foldername(name))[2]
        and account.is_cash_account
        and (
          (account.branch_id is null and public.education_can_access_organization(account.org_id, 'education_finance', 'edit'))
          or (account.branch_id is not null and public.education_can_access_branch(account.org_id, account.branch_id, 'education_finance', 'edit'))
        )
    )
  )
  with check (
    bucket_id = 'education-bank-account-logos'
    and exists (
      select 1
      from public.education_accounting_accounts account
      where account.org_id::text = (storage.foldername(name))[1]
        and account.id::text = (storage.foldername(name))[2]
        and account.is_cash_account
        and (
          (account.branch_id is null and public.education_can_access_organization(account.org_id, 'education_finance', 'edit'))
          or (account.branch_id is not null and public.education_can_access_branch(account.org_id, account.branch_id, 'education_finance', 'edit'))
        )
    )
  );

drop policy if exists "education bank account logos authorized delete" on storage.objects;
create policy "education bank account logos authorized delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'education-bank-account-logos'
    and (
      exists (
        select 1
        from public.education_accounting_accounts account
        where account.org_id::text = (storage.foldername(name))[1]
          and account.id::text = (storage.foldername(name))[2]
          and account.is_cash_account
          and (
            (account.branch_id is null and public.education_can_access_organization(account.org_id, 'education_finance', 'edit'))
            or (account.branch_id is not null and public.education_can_access_branch(account.org_id, account.branch_id, 'education_finance', 'edit'))
          )
        )
      or case
        when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
        when (storage.foldername(name))[3] = 'organization'
          then public.education_can_access_organization((storage.foldername(name))[1]::uuid, 'education_finance', 'edit')
        when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.education_can_access_branch((storage.foldername(name))[1]::uuid, (storage.foldername(name))[3]::uuid, 'education_finance', 'edit')
        else false
      end
    )
  );

create or replace function public.education_get_cash_account_balances(
  p_org_id uuid,
  p_account_ids uuid[]
) returns table (account_id uuid, balance numeric)
language sql
security definer
set search_path = public
as $$
  select account.id,
    coalesce(sum(
      case
        when account.normal_balance = 'debit' then line.debit - line.credit
        else line.credit - line.debit
      end
    ), 0)::numeric as balance
  from public.education_accounting_accounts account
  left join public.education_accounting_journal_lines line
    on line.org_id = account.org_id and line.account_id = account.id
  left join public.education_accounting_journals journal
    on journal.org_id = line.org_id and journal.id = line.journal_id and journal.status = 'posted'
  where auth.uid() is not null
    and account.org_id = p_org_id
    and account.id = any(coalesce(p_account_ids, '{}'::uuid[]))
    and account.is_cash_account
    and (
      (account.branch_id is null and public.education_can_access_organization(account.org_id, 'education_finance', 'view'))
      or (account.branch_id is not null and public.education_can_access_branch(account.org_id, account.branch_id, 'education_finance', 'view'))
    )
    and (line.id is null or journal.id is not null)
  group by account.id;
$$;

revoke all on function public.education_get_cash_account_balances(uuid, uuid[])
  from public, anon;
grant execute on function public.education_get_cash_account_balances(uuid, uuid[])
  to authenticated;

commit;
