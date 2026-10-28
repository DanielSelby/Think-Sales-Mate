begin;

-- Restaurant ingredient purchasing remains independent of ERP product stock.
create unique index if not exists business_locations_org_id_id_idx
  on public.business_locations(org_id, id);

create table if not exists public.restaurant_ingredient_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'ordered'
    check (status in ('ordered', 'partially_received', 'received')),
  reference text not null check (length(btrim(reference)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict
);

create table if not exists public.restaurant_ingredient_purchase_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null,
  ingredient_id uuid not null,
  ordered_quantity numeric(14,3) not null check (ordered_quantity > 0),
  quantity_received numeric(14,3) not null default 0
    check (quantity_received >= 0 and quantity_received <= ordered_quantity),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, purchase_order_id)
    references public.restaurant_ingredient_purchase_orders(org_id, id) on delete cascade,
  foreign key (org_id, ingredient_id)
    references public.restaurant_ingredients(org_id, id) on delete restrict,
  unique (purchase_order_id, ingredient_id)
);

alter table public.restaurant_ingredient_movements
  add column if not exists purchase_order_id uuid;
alter table public.restaurant_ingredient_movements
  drop constraint if exists restaurant_ingredient_movements_movement_type_check;
alter table public.restaurant_ingredient_movements
  drop constraint if exists restaurant_ingredient_movements_check;
alter table public.restaurant_ingredient_movements
  add constraint restaurant_ingredient_movements_type_check
  check (movement_type in ('adjustment', 'consumption', 'purchase_receipt'));
alter table public.restaurant_ingredient_movements
  add constraint restaurant_ingredient_movements_source_check
  check (
    (movement_type = 'adjustment' and order_id is null and purchase_order_id is null)
    or (movement_type = 'consumption' and order_id is not null and purchase_order_id is null)
    or (movement_type = 'purchase_receipt' and order_id is null and purchase_order_id is not null)
  );
alter table public.restaurant_ingredient_movements
  add constraint restaurant_ingredient_movements_purchase_order_fk
  foreign key (org_id, purchase_order_id)
  references public.restaurant_ingredient_purchase_orders(org_id, id) on delete restrict;

create index if not exists restaurant_ingredient_purchase_orders_branch_date_idx
  on public.restaurant_ingredient_purchase_orders(org_id, location_id, created_at desc);
create index if not exists restaurant_ingredient_purchase_items_order_idx
  on public.restaurant_ingredient_purchase_items(org_id, purchase_order_id);
alter table public.restaurant_ingredient_purchase_orders enable row level security;
alter table public.restaurant_ingredient_purchase_items enable row level security;
drop policy if exists "Restaurant ingredient purchase orders: members read" on public.restaurant_ingredient_purchase_orders;
create policy "Restaurant ingredient purchase orders: members read"
  on public.restaurant_ingredient_purchase_orders for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
drop policy if exists "Restaurant ingredient purchase items: members read" on public.restaurant_ingredient_purchase_items;
create policy "Restaurant ingredient purchase items: members read"
  on public.restaurant_ingredient_purchase_items for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.restaurant_ingredient_purchase_orders po
      where po.org_id = restaurant_ingredient_purchase_items.org_id
        and po.id = restaurant_ingredient_purchase_items.purchase_order_id
        and public.can_access_org_location(po.org_id, po.location_id)
    )
  );

