begin;

create table if not exists public.restaurant_packaged_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_location_id uuid not null,
  destination_location_id uuid not null,
  menu_item_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check (source_location_id <> destination_location_id),
  foreign key (org_id, source_location_id) references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, destination_location_id) references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, menu_item_id) references public.restaurant_menu_items(org_id, id) on delete restrict
);

alter table public.restaurant_packaged_item_movements
  add column if not exists transfer_id uuid;
alter table public.restaurant_packaged_item_movements
  drop constraint if exists restaurant_packaged_item_movements_type_check;
alter table public.restaurant_packaged_item_movements
  drop constraint if exists restaurant_packaged_item_movements_source_check;
alter table public.restaurant_packaged_item_movements
  add constraint restaurant_packaged_item_movements_type_check
  check (movement_type in ('adjustment', 'sale', 'purchase_receipt', 'waste', 'transfer_in', 'transfer_out'));
alter table public.restaurant_packaged_item_movements
  add constraint restaurant_packaged_item_movements_source_check
  check (
    (movement_type in ('adjustment', 'waste') and order_id is null and purchase_order_id is null and transfer_id is null)
    or (movement_type = 'sale' and order_id is not null and purchase_order_id is null and transfer_id is null)
    or (movement_type = 'purchase_receipt' and order_id is null and purchase_order_id is not null and transfer_id is null)
    or (movement_type in ('transfer_in', 'transfer_out') and order_id is null and purchase_order_id is null and transfer_id is not null)
  );
alter table public.restaurant_packaged_item_movements
  add constraint restaurant_packaged_item_movements_transfer_fk
  foreign key (org_id, transfer_id)
  references public.restaurant_packaged_stock_transfers(org_id, id) on delete restrict;

alter table public.restaurant_packaged_stock_transfers enable row level security;
drop policy if exists "Restaurant packaged transfers: members read assigned locations" on public.restaurant_packaged_stock_transfers;
create policy "Restaurant packaged transfers: members read assigned locations"
  on public.restaurant_packaged_stock_transfers for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, source_location_id)
    and public.can_access_org_location(org_id, destination_location_id)
  );

create or replace function public.transfer_restaurant_packaged_stock(
  p_org_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_menu_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_created_by uuid
)
returns public.restaurant_packaged_stock_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  source_quantity numeric(14,3);
  destination_quantity numeric(14,3);
  source_next numeric(14,3);
  destination_next numeric(14,3);
  transfer_row public.restaurant_packaged_stock_transfers;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can transfer Restaurant packaged stock.';
  end if;
  if p_source_location_id = p_destination_location_id then
    raise exception 'Choose two different Restaurant branches.';
  end if;
  if p_quantity is null or p_quantity <= 0
    or abs(p_quantity * 1000 - round(p_quantity * 1000)) > 0.000001 then
    raise exception 'Transfer quantity must be positive with no more than three decimal places.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'Enter a transfer reason of no more than 200 characters.';
  end if;
  if not exists (
    select 1 from public.restaurant_menu_items
    where org_id = p_org_id and id = p_menu_item_id and item_type = 'packaged'
  ) then
    raise exception 'Packaged restaurant item not found.';
  end if;
  if not exists (
    select 1 from public.business_locations
    where org_id = p_org_id and id in (p_source_location_id, p_destination_location_id)
    group by org_id having count(*) = 2 and bool_and(is_active)
  ) then
    raise exception 'Both Restaurant branches must be active in this organization.';
  end if;

  insert into public.restaurant_packaged_item_stock (org_id, location_id, menu_item_id, quantity)
    values
      (p_org_id, p_source_location_id, p_menu_item_id, 0),
      (p_org_id, p_destination_location_id, p_menu_item_id, 0)
    on conflict (org_id, location_id, menu_item_id) do nothing;
  perform 1 from public.restaurant_packaged_item_stock
    where org_id = p_org_id and menu_item_id = p_menu_item_id
      and location_id in (p_source_location_id, p_destination_location_id)
    order by location_id for update;
  select quantity into source_quantity from public.restaurant_packaged_item_stock
    where org_id = p_org_id and location_id = p_source_location_id and menu_item_id = p_menu_item_id;
  select quantity into destination_quantity from public.restaurant_packaged_item_stock
    where org_id = p_org_id and location_id = p_destination_location_id and menu_item_id = p_menu_item_id;
  if source_quantity < p_quantity then
    raise exception 'Insufficient stock to transfer: % available, % requested.', source_quantity, p_quantity;
  end if;
  source_next := source_quantity - p_quantity;
  destination_next := destination_quantity + p_quantity;

  insert into public.restaurant_packaged_stock_transfers (
    org_id, source_location_id, destination_location_id, menu_item_id,
    quantity, reason, created_by
  ) values (
    p_org_id, p_source_location_id, p_destination_location_id, p_menu_item_id,
    p_quantity, btrim(p_reason), p_created_by
  ) returning * into transfer_row;

  update public.restaurant_packaged_item_stock set quantity = source_next, updated_at = now()
    where org_id = p_org_id and location_id = p_source_location_id and menu_item_id = p_menu_item_id;
  update public.restaurant_packaged_item_stock set quantity = destination_next, updated_at = now()
    where org_id = p_org_id and location_id = p_destination_location_id and menu_item_id = p_menu_item_id;
  insert into public.restaurant_packaged_item_movements (
    org_id, location_id, menu_item_id, transfer_id, movement_type,
    quantity_delta, balance_after, reason, created_by
  ) values
    (p_org_id, p_source_location_id, p_menu_item_id, transfer_row.id, 'transfer_out',
      -p_quantity, source_next, btrim(p_reason), p_created_by),
    (p_org_id, p_destination_location_id, p_menu_item_id, transfer_row.id, 'transfer_in',
      p_quantity, destination_next, btrim(p_reason), p_created_by);
  return transfer_row;
