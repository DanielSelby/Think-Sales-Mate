begin;

alter table public.bank_transactions
  add column if not exists counterparty_name text,
  add column if not exists transaction_category text;

alter table public.bank_transactions
  drop constraint if exists bank_transactions_transaction_category_check;

alter table public.bank_transactions
  add constraint bank_transactions_transaction_category_check
  check (
    transaction_category is null
    or transaction_category in ('income', 'debt_payment', 'expense', 'transfer')
  );

update public.bank_transactions
set transaction_category = 'transfer'
where transaction_category is null
  and description ilike 'Transfer %';

update public.bank_transactions
set transaction_category = 'expense'
where transaction_category is null
  and type = 'withdrawal';

update public.bank_transactions as bt
set transaction_category = 'income',
    counterparty_name = coalesce(nullif(sale.customer_name, ''), 'Walk-in Customer')
from public.sales as sale
where bt.org_id = sale.org_id
  and bt.transaction_category is null
  and bt.description ~* ('payment for sale #' || sale.sale_number::text || '([^0-9]|$)');

create or replace function public.record_customer_credit_payment_with_bank_transaction(
  p_org_id uuid,
  p_customer_id uuid,
  p_invoice_id text,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_location_id uuid,
  p_recorded_by uuid,
  p_notes text,
  p_bank_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
begin
  if auth.uid() is distinct from p_recorded_by
     or not public.is_org_member(p_org_id) then
    raise exception 'You are not authorized to record this customer payment.';
  end if;

  if p_bank_account_id is not null
     and not public.has_org_role(p_org_id, 'manager') then
    raise exception 'Bank-account payments require banking manager access.';
  end if;

  if p_bank_account_id is not null and not exists (
    select 1
    from public.bank_accounts
    where id = p_bank_account_id
      and org_id = p_org_id
  ) then
    raise exception 'The selected deposit account is not available in this organization.';
  end if;

  if p_customer_id is not null then
    select name into customer_name
    from public.customers
    where id = p_customer_id
      and org_id = p_org_id;
    if customer_name is null then
      raise exception 'The selected customer is not available in this organization.';
    end if;
  end if;

  insert into public.customer_credit_payments (
    org_id, customer_id, invoice_id, amount, payment_method, payment_date,
    location_id, recorded_by, notes
  ) values (
    p_org_id, p_customer_id, p_invoice_id, p_amount, p_payment_method, p_payment_date,
    p_location_id, p_recorded_by, p_notes
  );

  if p_bank_account_id is not null then
    insert into public.bank_transactions (
      org_id, account_id, type, amount, description, counterparty_name,
      transaction_category, transaction_date, recorded_by
    ) values (
      p_org_id, p_bank_account_id, 'deposit', p_amount,
      'Debt payment for invoice ' || p_invoice_id, customer_name,
      'debt_payment', p_payment_date, p_recorded_by
    );
  end if;
end;
$$;

revoke all on function public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid
) from public;
grant execute on function public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid
) to authenticated;

create index if not exists bank_transactions_org_category_date_idx
  on public.bank_transactions(org_id, transaction_category, transaction_date desc);

commit;
