begin;

alter table public.education_accounting_journals
  add column if not exists source_record_id uuid;

alter table public.education_accounting_journals
  drop constraint if exists education_accounting_journals_source_module_check;
alter table public.education_accounting_journals
  add constraint education_accounting_journals_source_module_check
  check (source_module in (
    'manual',
    'fee_charge',
    'fee_payment',
    'fee_charge_void',
    'expense_approved',
    'expense_paid'
  ));

create unique index if not exists education_accounting_journals_source_unique_idx
  on public.education_accounting_journals (org_id, source_module, source_record_id)
  where source_record_id is not null;

alter table public.education_accounting_accounts
  add column if not exists is_cash_account boolean not null default false;
alter table public.education_accounting_accounts
  add column if not exists cash_flow_activity text;
alter table public.education_accounting_accounts
  drop constraint if exists education_accounting_accounts_cash_flow_check;
alter table public.education_accounting_accounts
  add constraint education_accounting_accounts_cash_flow_check
  check (
    (not is_cash_account or account_type = 'asset')
    and (cash_flow_activity is null or cash_flow_activity in ('operating', 'investing', 'financing'))
  );
grant update (is_cash_account, cash_flow_activity)
  on public.education_accounting_accounts to authenticated;
grant insert (org_id, branch_id, code, name, account_type, normal_balance, parent_account_id, description, is_cash_account, cash_flow_activity)
  on public.education_accounting_accounts to authenticated;

create table if not exists public.education_accounting_source_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  source_type text not null check (source_type in (
    'fee_receivable',
    'fee_income',
    'expense_payable',
    'payment_account',
    'expense_category'
  )),
  source_key text not null default '',
  account_id uuid not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, source_type, source_key),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete cascade,
  foreign key (org_id, account_id)
    references public.education_accounting_accounts(org_id, id) on delete restrict,
  check (char_length(source_key) <= 100)
);

create index if not exists education_accounting_source_mappings_branch_idx
  on public.education_accounting_source_mappings (org_id, branch_id, source_type);

create or replace function public.education_guard_mapped_account_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.education_accounting_source_mappings mapping
    where mapping.org_id = old.org_id and mapping.account_id = old.id
  ) then
    raise exception 'Remove this account from automated posting mappings before deactivating it.'
      using errcode = '23514';
  end if;
  if old.is_cash_account and not new.is_cash_account and exists (
    select 1 from public.education_accounting_source_mappings mapping
    where mapping.org_id = old.org_id
      and mapping.account_id = old.id
      and mapping.source_type = 'payment_account'
  ) then
    raise exception 'Remove this account from payment mappings before clearing its cash or bank classification.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists education_accounting_mapped_account_guard on public.education_accounting_accounts;
create trigger education_accounting_mapped_account_guard
  before update of is_active, is_cash_account on public.education_accounting_accounts
  for each row execute function public.education_guard_mapped_account_changes();
revoke all on function public.education_guard_mapped_account_changes() from public, anon, authenticated;

alter table public.education_accounting_source_mappings enable row level security;
drop policy if exists "education accounting source mappings read" on public.education_accounting_source_mappings;
create policy "education accounting source mappings read"
  on public.education_accounting_source_mappings for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_finance', 'view'));

revoke all on public.education_accounting_source_mappings from anon, authenticated;
grant select on public.education_accounting_source_mappings to authenticated;

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
    and mapping_key not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other') then
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