end;
$$;

revoke all on function public.transfer_restaurant_packaged_stock(uuid, uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.transfer_restaurant_packaged_stock(uuid, uuid, uuid, uuid, numeric, text, uuid) to service_role;

create or replace function public.record_restaurant_packaged_waste(
  p_org_id uuid,
  p_location_id uuid,
  p_menu_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_created_by uuid
)
returns public.restaurant_packaged_item_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity numeric(14,3);
  stock_row public.restaurant_packaged_item_stock;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record Restaurant packaged waste.';
  end if;
  if p_quantity is null or p_quantity <= 0
    or abs(p_quantity * 1000 - round(p_quantity * 1000)) > 0.000001 then
    raise exception 'Waste quantity must be positive with no more than three decimal places.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'Enter a waste reason of no more than 200 characters.';
  end if;
  if not exists (
    select 1 from public.restaurant_menu_items
    where org_id = p_org_id and id = p_menu_item_id and item_type = 'packaged'
  ) then
    raise exception 'Packaged restaurant item not found.';
  end if;
  if not exists (
    select 1 from public.business_locations
    where org_id = p_org_id and id = p_location_id and is_active
  ) then
    raise exception 'Restaurant branch not found or inactive.';
  end if;
  insert into public.restaurant_packaged_item_stock (org_id, location_id, menu_item_id, quantity)
    values (p_org_id, p_location_id, p_menu_item_id, 0)
    on conflict (org_id, location_id, menu_item_id) do nothing;
  select quantity into current_quantity
    from public.restaurant_packaged_item_stock
    where org_id = p_org_id and location_id = p_location_id and menu_item_id = p_menu_item_id
    for update;
  if current_quantity < p_quantity then
    raise exception 'Cannot record waste above available stock (% available).', current_quantity;
  end if;
  update public.restaurant_packaged_item_stock
    set quantity = quantity - p_quantity, updated_at = now()
    where org_id = p_org_id and location_id = p_location_id and menu_item_id = p_menu_item_id
    returning * into stock_row;
  insert into public.restaurant_packaged_item_movements (
    org_id, location_id, menu_item_id, movement_type,
    quantity_delta, balance_after, reason, created_by
  ) values (
    p_org_id, p_location_id, p_menu_item_id, 'waste',
    -p_quantity, stock_row.quantity, btrim(p_reason), p_created_by
  );
  return stock_row;
end;
$$;

revoke all on function public.record_restaurant_packaged_waste(uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.record_restaurant_packaged_waste(uuid, uuid, uuid, numeric, text, uuid) to service_role;

commit;
