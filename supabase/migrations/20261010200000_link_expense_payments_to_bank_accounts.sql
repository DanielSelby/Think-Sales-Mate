begin;

alter table public.expenses
  add column if not exists payment_account_id uuid
    references public.bank_accounts(id) on delete set null;

alter table public.bank_transactions
  add column if not exists source_expense_id uuid
    references public.expenses(id) on delete set null;

create unique index if not exists bank_transactions_source_expense_id_idx
  on public.bank_transactions(source_expense_id)
  where source_expense_id is not null;

with named_accounts as (
  select
    expense.id as expense_id,
    min(account.id::text)::uuid as account_id,
    count(account.id) as account_count
  from public.expenses as expense
  join public.bank_accounts as account
    on account.org_id = expense.org_id
   and lower(trim(account.name)) = lower(trim(expense.payment_account))
  where expense.payment_account_id is null
    and expense.payment_account is not null
  group by expense.id
)
update public.expenses as expense
set payment_account_id = named_accounts.account_id
from named_accounts
where named_accounts.expense_id = expense.id
  and named_accounts.account_count = 1;

create or replace function public.post_expense_bank_payment(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_row public.expenses%rowtype;
  account_org_id uuid;
begin
  select * into expense_row
  from public.expenses
  where id = p_expense_id;

  if not found
     or expense_row.status <> 'approved'
     or expense_row.payment_status <> 'paid'
     or expense_row.payment_account_id is null then
    return;
  end if;

  select org_id into account_org_id
  from public.bank_accounts
  where id = expense_row.payment_account_id;

  if account_org_id is null or account_org_id <> expense_row.org_id then
    raise exception 'The selected payment account does not belong to this organization.';
  end if;

  insert into public.bank_transactions (
    org_id,
    account_id,
    type,
    amount,
    description,
    counterparty_name,
    transaction_category,
    transaction_date,
    recorded_by,
    source_expense_id
  ) values (
    expense_row.org_id,
    expense_row.payment_account_id,
    'withdrawal',
    expense_row.amount,
    'Payment for expense #' || expense_row.expense_number::text || ' — ' || expense_row.category,
    nullif(trim(expense_row.vendor), ''),
    'expense',
    coalesce(expense_row.paid_on, expense_row.expense_date),
    expense_row.recorded_by,
    expense_row.id
  )
  on conflict (source_expense_id) where source_expense_id is not null do nothing;
end;
$$;

revoke all on function public.post_expense_bank_payment(uuid) from public;

create or replace function public.post_paid_expense_to_bank_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.post_expense_bank_payment(new.id);
  return new;
end;
$$;

create or replace function public.post_expense_bank_payment_after_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.post_expense_bank_payment(new.expense_id);
  return new;
end;
$$;

drop trigger if exists post_paid_expense_to_bank_account_trigger on public.expenses;
create trigger post_paid_expense_to_bank_account_trigger
  after update of status, payment_status, payment_account_id, amount, paid_on
  on public.expenses
  for each row
  execute function public.post_paid_expense_to_bank_account();

drop trigger if exists post_expense_bank_payment_after_items_trigger on public.expense_items;
create trigger post_expense_bank_payment_after_items_trigger
  after insert on public.expense_items
  for each row
  execute function public.post_expense_bank_payment_after_items();

with eligible_expenses as (
  select
    expense.id,
    expense.org_id,
    expense.payment_account_id,
    expense.amount,
    expense.expense_number,
    expense.category,
    expense.vendor,
    coalesce(expense.paid_on, expense.expense_date) as transaction_date,
    expense.recorded_by,
    sum(expense.amount) over (
      partition by expense.payment_account_id
      order by coalesce(expense.paid_on, expense.expense_date), expense.id
    ) as cumulative_amount
  from public.expenses as expense
  where expense.status = 'approved'
    and expense.payment_status = 'paid'
    and expense.payment_account_id is not null
    and not exists (
      select 1
      from public.bank_transactions as bt
      where bt.source_expense_id = expense.id
         or (
           bt.org_id = expense.org_id
           and bt.account_id = expense.payment_account_id
           and bt.type = 'withdrawal'
           and bt.amount = expense.amount
           and bt.description ~* ('expense #' || expense.expense_number::text || '([^0-9]|$)')
         )
    )
)
insert into public.bank_transactions (
  org_id,
  account_id,
  type,
  amount,
  description,
  counterparty_name,
  transaction_category,
  transaction_date,
  recorded_by,
  source_expense_id
)
select
  expense.org_id,
  expense.payment_account_id,
  'withdrawal',
  expense.amount,
  'Payment for expense #' || expense.expense_number::text || ' — ' || expense.category,
  nullif(trim(expense.vendor), ''),
  'expense',
  expense.transaction_date,
  expense.recorded_by,
  expense.id
from eligible_expenses as expense
join public.bank_accounts as account
  on account.id = expense.payment_account_id
 and account.org_id = expense.org_id
where expense.cumulative_amount <= account.current_balance
on conflict (source_expense_id) where source_expense_id is not null do nothing;

commit;