create or replace function public.education_accounting_post_source_event(
  p_org_id uuid,
  p_branch_id uuid,
  p_source_type text,
  p_source_record_id uuid,
  p_entry_date date,
  p_amount numeric,
  p_description text,
  p_reference text,
  p_payment_method text,
  p_expense_category text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  debit_account_id uuid;
  credit_account_id uuid;
  receivable_account_id uuid;
  income_account_id uuid;
  payable_account_id uuid;
  period_row public.education_accounting_periods%rowtype;
  fiscal_row public.education_accounting_fiscal_years%rowtype;
  journal_number_value bigint;
  journal_id uuid;
  permission_module text;
  permission_action text;
  debit_description text;
  credit_description text;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_source_type is null or p_source_record_id is null or p_entry_date is null
    or p_amount is null or p_amount <= 0 or p_amount > 999999999999.99
    or p_amount <> round(p_amount, 2)
    or p_source_type not in (
      'fee_charge', 'fee_payment', 'fee_charge_void', 'expense_approved', 'expense_paid'
    ) then
    raise exception 'Automated journal source details are invalid.'
      using errcode = '22023';
  end if;

  permission_module := case when p_source_type like 'expense_%' then 'education_expenses' else 'education_finance' end;
  permission_action := case
    when p_source_type in ('fee_charge', 'fee_payment') then 'create'
    when p_source_type in ('fee_charge_void', 'expense_paid') then 'edit'
    else 'approve'
  end;
  if not public.education_can_access_branch(p_org_id, p_branch_id, permission_module, permission_action) then
    raise exception 'The source transaction is not authorized for accounting posting.'
      using errcode = '42501';
  end if;

  select id into journal_id
  from public.education_accounting_journals
  where org_id = p_org_id
    and source_module = p_source_type
    and source_record_id = p_source_record_id;
  if found then return journal_id; end if;

  select fiscal.* into fiscal_row
  from public.education_accounting_fiscal_years fiscal
  join public.education_accounting_periods period
    on period.org_id = fiscal.org_id and period.fiscal_year_id = fiscal.id
  where fiscal.org_id = p_org_id
    and fiscal.status = 'open'
    and period.status = 'open'
    and p_entry_date between fiscal.starts_on and fiscal.ends_on
    and p_entry_date between period.starts_on and period.ends_on
  for share of fiscal, period;
  if not found then
    raise exception 'Automated journal posting requires an open fiscal period for the transaction date.'
      using errcode = '22023';
  end if;
  select * into period_row
  from public.education_accounting_periods
  where org_id = p_org_id and fiscal_year_id = fiscal_row.id
    and p_entry_date between starts_on and ends_on
    and status = 'open';
  if not found then
    raise exception 'No open accounting period covers the transaction date.'
      using errcode = '22023';
  end if;

  if p_source_type in ('fee_charge', 'fee_payment', 'fee_charge_void') then
    select account_id into receivable_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'fee_receivable' and source_key = '';
    if not found then
      raise exception 'Configure a student receivable account in Education Accounting Settings before recording fees.'
        using errcode = '23514';
    end if;
  end if;

  if p_source_type in ('fee_charge', 'fee_charge_void') then
    select account_id into income_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'fee_income' and source_key = '';
    if not found then
      raise exception 'Configure a fee income account in Education Accounting Settings before recording fees.'
        using errcode = '23514';
    end if;
  end if;

  if p_source_type in ('expense_approved', 'expense_paid') then
    select account_id into payable_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'expense_payable' and source_key = '';
    if not found then
      raise exception 'Configure an expense payable account in Education Accounting Settings before approving expenses.'
        using errcode = '23514';
    end if;
  end if;

  if p_source_type = 'fee_charge' then
    debit_account_id := receivable_account_id;
    credit_account_id := income_account_id;
    debit_description := 'Student fee receivable';
    credit_description := 'Student fee income';
  elsif p_source_type = 'fee_charge_void' then
    debit_account_id := income_account_id;
    credit_account_id := receivable_account_id;
    debit_description := 'Reversal of voided student fee income';
    credit_description := 'Reversal of voided student fee receivable';
  elsif p_source_type = 'fee_payment' then
    select account_id into debit_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'payment_account' and source_key = p_payment_method;
    if not found then
      raise exception 'Configure an account for this payment method in Education Accounting Settings before recording the payment.'
        using errcode = '23514';
    end if;
    credit_account_id := receivable_account_id;
    debit_description := 'Fee payment received';
    credit_description := 'Student receivable settled';
  elsif p_source_type = 'expense_approved' then
    select account_id into debit_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'expense_category'
      and source_key = lower(btrim(coalesce(p_expense_category, '')));
    if not found then
      raise exception 'Map this expense category in Education Accounting Settings before approving the expense.'
        using errcode = '23514';
    end if;
    credit_account_id := payable_account_id;
    debit_description := 'Approved education expense';
    credit_description := 'Expense payable recognized';
  else
    select account_id into credit_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'payment_account' and source_key = p_payment_method;
    if not found then
      raise exception 'Configure an account for this payment method in Education Accounting Settings before paying the expense.'
        using errcode = '23514';
    end if;
    debit_account_id := payable_account_id;
    debit_description := 'Expense payable settled';
    credit_description := 'Expense payment';
  end if;

  if not exists (
    select 1
    from public.education_accounting_accounts account
    where account.org_id = p_org_id
      and account.id = debit_account_id
      and account.is_active
      and (account.branch_id is null or account.branch_id = p_branch_id)
  ) or not exists (
    select 1
    from public.education_accounting_accounts account
    where account.org_id = p_org_id
      and account.id = credit_account_id
      and account.is_active
      and (account.branch_id is null or account.branch_id = p_branch_id)
  ) then
    raise exception 'An automated journal mapping points to an inactive or unavailable account.'
      using errcode = '23514';
  end if;
  if p_source_type in ('fee_payment', 'expense_paid')
    and not exists (
      select 1
      from public.education_accounting_accounts account
      where account.org_id = p_org_id
        and account.id = case when p_source_type = 'fee_payment' then debit_account_id else credit_account_id end
        and account.is_cash_account
    ) then
    raise exception 'Mapped payment accounts must remain marked as cash or bank accounts.'
      using errcode = '23514';
  end if;

  insert into public.education_accounting_journal_sequences as seq (org_id, last_number)
  values (p_org_id, 1)
  on conflict (org_id) do update
    set last_number = seq.last_number + 1,
        updated_at = now()
  returning last_number into journal_number_value;

  insert into public.education_accounting_journals (
    org_id, journal_number, branch_id, fiscal_year_id, period_id, entry_date,
    reference, description, source_module, source_record_id, status,
    total_debit, total_credit, created_by
  ) values (
    p_org_id, journal_number_value, p_branch_id, fiscal_row.id, period_row.id, p_entry_date,
    nullif(btrim(p_reference), ''), left(btrim(p_description), 300),
    p_source_type, p_source_record_id, 'draft', p_amount, p_amount, auth.uid()
  ) returning id into journal_id;

  insert into public.education_accounting_journal_lines (
    org_id, journal_id, line_number, account_id, description, debit, credit
  ) values
    (p_org_id, journal_id, 1, debit_account_id, debit_description, p_amount, 0),
    (p_org_id, journal_id, 2, credit_account_id, credit_description, 0, p_amount);

  update public.education_accounting_journals
  set status = 'posted', posted_by = auth.uid(), posted_at = now(), updated_at = now()
  where org_id = p_org_id and id = journal_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_source_journal_posted',
    'education_accounting_journal', journal_id,
    jsonb_build_object(
      'source_type', p_source_type,
      'source_record_id', p_source_record_id,
      'branch_id', p_branch_id,
      'entry_date', p_entry_date,
      'amount', p_amount,
      'journal_number', journal_number_value
    )
  );
  return journal_id;
