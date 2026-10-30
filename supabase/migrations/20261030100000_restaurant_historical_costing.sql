begin;

alter table public.restaurant_order_items
  add column if not exists cost_per_unit_snapshot numeric(14,4)
  check (cost_per_unit_snapshot is null or cost_per_unit_snapshot >= 0);

create or replace function public.snapshot_restaurant_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_location_id uuid;
  item_type text;
begin
  if new.menu_item_id is null then
    new.cost_per_unit_snapshot := null;
    return new;
  end if;

  select restaurant_order.location_id
  into order_location_id
  from public.restaurant_orders restaurant_order
  where restaurant_order.org_id = new.org_id and restaurant_order.id = new.order_id;
  if not found then
    raise exception 'Restaurant order not found while snapshotting item cost.';
  end if;

  select menu_item.item_type
  into item_type
  from public.restaurant_menu_items menu_item
  where menu_item.org_id = new.org_id and menu_item.id = new.menu_item_id;
  if not found then
    raise exception 'Restaurant menu item not found while snapshotting item cost.';
  end if;

  if item_type = 'packaged' then
    select coalesce(
      sum(purchase_line.quantity_received * purchase_line.unit_cost)
        / nullif(sum(purchase_line.quantity_received), 0),
      0
    )
    into new.cost_per_unit_snapshot
    from public.restaurant_packaged_purchase_items purchase_line
    join public.restaurant_packaged_purchase_orders purchase
      on purchase.org_id = purchase_line.org_id
      and purchase.id = purchase_line.purchase_order_id
    where purchase_line.org_id = new.org_id
      and purchase_line.menu_item_id = new.menu_item_id
      and purchase.location_id = order_location_id;
  else
    select coalesce(sum(recipe.quantity * ingredient.cost_per_unit), 0)
    into new.cost_per_unit_snapshot
    from public.restaurant_recipe_ingredients recipe
    join public.restaurant_ingredients ingredient
      on ingredient.org_id = recipe.org_id
      and ingredient.id = recipe.ingredient_id
    where recipe.org_id = new.org_id
      and recipe.menu_item_id = new.menu_item_id;
  end if;

  return new;
end;
$$;

drop trigger if exists restaurant_order_items_snapshot_cost on public.restaurant_order_items;
create trigger restaurant_order_items_snapshot_cost
  before insert on public.restaurant_order_items
  for each row execute function public.snapshot_restaurant_order_item_cost();

revoke all on function public.snapshot_restaurant_order_item_cost() from public, anon, authenticated;

create or replace function public.get_restaurant_item_margins(
  p_org_id uuid,
  p_location_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  menu_item_id uuid,
  item_name text,
  item_type text,
  quantity_sold numeric,
  sales numeric,
  estimated_unit_cost numeric,
  estimated_cost numeric,
  gross_profit numeric,
  margin_percent numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with menu_costs as (
    select menu_item.id as menu_item_id,
      menu_item.item_type,
      coalesce(sum(recipe.quantity * ingredient.cost_per_unit), 0)::numeric(14,4) as prepared_cost
    from public.restaurant_menu_items menu_item
    left join public.restaurant_recipe_ingredients recipe
      on recipe.org_id = menu_item.org_id and recipe.menu_item_id = menu_item.id
    left join public.restaurant_ingredients ingredient
      on ingredient.org_id = recipe.org_id and ingredient.id = recipe.ingredient_id
    where menu_item.org_id = p_org_id
    group by menu_item.id, menu_item.item_type
  ),
  packaged_costs as (
    select purchase.location_id, purchase_line.menu_item_id,
      (
        sum(purchase_line.quantity_received * purchase_line.unit_cost)
        / nullif(sum(purchase_line.quantity_received), 0)
      )::numeric(14,4) as unit_cost
    from public.restaurant_packaged_purchase_items purchase_line
    join public.restaurant_packaged_purchase_orders purchase
      on purchase.org_id = purchase_line.org_id
      and purchase.id = purchase_line.purchase_order_id
    where purchase_line.org_id = p_org_id
      and purchase.location_id = any(coalesce(p_location_ids, '{}'::uuid[]))
    group by purchase.location_id, purchase_line.menu_item_id
  ),
  item_cost_lines as (
    select order_item.menu_item_id,
      order_item.item_name,
      menu_cost.item_type,
      order_item.quantity,
      order_item.line_total,
      order_item.quantity * coalesce(
        order_item.cost_per_unit_snapshot,
        case when menu_cost.item_type = 'packaged'
          then packaged_cost.unit_cost
          else menu_cost.prepared_cost
        end,
        0
      ) as estimated_cost
    from public.restaurant_order_items order_item
    join public.restaurant_orders restaurant_order
      on restaurant_order.org_id = order_item.org_id
      and restaurant_order.id = order_item.order_id
    left join menu_costs menu_cost
      on menu_cost.menu_item_id = order_item.menu_item_id
    left join packaged_costs packaged_cost
      on packaged_cost.location_id = restaurant_order.location_id
      and packaged_cost.menu_item_id = order_item.menu_item_id
    where order_item.org_id = p_org_id
      and restaurant_order.location_id = any(coalesce(p_location_ids, '{}'::uuid[]))
      and restaurant_order.created_at >= p_start_at
      and restaurant_order.created_at < p_end_at
      and restaurant_order.status <> 'cancelled'
      and order_item.kitchen_status <> 'cancelled'
  ),
  item_sales as (
    select item_cost_lines.menu_item_id,
      item_cost_lines.item_name,
      item_cost_lines.item_type,
      sum(item_cost_lines.quantity)::numeric(14,3) as quantity_sold,
      sum(item_cost_lines.line_total)::numeric(14,2) as sales,
      sum(item_cost_lines.estimated_cost)::numeric(14,2) as estimated_cost
    from item_cost_lines
    group by item_cost_lines.menu_item_id, item_cost_lines.item_name, item_cost_lines.item_type
  )
  select sales.menu_item_id,
    sales.item_name,
    coalesce(sales.item_type, 'unknown'),
    sales.quantity_sold,
    sales.sales,
    case when sales.quantity_sold > 0
      then (sales.estimated_cost / sales.quantity_sold)::numeric(14,4)
      else 0::numeric
    end,
    sales.estimated_cost,
    (sales.sales - sales.estimated_cost)::numeric(14,2),
    case when sales.sales > 0
      then ((sales.sales - sales.estimated_cost) / sales.sales * 100)::numeric(8,2)
      else 0::numeric
    end
  from item_sales sales
  order by (sales.sales - sales.estimated_cost) desc, sales.sales desc;
$$;

revoke all on function public.get_restaurant_item_margins(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_restaurant_item_margins(uuid, uuid[], timestamptz, timestamptz) to service_role;

commit;
