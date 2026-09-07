-- ============================================================================
-- ThinkSales Pro — Product Location Management & Product Merge Migration
-- Adds soft-delete merge tracking to public.products, plus an atomic
-- PL/pgSQL merge_products procedure with complete transactional safety,
-- historical record transfer, stock pooling, and audit logging.
-- ============================================================================

begin;

-- 1. Extend products with merge columns -------------------------------------
alter table public.products
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive', 'merged')),
  add column if not exists merged_into_product_id uuid references public.products(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id);

create index if not exists idx_products_merged_into on public.products(merged_into_product_id);
create index if not exists idx_products_org_status on public.products(org_id, status);

-- 2. Atomic Product Merge Procedure -----------------------------------------
create or replace function public.merge_products(
  p_org_id uuid,
  p_master_id uuid,
  p_secondary_ids uuid[],
  p_actor_id uuid,
  p_pricing_strategy text default 'keep_master',
  p_custom_price numeric default null,
  p_custom_cost numeric default null,
  p_details_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_master record;
  v_sec record;
  v_total_stock integer := 0;
  v_transferred_records integer := 0;
  v_sale_items_count integer := 0;
  v_purchase_items_count integer := 0;
  v_transfer_items_count integer := 0;
  v_adjustment_items_count integer := 0;
  v_sale_returns_count integer := 0;
  v_purchase_returns_count integer := 0;
  v_stock_requests_count integer := 0;
  v_customer_orders_count integer := 0;
  v_target_price numeric;
  v_target_cost numeric;
  v_images text[] := '{}';
  v_stock_record record;
  v_secondary_count integer;
  v_target_description text;
  v_target_barcode text;
begin
  -- Validate manager role
  if not public.has_org_role(p_org_id, 'manager') then
    raise exception 'Unauthorized: manager role required to merge products';
  end if;

  -- Validate master product belongs to org
  select * into v_master
  from public.products
  where id = p_master_id and org_id = p_org_id
  for update;

  if v_master.id is null then
    raise exception 'Master product not found or does not belong to organization';
  end if;

  if v_master.status = 'merged' then
    raise exception 'Cannot merge into a product that has already been merged';
  end if;

  -- Validate at least one secondary product
  if array_length(p_secondary_ids, 1) is null or array_length(p_secondary_ids, 1) = 0 then
    raise exception 'At least one secondary product must be selected to merge';
  end if;

  -- Ensure master is not in secondary list
  if p_master_id = any(p_secondary_ids) then
    raise exception 'Master product cannot be merged into itself';
  end if;

  -- Reject duplicate IDs and ensure every requested product was found.  A
  -- FOR loop over the matching rows alone would otherwise silently accept
  -- missing IDs and report a successful partial merge.
  select count(distinct id) into v_secondary_count
  from public.products
  where id = any(p_secondary_ids) and org_id = p_org_id;
  if v_secondary_count <> array_length(p_secondary_ids, 1)
     or v_secondary_count <> (select count(distinct x) from unnest(p_secondary_ids) as t(x)) then
    raise exception 'One or more secondary products were not found or were duplicated';
  end if;

  -- Validate all secondary products exist in org and have not already been
  -- consumed by another merge.
  for v_sec in
    select id, name, sku, unit_price, cost_price, image_urls, status
    from public.products
    where id = any(p_secondary_ids) and org_id = p_org_id
    for update
  loop
    if v_sec.id is null then
      raise exception 'Secondary product not found';
    end if;
    if v_sec.status = 'merged' then
      raise exception 'Cannot merge a product that has already been merged';
    end if;
  end loop;

  -- 1. Determine Pricing
  if p_pricing_strategy = 'keep_master' then
    v_target_price := v_master.unit_price;
    v_target_cost := v_master.cost_price;
  elsif p_pricing_strategy = 'keep_latest' then
    select unit_price, cost_price into v_target_price, v_target_cost
    from public.products
    where id = p_master_id or id = any(p_secondary_ids)
    order by created_at desc
    limit 1;
  elsif p_pricing_strategy = 'highest' then
    select max(unit_price), max(cost_price)
    into v_target_price, v_target_cost
    from public.products
    where id = p_master_id or id = any(p_secondary_ids);
  elsif p_pricing_strategy = 'lowest' then
    select min(unit_price), min(cost_price)
    into v_target_price, v_target_cost
    from public.products
    where id = p_master_id or id = any(p_secondary_ids);
  elsif p_pricing_strategy = 'average' then
    select round(avg(unit_price), 2), round(avg(cost_price), 2)
    into v_target_price, v_target_cost
    from public.products
    where id = p_master_id or id = any(p_secondary_ids);
  elsif p_pricing_strategy = 'custom' then
    if p_custom_price is null then
      raise exception 'Custom pricing requires a price';
    end if;
    v_target_price := p_custom_price;
    v_target_cost := coalesce(p_custom_cost, v_master.cost_price);
  else
    raise exception 'Unsupported pricing strategy: %', p_pricing_strategy;
  end if;

  -- 2. Image consolidation if requested
  if coalesce((p_details_options->>'merge_images')::boolean,
              (p_details_options->>'mergeImages')::boolean, true) then
    select array_agg(distinct img) into v_images
    from (
      select unnest(v_master.image_urls) as img
      union
      select unnest(image_urls) as img
      from public.products
      where id = any(p_secondary_ids)
    ) s
    where img is not null and img <> '';
  else
    v_images := v_master.image_urls;
  end if;

  v_target_description := v_master.description;
  v_target_barcode := v_master.barcode;
  if coalesce(p_details_options->>'keep_description', p_details_options->>'keepDescription') = 'latest'
     or coalesce(p_details_options->>'keep_barcode', p_details_options->>'keepBarcode') = 'latest' then
    select description, barcode into v_target_description, v_target_barcode
    from public.products
    where id = p_master_id or id = any(p_secondary_ids)
    order by created_at desc
    limit 1;
  end if;

  -- 3. Consolidate Location Stock Levels (product_stock_levels)
  for v_stock_record in
    select location_id, sum(quantity) as total_qty
    from public.product_stock_levels
    where org_id = p_org_id and product_id = any(p_secondary_ids)
    group by location_id
  loop
    insert into public.product_stock_levels (org_id, product_id, location_id, quantity, updated_at)
    values (p_org_id, p_master_id, v_stock_record.location_id, v_stock_record.total_qty, now())
    on conflict (product_id, location_id)
    do update set
      quantity = product_stock_levels.quantity + excluded.quantity,
      updated_at = now();
  end loop;

  -- Set secondary stock quantities to 0 in product_stock_levels
  update public.product_stock_levels
  set quantity = 0, updated_at = now()
  where org_id = p_org_id and product_id = any(p_secondary_ids);

  -- Recalculate Master total stock
  select coalesce(sum(quantity), 0) into v_total_stock
  from public.product_stock_levels
  where org_id = p_org_id and product_id = p_master_id;

  -- 4. Transfer Transactions across all tables
  -- Sale Items
  update public.sale_items
  set product_id = p_master_id
  where org_id = p_org_id and product_id = any(p_secondary_ids);
  get diagnostics v_sale_items_count = row_count;

  -- Sale Return Items
  update public.sale_return_items
  set product_id = p_master_id
  where org_id = p_org_id and product_id = any(p_secondary_ids);
  get diagnostics v_sale_returns_count = row_count;

  -- Purchase Items
  update public.purchase_items
  set product_id = p_master_id
  where org_id = p_org_id and product_id = any(p_secondary_ids);
  get diagnostics v_purchase_items_count = row_count;

  -- Purchase Return Items
  update public.purchase_return_items
  set product_id = p_master_id
  where org_id = p_org_id and product_id = any(p_secondary_ids);
  get diagnostics v_purchase_returns_count = row_count;

  -- Stock Transfer Items
  update public.stock_transfer_items
  set product_id = p_master_id
  where org_id = p_org_id and product_id = any(p_secondary_ids);
  get diagnostics v_transfer_items_count = row_count;

  -- Stock Adjustment Items
  update public.stock_adjustment_items
  set product_id = p_master_id
  where org_id = p_org_id and product_id = any(p_secondary_ids);
  get diagnostics v_adjustment_items_count = row_count;

  -- Stock Request Items (if table exists)
  begin
    update public.stock_request_items
    set product_id = p_master_id
    where org_id = p_org_id and product_id = any(p_secondary_ids);
    get diagnostics v_stock_requests_count = row_count;
  exception when undefined_table then
    v_stock_requests_count := 0;
  end;

  -- Customer Order Items (if table exists)
  begin
    update public.customer_order_items
    set product_id = p_master_id
    where org_id = p_org_id and product_id = any(p_secondary_ids);
    get diagnostics v_customer_orders_count = row_count;
  exception when undefined_table then
    v_customer_orders_count := 0;
  end;

  v_transferred_records := v_sale_items_count + v_purchase_items_count +
                           v_transfer_items_count + v_adjustment_items_count +
                           v_sale_returns_count + v_purchase_returns_count +
                           v_stock_requests_count + v_customer_orders_count;

  -- 5. Update Master Product
  update public.products
  set
    unit_price = coalesce(v_target_price, unit_price),
    cost_price = coalesce(v_target_cost, cost_price),
    stock_quantity = v_total_stock,
    image_urls = coalesce(v_images, image_urls),
    description = case when coalesce(p_details_options->>'keep_description', p_details_options->>'keepDescription') = 'latest'
                       then v_target_description else description end,
    barcode = case when coalesce(p_details_options->>'keep_barcode', p_details_options->>'keepBarcode') = 'latest'
                  then v_target_barcode else barcode end,
    updated_at = now()
  where id = p_master_id;

  -- 6. Soft-delete Secondary Products
  update public.products
  set
    status = 'merged',
    is_active = false,
    merged_into_product_id = p_master_id,
    merged_at = now(),
    merged_by = p_actor_id,
    stock_quantity = 0,
    updated_at = now()
  where id = any(p_secondary_ids) and org_id = p_org_id;

  -- 7. Audit Log Entry
  insert into public.audit_logs (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    p_org_id,
    p_actor_id,
    'product.merge',
    'products',
    p_master_id,
    jsonb_build_object(
      'master_product_id', p_master_id,
      'master_product_name', v_master.name,
      'master_sku', v_master.sku,
      'secondary_product_ids', p_secondary_ids,
      'merged_count', array_length(p_secondary_ids, 1),
      'consolidated_stock', v_total_stock,
      'records_transferred', v_transferred_records,
      'pricing_strategy', p_pricing_strategy,
      'final_price', v_target_price,
      'details_breakdown', jsonb_build_object(
        'sale_items', v_sale_items_count,
        'purchase_items', v_purchase_items_count,
        'transfer_items', v_transfer_items_count,
        'adjustment_items', v_adjustment_items_count,
        'sale_returns', v_sale_returns_count,
        'purchase_returns', v_purchase_returns_count,
        'stock_requests', v_stock_requests_count,
        'customer_orders', v_customer_orders_count
      )
    ),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'master_product_id', p_master_id,
    'merged_count', array_length(p_secondary_ids, 1),
    'consolidated_stock', v_total_stock,
    'records_transferred', v_transferred_records
  );
end;
$$;

commit;