end;
$$;

revoke all on function public.education_accounting_post_source_event(uuid, uuid, text, uuid, date, numeric, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.education_accounting_auto_journal_fee_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_accounting_post_source_event(
    new.org_id, new.branch_id, 'fee_charge', new.id, new.created_at::date,
    new.amount, new.description, new.id::text, null, null
  );
  return new;
end;
$$;

create or replace function public.education_accounting_auto_journal_fee_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  charge_row public.education_fee_charges%rowtype;
begin
  select * into charge_row
  from public.education_fee_charges
  where org_id = new.org_id and id = new.charge_id;
  if not found then
    raise exception 'The fee charge for this payment was not found.'
      using errcode = 'P0002';
  end if;
  perform public.education_accounting_post_source_event(
    new.org_id, charge_row.branch_id, 'fee_payment', new.id, new.created_at::date,
    new.amount, 'Fee payment · ' || charge_row.description, new.reference,
    new.payment_method, null
  );
  return new;
end;
$$;

create or replace function public.education_accounting_auto_journal_fee_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'open' and new.status = 'void' and exists (
    select 1
    from public.education_accounting_journals journal
    where journal.org_id = new.org_id
      and journal.source_module = 'fee_charge'
      and journal.source_record_id = new.id
  ) then
    perform public.education_accounting_post_source_event(
      new.org_id, new.branch_id, 'fee_charge_void', new.id, current_date,
      new.amount, 'Void fee charge · ' || new.description, new.id::text, null, null
    );
  end if;
  return new;
end;
$$;

create or replace function public.education_accounting_auto_journal_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and new.status = 'approved' then
    perform public.education_accounting_post_source_event(
      new.org_id, new.branch_id, 'expense_approved', new.id, new.expense_date,
      new.amount, new.description, new.reference, null, new.category
    );
  end if;
  if old.payment_status is distinct from new.payment_status and new.payment_status = 'paid' then
    perform public.education_accounting_post_source_event(
      new.org_id, new.branch_id, 'expense_paid', new.id, new.paid_on,
      new.amount, 'Payment · ' || new.description, new.reference, new.payment_method, new.category
    );
  end if;
  return new;
end;
$$;

drop trigger if exists education_fee_charge_auto_journal on public.education_fee_charges;
create trigger education_fee_charge_auto_journal
  after insert on public.education_fee_charges
  for each row execute function public.education_accounting_auto_journal_fee_charge();
drop trigger if exists education_fee_payment_auto_journal on public.education_fee_payments;
create trigger education_fee_payment_auto_journal
  after insert on public.education_fee_payments
  for each row execute function public.education_accounting_auto_journal_fee_payment();
drop trigger if exists education_fee_void_auto_journal on public.education_fee_charges;
create trigger education_fee_void_auto_journal
  after update of status on public.education_fee_charges
  for each row execute function public.education_accounting_auto_journal_fee_void();
drop trigger if exists education_expense_auto_journal on public.education_expenses;
create trigger education_expense_auto_journal
  after update of status, payment_status on public.education_expenses
  for each row execute function public.education_accounting_auto_journal_expense();

revoke all on function public.education_accounting_auto_journal_fee_charge() from public, anon, authenticated;
revoke all on function public.education_accounting_auto_journal_fee_payment() from public, anon, authenticated;
revoke all on function public.education_accounting_auto_journal_fee_void() from public, anon, authenticated;
revoke all on function public.education_accounting_auto_journal_expense() from public, anon, authenticated;

create or replace function public.education_backfill_accounting_source_journals(
  p_org_id uuid,
  p_branch_id uuid,
  p_starts_on date,
  p_ends_on date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row record;
  posted_count integer := 0;
  posted_journal_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_starts_on is null or p_ends_on is null or p_starts_on > p_ends_on
    or p_ends_on > current_date then
    raise exception 'Backfill date range is invalid.'
      using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_finance', 'approve') then
    raise exception 'Finance approval access at this campus is required to backfill accounting journals.'
      using errcode = '42501';
  end if;

  for source_row in
    select charge.*
    from public.education_fee_charges charge
    where charge.org_id = p_org_id
      and charge.branch_id = p_branch_id
      and charge.status = 'open'
      and charge.created_at::date between p_starts_on and p_ends_on
      and not exists (
        select 1 from public.education_accounting_journals journal
        where journal.org_id = charge.org_id
          and journal.source_module = 'fee_charge'
          and journal.source_record_id = charge.id
      )
    order by charge.created_at, charge.id
  loop
    posted_journal_id := public.education_accounting_post_source_event(
      source_row.org_id, source_row.branch_id, 'fee_charge', source_row.id,
      source_row.created_at::date, source_row.amount, source_row.description,
      source_row.id::text, null, null
    );
    posted_count := posted_count + 1;
  end loop;

  for source_row in
    select payment.*, charge.branch_id, charge.description as charge_description
    from public.education_fee_payments payment
    join public.education_fee_charges charge
      on charge.org_id = payment.org_id and charge.id = payment.charge_id
    where payment.org_id = p_org_id
      and charge.branch_id = p_branch_id
      and payment.created_at::date between p_starts_on and p_ends_on
      and not exists (
        select 1 from public.education_accounting_journals journal
        where journal.org_id = payment.org_id
          and journal.source_module = 'fee_payment'
          and journal.source_record_id = payment.id
      )
    order by payment.created_at, payment.id
  loop
    posted_journal_id := public.education_accounting_post_source_event(
      source_row.org_id, source_row.branch_id, 'fee_payment', source_row.id,
      source_row.created_at::date, source_row.amount,
      'Fee payment · ' || source_row.charge_description, source_row.reference,
      source_row.payment_method, null
    );
    posted_count := posted_count + 1;
  end loop;

  for source_row in
    select expense.*
    from public.education_expenses expense
    where expense.org_id = p_org_id
      and expense.branch_id = p_branch_id
      and expense.status = 'approved'
      and expense.expense_date between p_starts_on and p_ends_on
      and not exists (
        select 1 from public.education_accounting_journals journal
        where journal.org_id = expense.org_id
          and journal.source_module = 'expense_approved'
          and journal.source_record_id = expense.id
      )
    order by expense.expense_date, expense.id
  loop
    posted_journal_id := public.education_accounting_post_source_event(
      source_row.org_id, source_row.branch_id, 'expense_approved', source_row.id,
      source_row.expense_date, source_row.amount, source_row.description,
      source_row.reference, null, source_row.category
    );
    posted_count := posted_count + 1;
  end loop;

  for source_row in
    select expense.*
    from public.education_expenses expense
    where expense.org_id = p_org_id
      and expense.branch_id = p_branch_id
      and expense.status = 'approved'
      and expense.payment_status = 'paid'
      and expense.paid_on between p_starts_on and p_ends_on
      and not exists (
        select 1 from public.education_accounting_journals journal
        where journal.org_id = expense.org_id
          and journal.source_module = 'expense_paid'
          and journal.source_record_id = expense.id
      )
    order by expense.paid_on, expense.id
  loop
    posted_journal_id := public.education_accounting_post_source_event(
      source_row.org_id, source_row.branch_id, 'expense_paid', source_row.id,
      source_row.paid_on, source_row.amount, 'Payment · ' || source_row.description,
      source_row.reference, source_row.payment_method, source_row.category
    );
    posted_count := posted_count + 1;
  end loop;

  return posted_count;
end;
$$;

revoke all on function public.education_backfill_accounting_source_journals(uuid, uuid, date, date)
  from public, anon;
grant execute on function public.education_backfill_accounting_source_journals(uuid, uuid, date, date)
  to authenticated;

create or replace function public.education_set_accounting_period_status(
  p_org_id uuid,
  p_period_id uuid,
  p_status text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row public.education_accounting_periods%rowtype;
  year_row public.education_accounting_fiscal_years%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_period_id is null
    or p_status is null or p_status not in ('open', 'closed')
    or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Accounting period status details are invalid.'
      using errcode = '22023';
  end if;
  if not public.education_can_access_organization(p_org_id, 'education_finance', 'approve') then
    raise exception 'Organization-wide finance approval is required to close or reopen periods.'
      using errcode = '42501';
  end if;

  select * into period_row
  from public.education_accounting_periods
  where org_id = p_org_id and id = p_period_id
  for update;
  if not found then
    raise exception 'The accounting period was not found.'
      using errcode = 'P0002';
  end if;
  select * into year_row
  from public.education_accounting_fiscal_years
  where org_id = p_org_id and id = period_row.fiscal_year_id
  for update;
  if not found then
    raise exception 'The fiscal year for this period was not found.'
      using errcode = 'P0002';
  end if;
  if period_row.status = p_status then
    raise exception 'The accounting period already has that status.'
      using errcode = '22023';
  end if;

  if p_status = 'closed' then
    if exists (
      select 1 from public.education_accounting_journals journal
      where journal.org_id = p_org_id
        and journal.fiscal_year_id = period_row.fiscal_year_id
        and journal.period_id = period_row.id
        and journal.status = 'draft'
    ) then
      raise exception 'Post or resolve every draft journal before closing this period.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from public.education_fee_charges charge
      where charge.org_id = p_org_id
        and charge.status = 'open'
        and charge.created_at::date between period_row.starts_on and period_row.ends_on
        and not exists (
          select 1 from public.education_accounting_journals journal
          where journal.org_id = charge.org_id and journal.source_module = 'fee_charge'
            and journal.source_record_id = charge.id
        )
    ) or exists (
      select 1
      from public.education_fee_payments payment
      join public.education_fee_charges charge
        on charge.org_id = payment.org_id and charge.id = payment.charge_id
      where payment.org_id = p_org_id
        and payment.created_at::date between period_row.starts_on and period_row.ends_on
        and not exists (
          select 1 from public.education_accounting_journals journal
          where journal.org_id = payment.org_id and journal.source_module = 'fee_payment'
            and journal.source_record_id = payment.id
        )
    ) or exists (
      select 1 from public.education_expenses expense
      where expense.org_id = p_org_id and expense.status = 'approved'
        and expense.expense_date between period_row.starts_on and period_row.ends_on
        and not exists (
          select 1 from public.education_accounting_journals journal
          where journal.org_id = expense.org_id and journal.source_module = 'expense_approved'
            and journal.source_record_id = expense.id
        )
    ) or exists (
      select 1 from public.education_expenses expense
      where expense.org_id = p_org_id and expense.status = 'approved'
        and expense.payment_status = 'paid'
        and expense.paid_on between period_row.starts_on and period_row.ends_on
        and not exists (
          select 1 from public.education_accounting_journals journal
          where journal.org_id = expense.org_id and journal.source_module = 'expense_paid'
            and journal.source_record_id = expense.id
        )
    ) then
      raise exception 'Backfill all finalized fees, receipts, and expenses before closing this period.'
        using errcode = '22023';
    end if;

    update public.education_accounting_periods
    set status = 'closed', closed_by = auth.uid(), closed_at = now(), updated_at = now()
    where org_id = p_org_id and id = p_period_id;
    if not exists (
      select 1 from public.education_accounting_periods period
      where period.org_id = p_org_id and period.fiscal_year_id = period_row.fiscal_year_id
        and period.status = 'open'
    ) then
      update public.education_accounting_fiscal_years
      set status = 'closed', updated_at = now()
      where org_id = p_org_id and id = period_row.fiscal_year_id;
    end if;
  else
    if exists (
      select 1 from public.education_accounting_periods period
      where period.org_id = p_org_id and period.fiscal_year_id = period_row.fiscal_year_id
        and period.sequence_number > period_row.sequence_number and period.status = 'closed'
    ) then
      raise exception 'Reopen later closed periods first.'
        using errcode = '22023';
    end if;
    update public.education_accounting_periods
    set status = 'open', closed_by = null, closed_at = null, updated_at = now()
    where org_id = p_org_id and id = p_period_id;
    update public.education_accounting_fiscal_years
    set status = 'open', updated_at = now()
    where org_id = p_org_id and id = period_row.fiscal_year_id;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(),
    case when p_status = 'closed' then 'education_accounting_period_closed' else 'education_accounting_period_reopened' end,
    'education_accounting_period', p_period_id,
    jsonb_build_object(
      'fiscal_year_id', period_row.fiscal_year_id,
      'starts_on', period_row.starts_on,
      'ends_on', period_row.ends_on,
      'reason', btrim(p_reason)
    )
  );
  return true;
end;
$$;

revoke all on function public.education_set_accounting_period_status(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.education_set_accounting_period_status(uuid, uuid, text, text)
  to authenticated;

commit;