create or replace function public.receive_restaurant_ingredient_purchase(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_received_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.restaurant_ingredient_purchase_orders;
  line_spec jsonb;
  item_row public.restaurant_ingredient_purchase_items;
  receive_quantity numeric(14,3);
  stock_quantity numeric(14,3);
  existing_stock_quantity numeric(14,3);
  existing_unit_cost numeric(12,4);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can receive restaurant ingredient purchases.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 100 then
    raise exception 'Provide one or more valid purchase receipt lines.';
  end if;

  select * into order_row
  from public.restaurant_ingredient_purchase_orders
  where org_id = p_org_id and id = p_purchase_order_id
  for update;
  if not found or order_row.status = 'received' then
    raise exception 'Restaurant ingredient purchase order is not receivable.';
  end if;

  for line_spec in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(line_spec) <> 'object'
      or coalesce(line_spec->>'item_id', '') = ''
      or coalesce(line_spec->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$' then
      raise exception 'Each receipt line requires a valid item and quantity.';
    end if;
    receive_quantity := (line_spec->>'quantity')::numeric;
    if receive_quantity <= 0 then
      raise exception 'Receipt quantities must be positive.';
    end if;
    select * into item_row
    from public.restaurant_ingredient_purchase_items
    where org_id = p_org_id and purchase_order_id = p_purchase_order_id
      and id = (line_spec->>'item_id')::uuid
    for update;
    if not found or receive_quantity > item_row.ordered_quantity - item_row.quantity_received then
      raise exception 'Receipt quantity exceeds the remaining ordered quantity.';
    end if;

    select cost_per_unit into existing_unit_cost
      from public.restaurant_ingredients
      where org_id = p_org_id and id = item_row.ingredient_id
      for update;
    select coalesce(sum(quantity), 0) into existing_stock_quantity
      from public.restaurant_ingredient_stock
      where org_id = p_org_id and ingredient_id = item_row.ingredient_id;

    insert into public.restaurant_ingredient_stock (
      org_id, location_id, ingredient_id, quantity, updated_at
    ) values (
      p_org_id, order_row.location_id, item_row.ingredient_id, receive_quantity, now()
    )
    on conflict (org_id, location_id, ingredient_id)
    do update set quantity = restaurant_ingredient_stock.quantity + excluded.quantity,
      updated_at = now()
    returning quantity into stock_quantity;

    update public.restaurant_ingredients
    set cost_per_unit = case
      when existing_stock_quantity + receive_quantity = 0 then item_row.unit_cost
      else round(
        (existing_stock_quantity * existing_unit_cost + receive_quantity * item_row.unit_cost)
        / (existing_stock_quantity + receive_quantity), 4
      )
    end,
    updated_at = now()
    where org_id = p_org_id and id = item_row.ingredient_id;

    update public.restaurant_ingredient_purchase_items
      set quantity_received = quantity_received + receive_quantity
      where id = item_row.id;
    insert into public.restaurant_ingredient_movements (
      org_id, location_id, ingredient_id, purchase_order_id, movement_type,
      quantity_delta, balance_after, reason, created_by
    ) values (
      p_org_id, order_row.location_id, item_row.ingredient_id, p_purchase_order_id,
      'purchase_receipt', receive_quantity, stock_quantity,
      'Restaurant purchase receipt ' || order_row.reference, p_received_by
    );
  end loop;

  update public.restaurant_ingredient_purchase_orders po
  set status = case
        when exists (
          select 1 from public.restaurant_ingredient_purchase_items i
          where i.org_id = po.org_id and i.purchase_order_id = po.id
            and i.quantity_received < i.ordered_quantity
        ) then 'partially_received'
        else 'received'
      end,
      received_at = case
        when exists (
          select 1 from public.restaurant_ingredient_purchase_items i
          where i.org_id = po.org_id and i.purchase_order_id = po.id
            and i.quantity_received < i.ordered_quantity
        ) then null else now()
      end,
      updated_at = now()
  where po.org_id = p_org_id and po.id = p_purchase_order_id;
end;
$$;
revoke all on function public.receive_restaurant_ingredient_purchase(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.receive_restaurant_ingredient_purchase(uuid, uuid, jsonb, uuid) to service_role;

-- Link only unambiguous exact CRM identity matches; do not create customers.
alter table public.restaurant_orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists restaurant_orders_customer_idx
  on public.restaurant_orders(org_id, customer_id, created_at desc)
  where customer_id is not null;

create or replace function public.link_restaurant_order_crm_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer_id uuid;
  match_count integer;
begin
  if new.customer_id is not null then
    if not exists (
      select 1 from public.customers
      where id = new.customer_id and org_id = new.org_id
    ) then
      new.customer_id := null;
    else
      return new;
    end if;
  end if;
  select count(distinct c.id), min(c.id::text)::uuid
    into match_count, matched_customer_id
  from public.customers c
  where c.org_id = new.org_id
    and (
      (nullif(btrim(new.customer_email), '') is not null
        and lower(btrim(c.email)) = lower(btrim(new.customer_email)))
      or
      (nullif(regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g'), '') is not null
        and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(new.customer_phone, '[^0-9]', '', 'g'))
    );
  if match_count = 1 then
    new.customer_id := matched_customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_orders_link_crm_customer on public.restaurant_orders;
create trigger restaurant_orders_link_crm_customer
  before insert or update of customer_email, customer_phone, customer_id
  on public.restaurant_orders
  for each row execute function public.link_restaurant_order_crm_customer();

update public.restaurant_orders o
set customer_id = matches.customer_id
from (
  select o.id, min(c.id::text)::uuid as customer_id
  from public.restaurant_orders o
  join public.customers c on c.org_id = o.org_id
    and (
      (nullif(btrim(o.customer_email), '') is not null
        and lower(btrim(c.email)) = lower(btrim(o.customer_email)))
      or
      (nullif(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), '') is not null
        and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(o.customer_phone, '[^0-9]', '', 'g'))
    )
  where o.customer_id is null
  group by o.id
  having count(distinct c.id) = 1
) matches
where o.id = matches.id;

create or replace function public.get_restaurant_customer_history(
  p_org_id uuid,
  p_location_ids uuid[] default null
)
returns table (
  customer_id uuid,
  visits bigint,
  net_spend numeric,
  last_activity timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read Restaurant customer history.';
  end if;
  return query
  select o.customer_id,
    count(*)::bigint,
    coalesce(sum(case
      when coalesce(payment_totals.payment_count, 0) > 0 then payment_totals.net_paid
      else o.total
    end), 0)::numeric,
    max(o.created_at)
  from public.restaurant_orders o
  left join lateral (
    select count(*) as payment_count,
      sum(case when p.payment_type = 'payment' then p.amount else -p.amount end) as net_paid
    from public.restaurant_order_payments p
    where p.org_id = o.org_id and p.order_id = o.id
  ) payment_totals on true
  where o.org_id = p_org_id
    and o.customer_id is not null
    and o.status = 'completed'
    and (p_location_ids is null or o.location_id = any(p_location_ids))
  group by o.customer_id;
end;
$$;
revoke all on function public.get_restaurant_customer_history(uuid, uuid[]) from public;
grant execute on function public.get_restaurant_customer_history(uuid, uuid[]) to service_role;

-- This report intentionally has no branch attribution: attendance does not
-- currently record the employee's Restaurant branch or assignment.
create or replace function public.get_restaurant_attendance_hours(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read restaurant attendance summaries.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
    or p_end_date - p_start_date > 366 then
    raise exception 'Choose a valid attendance date range of no more than 366 days.';
  end if;
  select jsonb_build_object(
    'total_hours', coalesce(sum(total_hours), 0),
    'staff_count', count(distinct employee_id) filter (where total_hours > 0),
    'record_count', count(*) filter (where total_hours > 0)
  ) into result
  from public.attendance_records
  where org_id = p_org_id
    and work_date between p_start_date and p_end_date
    and total_hours > 0;
  return result;
end;
$$;
revoke all on function public.get_restaurant_attendance_hours(uuid, date, date) from public;
grant execute on function public.get_restaurant_attendance_hours(uuid, date, date) to service_role;

-- Configurable accounts for automatic payment/refund journals. No journal is
-- posted until every required mapping is present and valid.
alter table public.bank_transactions
  add column if not exists source_restaurant_payment_id uuid
  references public.restaurant_order_payments(id) on delete set null;
create unique index if not exists bank_transactions_restaurant_payment_source_idx
  on public.bank_transactions(org_id, source_restaurant_payment_id)
  where source_restaurant_payment_id is not null;

create or replace function public.validate_restaurant_bank_transaction_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_restaurant_payment_id is not null
    and not exists (
      select 1 from public.restaurant_order_payments p
      where p.id = new.source_restaurant_payment_id and p.org_id = new.org_id
    ) then
    raise exception 'Restaurant payment source must belong to this organization.';
  end if;
  return new;
end;
$$;
drop trigger if exists bank_transactions_validate_restaurant_source on public.bank_transactions;
create trigger bank_transactions_validate_restaurant_source
  before insert or update of org_id, source_restaurant_payment_id
  on public.bank_transactions
  for each row execute function public.validate_restaurant_bank_transaction_source();
revoke all on function public.validate_restaurant_bank_transaction_source() from public;

create table if not exists public.restaurant_account_mappings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  cash_account_id uuid references public.accounting_accounts(id) on delete restrict,
  card_account_id uuid references public.accounting_accounts(id) on delete restrict,
  mobile_money_account_id uuid references public.accounting_accounts(id) on delete restrict,
  other_account_id uuid references public.accounting_accounts(id) on delete restrict,
  sales_revenue_account_id uuid references public.accounting_accounts(id) on delete restrict,
  refunds_account_id uuid references public.accounting_accounts(id) on delete restrict,
  tips_liability_account_id uuid references public.accounting_accounts(id) on delete restrict,
  cash_bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  card_bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  mobile_money_bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  other_bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.restaurant_account_mappings enable row level security;
drop policy if exists "Restaurant account mappings: members read" on public.restaurant_account_mappings;
create policy "Restaurant account mappings: members read"
  on public.restaurant_account_mappings for select
  using (public.is_org_member(org_id));

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
  select * into mapping from public.restaurant_account_mappings where org_id = new.org_id;
  if not found then return new; end if;
  tender_account := case new.payment_method
    when 'cash' then mapping.cash_account_id
    when 'card' then mapping.card_account_id
    when 'mobile_money' then mapping.mobile_money_account_id
    else mapping.other_account_id
  end;
  bank_account_id := case new.payment_method
    when 'cash' then mapping.cash_bank_account_id
    when 'card' then mapping.card_bank_account_id
    when 'mobile_money' then mapping.mobile_money_bank_account_id
    else mapping.other_bank_account_id
  end;
  select location_id, created_by, order_number
    into order_location, order_creator, order_number
    from public.restaurant_orders where org_id = new.org_id and id = new.order_id;
  if order_location is null then return new; end if;

  if bank_account_id is not null then
    if not exists (
      select 1 from public.bank_accounts
      where id = bank_account_id and org_id = new.org_id
    ) then
      raise exception 'The mapped Restaurant bank account is not available in this organization.';
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
      lines := lines || jsonb_build_array(jsonb_build_object(
        'account_id', tender_account, 'description', 'Restaurant payment received',
        'debit', payment_amount, 'credit', 0
      ), jsonb_build_object(
        'account_id', mapping.sales_revenue_account_id, 'description', 'Restaurant sales',
        'debit', 0, 'credit', payment_amount
      ));
    end if;
    if tip_amount > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object(
        'account_id', tender_account, 'description', 'Restaurant tip received',
        'debit', tip_amount, 'credit', 0
      ), jsonb_build_object(
        'account_id', mapping.tips_liability_account_id, 'description', 'Restaurant tips payable',
        'debit', 0, 'credit', tip_amount
      ));
    end if;
  else
    if payment_amount > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object(
        'account_id', mapping.refunds_account_id, 'description', 'Restaurant payment refunded',
        'debit', payment_amount, 'credit', 0
      ), jsonb_build_object(
        'account_id', tender_account, 'description', 'Restaurant refund paid',
        'debit', 0, 'credit', payment_amount
      ));
    end if;
    if tip_amount > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object(
        'account_id', mapping.tips_liability_account_id, 'description', 'Restaurant tip refund',
        'debit', tip_amount, 'credit', 0
      ), jsonb_build_object(
        'account_id', tender_account, 'description', 'Restaurant tip refund paid',
        'debit', 0, 'credit', tip_amount
      ));
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

drop trigger if exists restaurant_payment_post_journal on public.restaurant_order_payments;
create trigger restaurant_payment_post_journal
  after insert on public.restaurant_order_payments
  for each row execute function public.post_restaurant_payment_journal();
revoke all on function public.post_restaurant_payment_journal() from public;

commit;
