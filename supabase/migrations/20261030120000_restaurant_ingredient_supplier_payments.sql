begin;

alter table public.restaurant_ingredient_purchase_orders
  add column if not exists invoice_reference text,
  add column if not exists due_date date;

alter table public.restaurant_account_mappings
  add column if not exists ingredient_payment_account_id uuid
    references public.accounting_accounts(id) on delete restrict;

alter table public.bank_transactions
  add column if not exists source_restaurant_ingredient_payment_id uuid;

create table if not exists public.restaurant_ingredient_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_key uuid not null,
  purchase_order_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null check (payment_method in ('cash', 'bank')),
  bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  journal_id uuid references public.journal_entries(id) on delete set null,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, request_key),
  foreign key (org_id, purchase_order_id)
    references public.restaurant_ingredient_purchase_orders(org_id, id) on delete restrict,
  check ((payment_method = 'bank' and bank_account_id is not null)
    or (payment_method = 'cash' and bank_account_id is null))
);

alter table public.restaurant_ingredient_payments enable row level security;
revoke all on public.restaurant_ingredient_payments from public, anon, authenticated;
grant all on public.restaurant_ingredient_payments to service_role;

alter table public.bank_transactions
  add constraint bank_transactions_restaurant_ingredient_payment_fk
  foreign key (source_restaurant_ingredient_payment_id)
  references public.restaurant_ingredient_payments(id) on delete set null;

create unique index if not exists bank_transactions_restaurant_ingredient_payment_idx
  on public.bank_transactions(org_id, source_restaurant_ingredient_payment_id)
  where source_restaurant_ingredient_payment_id is not null;

