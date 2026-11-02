begin;

alter table public.restaurant_order_payments
  add column if not exists bank_account_id uuid
    references public.bank_accounts(id) on delete restrict;

create or replace function public.record_restaurant_bill_payment_with_account(
  p_org_id uuid,
  p_order_id uuid,
  p_bill_id uuid,
  p_amount numeric,
  p_tip_amount numeric,
  p_payment_method text,
  p_received_by uuid,
  p_bank_account_id uuid
)
returns public.restaurant_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.restaurant_orders;
  target_bill public.restaurant_bills;
  paid_total numeric(12,2);
  account_type public.bank_account_type;
begin
  if p_bank_account_id is null then
    return public.record_restaurant_bill_payment(
      p_org_id, p_order_id, p_bill_id, p_amount, p_tip_amount, p_payment_method, p_received_by
    );
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record restaurant payments.';
  end if;
  if p_amount < 0 or p_tip_amount < 0 or p_amount <> round(p_amount, 2)
    or p_tip_amount <> round(p_tip_amount, 2) or p_amount + p_tip_amount <= 0
    or p_payment_method not in ('card', 'mobile_money') then
    raise exception 'A valid card or mobile-money payment and account are required.';
  end if;

  select account.account_type into account_type
  from public.bank_accounts account
  where account.id = p_bank_account_id and account.org_id = p_org_id;
  if not found then
    raise exception 'The selected payment account is unavailable in this organization.';
  end if;
  if (p_payment_method = 'card' and account_type not in ('card', 'checking', 'savings', 'other'))
    or (p_payment_method = 'mobile_money' and account_type <> 'mobile_money') then
    raise exception 'The selected account type does not match the payment method.';
  end if;

  select * into target_order
  from public.restaurant_orders
  where org_id = p_org_id and id = p_order_id
  for update;
  if not found or target_order.status = 'cancelled' then
    raise exception 'Restaurant order not found or cancelled.';
  end if;
  select * into target_bill
  from public.restaurant_bills
  where org_id = p_org_id and order_id = p_order_id and id = p_bill_id
  for update;
  if not found then
    raise exception 'Restaurant bill not found for this order.';
  end if;

  select coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0)
  into paid_total
  from public.restaurant_order_payments
  where org_id = p_org_id and bill_id = p_bill_id;
  if p_amount > target_bill.amount - paid_total then
    raise exception 'Payment exceeds the outstanding guest check balance.';
  end if;

  insert into public.restaurant_order_payments (
    org_id, order_id, bill_id, amount, tip_amount, payment_type, payment_method,
    received_by, bank_account_id
  ) values (
    p_org_id, p_order_id, p_bill_id, p_amount, p_tip_amount, 'payment',
    p_payment_method, p_received_by, p_bank_account_id
  );

  select coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0)
  into paid_total
  from public.restaurant_order_payments
  where org_id = p_org_id and order_id = p_order_id;
  update public.restaurant_orders
  set payment_status = case
        when paid_total >= total then 'paid'
        when paid_total > 0 then 'partial'
        else 'unpaid'
      end,
      updated_at = now()
  where org_id = p_org_id and id = p_order_id
  returning * into target_order;
  return target_order;
end;
$$;

