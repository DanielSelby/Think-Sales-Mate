begin;

alter table public.restaurant_account_mappings
  add column if not exists ingredient_inventory_account_id uuid
    references public.accounting_accounts(id) on delete restrict,
  add column if not exists ingredient_payable_account_id uuid
    references public.accounting_accounts(id) on delete restrict;

create table if not exists public.restaurant_ingredient_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_key uuid not null,
  purchase_order_id uuid not null,
  amount numeric(14,2) not null check (amount >= 0),
  accounting_status text not null check (accounting_status in ('posted', 'not_configured', 'zero_value')),
  journal_id uuid references public.journal_entries(id) on delete set null,
  received_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, request_key),
  foreign key (org_id, purchase_order_id)
    references public.restaurant_ingredient_purchase_orders(org_id, id) on delete restrict
);

alter table public.restaurant_ingredient_receipts enable row level security;
revoke all on public.restaurant_ingredient_receipts from public, anon, authenticated;
grant all on public.restaurant_ingredient_receipts to service_role;

create or replace function public.receive_restaurant_ingredient_purchase_with_accounting(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_received_by uuid,
  p_request_key uuid
)
returns table (
  receipt_id uuid,
  amount numeric,
  accounting_status text,
  journal_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_order public.restaurant_ingredient_purchase_orders;
  existing_receipt public.restaurant_ingredient_receipts;
  account_mapping public.restaurant_account_mappings;
  receipt_row public.restaurant_ingredient_receipts;
  received_amount numeric(14,2);
  inventory_account_type text;
  payable_account_type text;
  inventory_account_location uuid;
  payable_account_location uuid;
  new_journal_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can receive Restaurant ingredient purchases.';
  end if;
  if p_request_key is null or p_received_by is null
    or coalesce(jsonb_typeof(p_lines), '') <> 'array'
    or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 100 then
    raise exception 'Provide a valid receipt request and one or more purchase lines.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_request_key::text, 0)
  );
  select * into existing_receipt
  from public.restaurant_ingredient_receipts receipt
  where receipt.org_id = p_org_id and receipt.request_key = p_request_key;
  if found then
    if existing_receipt.purchase_order_id <> p_purchase_order_id then
      raise exception 'This receipt request was already used for a different Restaurant purchase order.';
    end if;
    return query select existing_receipt.id, existing_receipt.amount,
      existing_receipt.accounting_status, existing_receipt.journal_id;
    return;
  end if;

  select * into purchase_order
  from public.restaurant_ingredient_purchase_orders po
  where po.org_id = p_org_id and po.id = p_purchase_order_id
  for update;
  if not found or purchase_order.status = 'received' then
    raise exception 'Restaurant ingredient purchase order not found or already fully received.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    group by line->>'item_id'
    having count(*) > 1
  ) then
    raise exception 'A purchase line can only appear once in a receipt.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    left join public.restaurant_ingredient_purchase_items item
      on item.org_id = p_org_id
      and item.purchase_order_id = p_purchase_order_id
      and item.id = (line->>'item_id')::uuid
    where item.id is null
      or jsonb_typeof(line->'quantity') <> 'number'
      or (line->>'quantity')::numeric <= 0
      or abs((line->>'quantity')::numeric * 1000 - round((line->>'quantity')::numeric * 1000)) > 0.000001
  ) then
    raise exception 'Receipt lines must contain valid purchase items and positive quantities to three decimal places.';
  end if;

  select round(sum((line->>'quantity')::numeric * item.unit_cost), 2)
  into received_amount
  from jsonb_array_elements(p_lines) line
  join public.restaurant_ingredient_purchase_items item
    on item.org_id = p_org_id
    and item.purchase_order_id = p_purchase_order_id
    and item.id = (line->>'item_id')::uuid;
  if received_amount is null or received_amount < 0 then
    raise exception 'The received purchase value cannot be negative.';
  end if;

  perform public.receive_restaurant_ingredient_purchase(
    p_org_id, p_purchase_order_id, p_lines, p_received_by
  );

  select * into account_mapping
  from public.restaurant_account_mappings mapping
  where mapping.org_id = p_org_id;

  if received_amount = 0 then
    insert into public.restaurant_ingredient_receipts (
      org_id, request_key, purchase_order_id, amount, accounting_status, received_by
    ) values (
      p_org_id, p_request_key, p_purchase_order_id, received_amount, 'zero_value', p_received_by
    ) returning * into receipt_row;
  elsif account_mapping.ingredient_inventory_account_id is null
    and account_mapping.ingredient_payable_account_id is null then
    insert into public.restaurant_ingredient_receipts (
      org_id, request_key, purchase_order_id, amount, accounting_status, received_by
    ) values (
      p_org_id, p_request_key, p_purchase_order_id, received_amount, 'not_configured', p_received_by
    ) returning * into receipt_row;
  else
    if account_mapping.ingredient_inventory_account_id is null
      or account_mapping.ingredient_payable_account_id is null then
      raise exception 'Configure both Restaurant ingredient inventory and payable accounts before receiving this purchase.';
    end if;

    select inventory.type::text, inventory.location_id,
      payable.type::text, payable.location_id
    into inventory_account_type, inventory_account_location,
      payable_account_type, payable_account_location
    from public.accounting_accounts inventory
    join public.accounting_accounts payable
      on payable.org_id = inventory.org_id
      and payable.id = account_mapping.ingredient_payable_account_id
    where inventory.org_id = p_org_id
      and inventory.id = account_mapping.ingredient_inventory_account_id
      and inventory.is_active and payable.is_active;

    if not found or inventory_account_type <> 'asset' or payable_account_type <> 'liability'
      or inventory_account_location is not null or payable_account_location is not null then
      raise exception 'Restaurant ingredient accounting mappings must be active organization-wide asset and liability accounts.';
    end if;

    new_journal_id := gen_random_uuid();
    insert into public.journal_entries (
      id, org_id, entry_number, entry_date, location_id, reference, description,
      status, total_debit, total_credit, source_module, source_id, is_auto,
      created_by, posted_by, posted_at
    ) values (
      new_journal_id, p_org_id,
      'RST-ING-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || left(new_journal_id::text, 8),
      current_date, purchase_order.location_id, purchase_order.reference,
      'Restaurant ingredient purchase receipt',
      'posted', received_amount, received_amount, 'restaurant_ingredient_receipt',
      p_request_key::text, true, p_received_by, p_received_by, now()
    );
    insert into public.journal_entry_lines (
      journal_id, org_id, account_id, description, debit, credit, location_id
    ) values
      (new_journal_id, p_org_id, account_mapping.ingredient_inventory_account_id,
        'Restaurant ingredients received', received_amount, 0, purchase_order.location_id),
      (new_journal_id, p_org_id, account_mapping.ingredient_payable_account_id,
        'Restaurant supplier payable', 0, received_amount, purchase_order.location_id);

    insert into public.restaurant_ingredient_receipts (
      org_id, request_key, purchase_order_id, amount, accounting_status, journal_id, received_by
    ) values (
      p_org_id, p_request_key, p_purchase_order_id, received_amount, 'posted', new_journal_id, p_received_by
    ) returning * into receipt_row;
  end if;

  return query select receipt_row.id, receipt_row.amount,
    receipt_row.accounting_status, receipt_row.journal_id;
end;
$$;

revoke all on function public.receive_restaurant_ingredient_purchase_with_accounting(uuid, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.receive_restaurant_ingredient_purchase_with_accounting(uuid, uuid, jsonb, uuid, uuid) to service_role;

commit;