create or replace function public.record_restaurant_ingredient_supplier_payment(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_bank_account_id uuid,
  p_recorded_by uuid,
  p_request_key uuid
)
returns table (
  payment_id uuid,
  paid_total numeric,
  outstanding numeric,
  journal_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_order public.restaurant_ingredient_purchase_orders;
  existing_payment public.restaurant_ingredient_payments;
  account_mapping public.restaurant_account_mappings;
  payment_row public.restaurant_ingredient_payments;
  supplier_name text;
  invoiced_total numeric(14,2);
  prior_paid numeric(14,2);
  next_paid numeric(14,2);
  payment_account_type text;
  payment_account_location uuid;
  payable_account_type text;
  payable_account_location uuid;
  journal_id_value uuid;
  bank_transaction_id_value uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record Restaurant ingredient supplier payments.';
  end if;
  if p_request_key is null or p_recorded_by is null or p_payment_date is null
    or p_payment_date > current_date
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or p_payment_method not in ('cash', 'bank')
    or (p_payment_method = 'bank' and p_bank_account_id is null)
    or (p_payment_method = 'cash' and p_bank_account_id is not null) then
    raise exception 'Enter a valid payment amount, date, and payment method.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_request_key::text, 0)
  );
  select * into existing_payment
  from public.restaurant_ingredient_payments payment
  where payment.org_id = p_org_id and payment.request_key = p_request_key;
  if found then
    if existing_payment.purchase_order_id <> p_purchase_order_id then
      raise exception 'This payment request was already used for a different Restaurant purchase order.';
    end if;
    if existing_payment.amount <> p_amount
      or existing_payment.payment_date <> p_payment_date
      or existing_payment.payment_method <> p_payment_method
      or existing_payment.bank_account_id is distinct from p_bank_account_id then
      raise exception 'This payment request key was already used with different payment details.';
    end if;
    select coalesce(sum(payment.amount), 0)
      into prior_paid
      from public.restaurant_ingredient_payments payment
      where payment.org_id = p_org_id and payment.purchase_order_id = p_purchase_order_id;
    select coalesce(sum(receipt.amount), 0)
      into invoiced_total
      from public.restaurant_ingredient_receipts receipt
      where receipt.org_id = p_org_id and receipt.purchase_order_id = p_purchase_order_id
        and receipt.accounting_status = 'posted';
    return query select existing_payment.id, prior_paid, greatest(invoiced_total - prior_paid, 0),
      existing_payment.journal_id;
    return;
  end if;

  select * into purchase_order
  from public.restaurant_ingredient_purchase_orders po
  where po.org_id = p_org_id and po.id = p_purchase_order_id
  for update;
  if not found then
    raise exception 'Restaurant ingredient purchase order not found.';
  end if;
  if exists (
    select 1 from public.restaurant_ingredient_receipts receipt
    where receipt.org_id = p_org_id and receipt.purchase_order_id = p_purchase_order_id
      and receipt.accounting_status = 'not_configured'
  ) then
    raise exception 'Some received items have no payable journal. Configure Restaurant ingredient accounts and reconcile those receipts before recording payment.';
  end if;

  select coalesce(sum(receipt.amount), 0)
  into invoiced_total
  from public.restaurant_ingredient_receipts receipt
  where receipt.org_id = p_org_id and receipt.purchase_order_id = p_purchase_order_id
    and receipt.accounting_status = 'posted';
  select coalesce(sum(payment.amount), 0)
  into prior_paid
  from public.restaurant_ingredient_payments payment
  where payment.org_id = p_org_id and payment.purchase_order_id = p_purchase_order_id;
  next_paid := prior_paid + p_amount;
  if invoiced_total <= prior_paid or next_paid > invoiced_total then
    raise exception 'Payment exceeds the Restaurant supplier invoice balance.';
  end if;

  select * into account_mapping
  from public.restaurant_account_mappings mapping
  where mapping.org_id = p_org_id;
  if account_mapping.ingredient_payable_account_id is null
    or account_mapping.ingredient_payment_account_id is null then
    raise exception 'Configure Restaurant ingredient payable and payment accounts before recording supplier payments.';
  end if;

  select payment_account.type::text, payment_account.location_id,
    payable_account.type::text, payable_account.location_id
  into payment_account_type, payment_account_location,
    payable_account_type, payable_account_location
  from public.accounting_accounts payment_account
  join public.accounting_accounts payable_account
    on payable_account.org_id = payment_account.org_id
    and payable_account.id = account_mapping.ingredient_payable_account_id
  where payment_account.org_id = p_org_id
    and payment_account.id = account_mapping.ingredient_payment_account_id
    and payment_account.is_active and payable_account.is_active;
  if not found or payment_account_type <> 'asset' or payable_account_type <> 'liability'
    or payment_account_location is not null or payable_account_location is not null then
    raise exception 'Restaurant ingredient payment mappings must be active organization-wide asset and liability accounts.';
  end if;

  if p_payment_method = 'bank' and not exists (
    select 1 from public.bank_accounts account
    where account.org_id = p_org_id and account.id = p_bank_account_id
  ) then
    raise exception 'Choose a Bank Account belonging to this organization.';
  end if;

  select supplier.name into supplier_name
  from public.suppliers supplier
  where supplier.org_id = p_org_id and supplier.id = purchase_order.supplier_id;
  if supplier_name is null then
    raise exception 'Restaurant supplier not found.';
  end if;

  insert into public.restaurant_ingredient_payments (
    org_id, request_key, purchase_order_id, amount, payment_date,
    payment_method, bank_account_id, recorded_by
  ) values (
    p_org_id, p_request_key, p_purchase_order_id, p_amount, p_payment_date,
    p_payment_method, p_bank_account_id, p_recorded_by
  ) returning * into payment_row;

  if p_payment_method = 'bank' then
    insert into public.bank_transactions (
      org_id, account_id, type, amount, description, counterparty_name,
      transaction_category, transaction_date, recorded_by, location_id,
      source_restaurant_ingredient_payment_id
    ) values (
      p_org_id, p_bank_account_id, 'withdrawal', p_amount,
      'Restaurant ingredient supplier payment · ' || coalesce(purchase_order.invoice_reference, purchase_order.reference),
      supplier_name, 'expense', p_payment_date, p_recorded_by, purchase_order.location_id, payment_row.id
    ) returning id into bank_transaction_id_value;
    update public.restaurant_ingredient_payments
    set bank_transaction_id = bank_transaction_id_value
    where org_id = p_org_id and id = payment_row.id;
  end if;

  journal_id_value := gen_random_uuid();
  insert into public.journal_entries (
    id, org_id, entry_number, entry_date, location_id, reference, description,
    status, total_debit, total_credit, source_module, source_id, is_auto,
    created_by, posted_by, posted_at
  ) values (
    journal_id_value, p_org_id,
    'RST-ING-PAY-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || left(journal_id_value::text, 8),
    p_payment_date, purchase_order.location_id,
    coalesce(purchase_order.invoice_reference, purchase_order.reference),
    'Restaurant ingredient supplier payment',
    'posted', p_amount, p_amount, 'restaurant_ingredient_payment',
    payment_row.id::text, true, p_recorded_by, p_recorded_by, now()
  );
  insert into public.journal_entry_lines (
    journal_id, org_id, account_id, description, debit, credit, location_id
  ) values
    (journal_id_value, p_org_id, account_mapping.ingredient_payable_account_id,
      'Reduce Restaurant supplier payable', p_amount, 0, purchase_order.location_id),
    (journal_id_value, p_org_id, account_mapping.ingredient_payment_account_id,
      'Restaurant supplier payment', 0, p_amount, purchase_order.location_id);

  update public.restaurant_ingredient_payments
  set journal_id = journal_id_value
  where org_id = p_org_id and id = payment_row.id;

  return query select payment_row.id, next_paid, invoiced_total - next_paid, journal_id_value;
end;
$$;

revoke all on function public.record_restaurant_ingredient_supplier_payment(uuid, uuid, numeric, date, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_restaurant_ingredient_supplier_payment(uuid, uuid, numeric, date, text, uuid, uuid, uuid) to service_role;

commit;
