begin;

alter table public.bank_transactions
  add column if not exists location_id uuid
    references public.business_locations(id) on delete set null;

create index if not exists bank_transactions_org_location_date_idx
  on public.bank_transactions(org_id, location_id, transaction_date desc);

update public.bank_transactions as bt
set location_id = expense.location_id
from public.expenses as expense
where bt.source_expense_id = expense.id
  and bt.org_id = expense.org_id
  and bt.location_id is null
  and expense.location_id is not null;

update public.bank_transactions as bt
set location_id = sale.location_id
from public.sales as sale
where bt.org_id = sale.org_id
  and bt.transaction_category = 'income'
  and bt.description ~* ('sale #' || sale.sale_number::text || '([^0-9]|$)')
  and bt.location_id is null
  and sale.location_id is not null;

update public.bank_transactions as bt
set location_id = purchase.location_id
from public.purchases as purchase
where bt.org_id = purchase.org_id
  and bt.type = 'withdrawal'
  and bt.description = 'Supplier payment for purchase ' || purchase.id::text
  and bt.location_id is null
  and purchase.location_id is not null;

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
    org_id, account_id, type, amount, description, counterparty_name,
    transaction_category, transaction_date, recorded_by, source_expense_id, location_id
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
    expense_row.id,
    expense_row.location_id
  )
  on conflict (source_expense_id) where source_expense_id is not null do nothing;
end;
$$;

revoke all on function public.post_expense_bank_payment(uuid) from public;

create or replace function public.record_purchase_bank_payment(
  p_purchase_id uuid,
  p_org_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_actor_id uuid
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  purchase_row public.purchases%rowtype;
  next_paid numeric(12, 2);
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then
    raise exception 'You must be signed in to record this payment.';
  end if;
  if not public.has_org_role(p_org_id, 'manager') then
    raise exception 'You do not have permission to pay supplier bills.';
  end if;
  if p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  select * into purchase_row
  from public.purchases
  where id = p_purchase_id and org_id = p_org_id
  for update;

  if not found then
    raise exception 'Purchase not found.';
  end if;
  if not exists (
    select 1 from public.bank_accounts
    where id = p_bank_account_id and org_id = p_org_id
  ) then
    raise exception 'Choose a valid bank account for this organization.';
  end if;

  next_paid := purchase_row.paid_amount + p_amount;
  if next_paid > purchase_row.total then
    raise exception 'Payment exceeds the outstanding purchase balance.';
  end if;

  insert into public.bank_transactions (
    org_id, account_id, type, amount, description, transaction_date, recorded_by, location_id
  ) values (
    p_org_id, p_bank_account_id, 'withdrawal', p_amount,
    'Supplier payment for purchase ' || p_purchase_id::text, current_date, p_actor_id,
    purchase_row.location_id
  );

  update public.purchases
  set paid_amount = next_paid
  where id = p_purchase_id and org_id = p_org_id;

  return next_paid;
end;
$$;

revoke all on function public.record_purchase_bank_payment(uuid, uuid, uuid, numeric, uuid) from public;
grant execute on function public.record_purchase_bank_payment(uuid, uuid, uuid, numeric, uuid) to authenticated;

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
  p_bank_account_id uuid,
  p_invoice_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
  sale_customer_id uuid;
  sale_location_id uuid;
begin
  if auth.uid() is distinct from p_recorded_by
     or not public.is_org_member(p_org_id) then
    raise exception 'You are not authorized to record this customer payment.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid payment amount.';
  end if;

  if p_invoice_id ~* '^SALE-[0-9]+$' then
    select location_id, customer_id into sale_location_id, sale_customer_id
    from public.sales
    where org_id = p_org_id
      and sale_number::text = substring(p_invoice_id from 6);

    if not found then
      raise exception 'The invoice could not be found.';
    end if;
    if sale_location_id is distinct from p_invoice_location_id then
      raise exception 'Invoice branch does not match the source sale.';
    end if;
    if sale_customer_id is not null and p_customer_id is distinct from sale_customer_id then
      raise exception 'The invoice does not belong to the selected customer.';
    end if;
    if sale_location_id is not null
       and not public.can_access_org_location(p_org_id, sale_location_id) then
      raise exception 'You cannot record payments for this invoice branch.';
    end if;
  elsif p_invoice_location_id is not null then
    raise exception 'Invoice branch may only be set for a verified sales invoice.';
  end if;

  if not public.can_access_org_location(p_org_id, p_location_id)
     or (p_location_id is not null and not exists (
       select 1 from public.business_locations
       where id = p_location_id and org_id = p_org_id
     )) then
    raise exception 'You cannot record this payment at the selected branch.';
  end if;

  if p_bank_account_id is not null
     and not public.has_org_role(p_org_id, 'manager') then
    raise exception 'Bank-account payments require banking manager access.';
  end if;

  if p_bank_account_id is not null and not exists (
    select 1 from public.bank_accounts
    where id = p_bank_account_id and org_id = p_org_id
  ) then
    raise exception 'The selected deposit account is not available in this organization.';
  end if;

  if p_customer_id is not null then
    select name into customer_name
    from public.customers
    where id = p_customer_id and org_id = p_org_id;
    if customer_name is null then
      raise exception 'The selected customer is not available in this organization.';
    end if;
  end if;

  insert into public.customer_credit_payments (
    org_id, customer_id, invoice_id, amount, payment_method, payment_date,
    location_id, invoice_location_id, recorded_by, notes
  ) values (
    p_org_id, p_customer_id, p_invoice_id, p_amount, p_payment_method, p_payment_date,
    p_location_id, p_invoice_location_id, p_recorded_by, p_notes
  );

  if p_bank_account_id is not null then
    insert into public.bank_transactions (
      org_id, account_id, type, amount, description, counterparty_name,
      transaction_category, transaction_date, recorded_by, location_id
    ) values (
      p_org_id, p_bank_account_id, 'deposit', p_amount,
      'Debt payment for invoice ' || p_invoice_id, customer_name,
      'debt_payment', p_payment_date, p_recorded_by, p_location_id
    );
  end if;
end;
$$;

revoke all on function public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid, uuid
) from public;
grant execute on function public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid, uuid
) to authenticated;

commit;