revoke all on function public.record_restaurant_bill_payment_with_account(
  uuid, uuid, uuid, numeric, numeric, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.record_restaurant_bill_payment_with_account(
  uuid, uuid, uuid, numeric, numeric, text, uuid, uuid
) to service_role;

create or replace function public.post_restaurant_payment_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mapping public.restaurant_account_mappings;
  order_location uuid;
  order_creator uuid;
  order_number bigint;
  tender_account uuid;
  bank_account_id uuid;
  journal_id uuid;
  journal_date date;
  payment_amount numeric(14,2);
  tip_amount numeric(14,2);
  currency_code text;
  debit_total numeric(14,2);
  lines jsonb := '[]'::jsonb;
begin
  select * into mapping
  from public.restaurant_account_mappings
  where org_id = new.org_id;
  tender_account := case new.payment_method
    when 'cash' then mapping.cash_account_id
    when 'card' then mapping.card_account_id
    when 'mobile_money' then mapping.mobile_money_account_id
    else mapping.other_account_id
  end;
  bank_account_id := new.bank_account_id;
  if bank_account_id is null and new.payment_type = 'refund' and new.refund_of_payment_id is not null then
    select payment.bank_account_id into bank_account_id
    from public.restaurant_order_payments payment
    where payment.id = new.refund_of_payment_id and payment.org_id = new.org_id;
  end if;
  bank_account_id := coalesce(bank_account_id, case new.payment_method
    when 'cash' then mapping.cash_bank_account_id
    when 'card' then mapping.card_bank_account_id
    when 'mobile_money' then mapping.mobile_money_bank_account_id
    else mapping.other_bank_account_id
  end);
  select location_id, created_by, order_number
    into order_location, order_creator, order_number
    from public.restaurant_orders
    where org_id = new.org_id and id = new.order_id;
  if order_location is null then return new; end if;

  if bank_account_id is not null then
    if not exists (
      select 1 from public.bank_accounts
      where id = bank_account_id and org_id = new.org_id
    ) then
      raise exception 'The Restaurant bank account is not available in this organization.';
    end if;
    if coalesce(new.received_by, order_creator, mapping.updated_by) is null then
      raise exception 'A responsible user is required to record the Restaurant bank transaction.';
    end if;
    insert into public.bank_transactions (
      org_id, account_id, type, amount, description, counterparty_name,
      transaction_category, transaction_date, recorded_by, location_id,
      source_restaurant_payment_id
    ) values (
      new.org_id, bank_account_id,
      case when new.payment_type = 'refund' then 'withdrawal'::public.bank_transaction_type
        else 'deposit'::public.bank_transaction_type end,
      new.amount + new.tip_amount,
      case when new.payment_type = 'refund' then 'Restaurant refund for order #' || order_number
        else 'Restaurant payment for order #' || order_number end,
      'Restaurant customer',
      case when new.payment_type = 'refund' then 'expense' else 'income' end,
      new.paid_at::date,
      coalesce(new.received_by, order_creator, mapping.updated_by),
      order_location,
      new.id
    );
  end if;

  if mapping.sales_revenue_account_id is null
    or mapping.refunds_account_id is null
    or mapping.tips_liability_account_id is null
    or mapping.cash_account_id is null
    or mapping.card_account_id is null
    or mapping.mobile_money_account_id is null
    or mapping.other_account_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.accounting_accounts a
    where a.id in (
      tender_account, mapping.sales_revenue_account_id, mapping.refunds_account_id,
      mapping.tips_liability_account_id
    ) and (a.org_id <> new.org_id or not a.is_active)
  ) then
    return new;
  end if;

  payment_amount := new.amount;
  tip_amount := new.tip_amount;
  debit_total := payment_amount + tip_amount;
  if debit_total <= 0 then return new; end if;
  journal_date := coalesce(new.paid_at::date, current_date);
  select coalesce(nullif(default_currency, ''), 'GHS') into currency_code
  from public.accounting_settings where org_id = new.org_id;
  currency_code := coalesce(currency_code, 'GHS');
  if new.payment_type = 'payment' then
    if payment_amount > 0 then
      lines := lines || jsonb_build_array(
        jsonb_build_object('account_id', tender_account, 'description', 'Restaurant payment received', 'debit', payment_amount, 'credit', 0),
        jsonb_build_object('account_id', mapping.sales_revenue_account_id, 'description', 'Restaurant sales', 'debit', 0, 'credit', payment_amount)
      );
    end if;
    if tip_amount > 0 then
      lines := lines || jsonb_build_array(
        jsonb_build_object('account_id', tender_account, 'description', 'Restaurant tip received', 'debit', tip_amount, 'credit', 0),
        jsonb_build_object('account_id', mapping.tips_liability_account_id, 'description', 'Restaurant tips payable', 'debit', 0, 'credit', tip_amount)
      );
    end if;
  else
    if payment_amount > 0 then
      lines := lines || jsonb_build_array(
        jsonb_build_object('account_id', mapping.refunds_account_id, 'description', 'Restaurant payment refunded', 'debit', payment_amount, 'credit', 0),
        jsonb_build_object('account_id', tender_account, 'description', 'Restaurant refund paid', 'debit', 0, 'credit', payment_amount)
      );
    end if;
    if tip_amount > 0 then
      lines := lines || jsonb_build_array(
        jsonb_build_object('account_id', mapping.tips_liability_account_id, 'description', 'Restaurant tip refund', 'debit', tip_amount, 'credit', 0),
        jsonb_build_object('account_id', tender_account, 'description', 'Restaurant tip refund paid', 'debit', 0, 'credit', tip_amount)
      );
    end if;
  end if;

  insert into public.journal_entries (
    org_id, entry_number, entry_date, location_id, reference, description, status,
    total_debit, total_credit, currency, source_module, source_id, is_auto,
    created_by, posted_by, posted_at
  ) values (
    new.org_id,
    'RST-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || left(new.id::text, 8),
    journal_date, order_location, new.id::text,
    case when new.payment_type = 'refund' then 'Restaurant payment refund' else 'Restaurant payment' end,
    'posted', debit_total, debit_total, currency_code, 'restaurant_payment', new.id::text, true,
    new.received_by, new.received_by, now()
  )
  on conflict (org_id, source_module, source_id) where source_id is not null
  do nothing
  returning id into journal_id;

  if journal_id is not null then
    insert into public.journal_entry_lines (
      journal_id, org_id, account_id, description, debit, credit, location_id
    )
    select journal_id, new.org_id, (line->>'account_id')::uuid, line->>'description',
      (line->>'debit')::numeric, (line->>'credit')::numeric, order_location
    from jsonb_array_elements(lines) line;
  end if;
  return new;
