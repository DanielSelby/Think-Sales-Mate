begin;

create table if not exists public.restaurant_packaged_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
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

create table if not exists public.restaurant_packaged_purchase_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null,
  menu_item_id uuid not null,
  ordered_quantity numeric(14,3) not null check (ordered_quantity > 0),
  quantity_received numeric(14,3) not null default 0
    check (quantity_received >= 0 and quantity_received <= ordered_quantity),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, purchase_order_id)
    references public.restaurant_packaged_purchase_orders(org_id, id) on delete cascade,
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete restrict,
  unique (purchase_order_id, menu_item_id)
);

alter table public.restaurant_packaged_item_movements
  add column if not exists purchase_order_id uuid;
alter table public.restaurant_packaged_item_movements
  drop constraint if exists restaurant_packaged_item_movements_movement_type_check;
alter table public.restaurant_packaged_item_movements
  drop constraint if exists restaurant_packaged_item_movements_check;
alter table public.restaurant_packaged_item_movements
  drop constraint if exists restaurant_packaged_item_movements_order_id_check;
alter table public.restaurant_packaged_item_movements
  add constraint restaurant_packaged_item_movements_type_check
  check (movement_type in ('adjustment', 'sale', 'purchase_receipt', 'waste'));
alter table public.restaurant_packaged_item_movements
  add constraint restaurant_packaged_item_movements_source_check
  check (
    (movement_type in ('adjustment', 'waste') and order_id is null and purchase_order_id is null)
    or (movement_type = 'sale' and order_id is not null and purchase_order_id is null)
    or (movement_type = 'purchase_receipt' and order_id is null and purchase_order_id is not null)
  );
alter table public.restaurant_packaged_item_movements
  add constraint restaurant_packaged_item_movements_purchase_order_fk
  foreign key (org_id, purchase_order_id)
  references public.restaurant_packaged_purchase_orders(org_id, id) on delete restrict;

create index if not exists restaurant_packaged_purchase_orders_branch_date_idx
  on public.restaurant_packaged_purchase_orders(org_id, location_id, created_at desc);
create index if not exists restaurant_packaged_purchase_items_order_idx
  on public.restaurant_packaged_purchase_items(org_id, purchase_order_id);
alter table public.restaurant_packaged_purchase_orders enable row level security;
alter table public.restaurant_packaged_purchase_items enable row level security;

drop policy if exists "Restaurant packaged purchase orders: members read assigned locations" on public.restaurant_packaged_purchase_orders;
create policy "Restaurant packaged purchase orders: members read assigned locations"
  on public.restaurant_packaged_purchase_orders for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
drop policy if exists "Restaurant packaged purchase items: members read assigned locations" on public.restaurant_packaged_purchase_items;
create policy "Restaurant packaged purchase items: members read assigned locations"
  on public.restaurant_packaged_purchase_items for select
  using (
    public.is_org_member(org_id) and exists (
      select 1 from public.restaurant_packaged_purchase_orders purchase
      where purchase.org_id = restaurant_packaged_purchase_items.org_id
        and purchase.id = restaurant_packaged_purchase_items.purchase_order_id
        and public.can_access_org_location(purchase.org_id, purchase.location_id)
    )
  );

create or replace function public.receive_restaurant_packaged_purchase(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_received_by uuid
)
returns public.restaurant_packaged_purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_row public.restaurant_packaged_purchase_orders;
  line jsonb;
  line_row public.restaurant_packaged_purchase_items;
  stock_quantity numeric(14,3);
  next_quantity numeric(14,3);
  remaining numeric(14,3);
  pending_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can receive Restaurant packaged purchases.';
  end if;
  if coalesce(jsonb_typeof(p_lines), '') <> 'array' or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 100 then
    raise exception 'Choose one or more valid packaged purchase lines to receive.';
  end if;
  select * into purchase_row
    from public.restaurant_packaged_purchase_orders
    where org_id = p_org_id and id = p_purchase_order_id for update;
  if not found or purchase_row.status = 'received' then
    raise exception 'Packaged purchase order not found or already fully received.';
  end if;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(line) <> 'object'
      or coalesce(line->>'item_id', '') = ''
      or coalesce((line->>'quantity')::numeric, 0) <= 0
      or abs((line->>'quantity')::numeric * 1000 - round((line->>'quantity')::numeric * 1000)) > 0.000001 then
      raise exception 'Each received quantity must be positive with no more than three decimal places.';
    end if;
    select * into line_row
      from public.restaurant_packaged_purchase_items
      where org_id = p_org_id and purchase_order_id = p_purchase_order_id
        and id = (line->>'item_id')::uuid for update;
    if not found then
      raise exception 'A packaged purchase line does not belong to this order.';
    end if;
    remaining := line_row.ordered_quantity - line_row.quantity_received;
    if (line->>'quantity')::numeric > remaining then
      raise exception 'Received quantity exceeds the remaining ordered quantity.';
    end if;

    insert into public.restaurant_packaged_item_stock (org_id, location_id, menu_item_id, quantity)
      values (p_org_id, purchase_row.location_id, line_row.menu_item_id, 0)
      on conflict (org_id, location_id, menu_item_id) do nothing;
    select quantity into stock_quantity
      from public.restaurant_packaged_item_stock
      where org_id = p_org_id and location_id = purchase_row.location_id
        and menu_item_id = line_row.menu_item_id for update;
    next_quantity := stock_quantity + (line->>'quantity')::numeric;
    update public.restaurant_packaged_item_stock
      set quantity = next_quantity, updated_at = now()
      where org_id = p_org_id and location_id = purchase_row.location_id
        and menu_item_id = line_row.menu_item_id;
    update public.restaurant_packaged_purchase_items
      set quantity_received = quantity_received + (line->>'quantity')::numeric
      where id = line_row.id;
    insert into public.restaurant_packaged_item_movements (
      org_id, location_id, menu_item_id, purchase_order_id, movement_type,
      quantity_delta, balance_after, reason, created_by
    ) values (
      p_org_id, purchase_row.location_id, line_row.menu_item_id, p_purchase_order_id,
      'purchase_receipt', (line->>'quantity')::numeric, next_quantity,
      'Received packaged purchase ' || purchase_row.reference, p_received_by
    );
  end loop;

  select count(*) into pending_count
    from public.restaurant_packaged_purchase_items
    where org_id = p_org_id and purchase_order_id = p_purchase_order_id
      and quantity_received < ordered_quantity;
  update public.restaurant_packaged_purchase_orders
    set status = case when pending_count = 0 then 'received'::text else 'partially_received'::text end,
        received_at = case when pending_count = 0 then now() else received_at end,
        updated_at = now()
    where org_id = p_org_id and id = p_purchase_order_id
    returning * into purchase_row;
  return purchase_row;
end;
$$;

revoke all on function public.receive_restaurant_packaged_purchase(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.receive_restaurant_packaged_purchase(uuid, uuid, jsonb, uuid) to service_role;

commit;