end;
$$;

create or replace function public.create_restaurant_order_with_split_payment(
  p_org_id uuid,
  p_location_id uuid,
  p_order_type text,
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb,
  p_created_by uuid,
  p_request_key uuid,
  p_payments jsonb,
  p_tip_amount numeric
)
returns table (
  order_id uuid,
  order_number bigint,
  bill_id uuid,
  payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.restaurant_orders;
  target_bill public.restaurant_bills;
  previous_request public.restaurant_pos_order_requests;
  payment_entry jsonb;
  entry_amount numeric(12,2);
  payment_total numeric(12,2) := 0;
  allocated_tip numeric(12,2);
  tip_recorded boolean := false;
  entry_account_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create paid restaurant POS orders.';
  end if;
  if p_request_key is null
    or p_tip_amount is null
    or p_tip_amount < 0
    or p_tip_amount <> round(p_tip_amount, 2)
    or p_payments is null
    or jsonb_typeof(p_payments) <> 'array'
    or jsonb_array_length(p_payments) < 1
    or jsonb_array_length(p_payments) > 4 then
    raise exception 'Enter one to four valid payments and a valid tip amount.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) as split_entries(entry)
    where jsonb_typeof(entry) <> 'object'
      or coalesce(entry->>'method', '') not in ('cash', 'card', 'mobile_money', 'other')
      or coalesce(entry->>'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or (entry ? 'account_id' and coalesce(entry->>'account_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or (entry ? 'account_id' and entry->>'method' not in ('card', 'mobile_money'))
  ) then
    raise exception 'Each payment needs a supported method, valid amount, and compatible account selection.';
  end if;

  if (select count(distinct entry->>'method') from jsonb_array_elements(p_payments) as split_entries(entry))
    <> jsonb_array_length(p_payments) then
    raise exception 'Choose a different payment method for each split.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_payments) with ordinality as split_entries(entry, payment_index)
    where (entry->>'method' in ('card', 'mobile_money')
      and (
        (entry->>'amount')::numeric > 0
        or (payment_index = 1 and p_tip_amount > 0)
      )
      and coalesce(entry->>'account_id', '') = '')
  ) then
    raise exception 'Select the bank account for each card or mobile-money payment.';
  end if;

  select coalesce(sum((entry->>'amount')::numeric), 0)
  into payment_total
  from jsonb_array_elements(p_payments) as split_entries(entry);

  perform pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_request_key::text, 0)
  );
  select * into previous_request
  from public.restaurant_pos_order_requests request
  where request.org_id = p_org_id and request.request_key = p_request_key;
  if found then
    return query
      select orders.id, orders.order_number, previous_request.bill_id, orders.payment_status
      from public.restaurant_orders orders
      where orders.org_id = p_org_id and orders.id = previous_request.order_id;
    return;
  end if;

  created_order := public.create_restaurant_order(
    p_org_id, p_location_id, p_order_type, p_table_id, p_customer_name,
    p_customer_phone, p_delivery_address, p_notes, p_items, p_created_by
  );
  select * into target_bill
  from public.restaurant_bills bill
  where bill.org_id = p_org_id and bill.order_id = created_order.id
  order by bill.created_at, bill.id
  limit 1
  for update;
  if not found then
    raise exception 'Could not find the bill for the new restaurant order.';
  end if;
  if payment_total <> target_bill.amount then
    raise exception 'Payments must add up exactly to the order total.';
  end if;

  for payment_entry in
    select value from jsonb_array_elements(p_payments) as entries(value)
  loop
    entry_amount := (payment_entry->>'amount')::numeric;
    allocated_tip := case when not tip_recorded then p_tip_amount else 0 end;
    entry_account_id := case
      when payment_entry ? 'account_id' then (payment_entry->>'account_id')::uuid
      else null
    end;
    if entry_amount > 0 or allocated_tip > 0 then
      perform public.record_restaurant_bill_payment_with_account(
        p_org_id, created_order.id, target_bill.id, entry_amount, allocated_tip,
        payment_entry->>'method', p_created_by, entry_account_id
      );
      tip_recorded := true;
    end if;
  end loop;

  if created_order.total = 0 then
    update public.restaurant_orders
    set payment_status = 'paid', updated_at = now()
    where org_id = p_org_id and id = created_order.id
    returning * into created_order;
  else
    select * into created_order
    from public.restaurant_orders
    where org_id = p_org_id and id = created_order.id;
  end if;
  insert into public.restaurant_pos_order_requests (org_id, request_key, order_id, bill_id)
  values (p_org_id, p_request_key, created_order.id, target_bill.id);
  return query
    select created_order.id, created_order.order_number, target_bill.id, created_order.payment_status;
end;
$$;

revoke all on function public.create_restaurant_order_with_split_payment(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, jsonb, numeric
) from public, anon, authenticated;
grant execute on function public.create_restaurant_order_with_split_payment(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, jsonb, numeric
) to service_role;

commit;
