begin;

alter table public.business_locations
  add column if not exists customer_portal_enabled boolean not null default true,
  add column if not exists customer_portal_slug text,
  add column if not exists customer_portal_requires_approval boolean;

update public.business_locations
set customer_portal_slug =
  left(coalesce(
    nullif(trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
    'branch'
  ), 48) || '-' || left(id::text, 8)
where customer_portal_slug is null;

alter table public.business_locations
  alter column customer_portal_slug set not null;

create unique index if not exists business_locations_customer_portal_slug_key
  on public.business_locations (org_id, customer_portal_slug);

create or replace function public.set_business_location_customer_portal_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_portal_slug is null or btrim(new.customer_portal_slug) = '' then
    new.customer_portal_slug :=
      left(coalesce(
        nullif(trim(both '-' from lower(regexp_replace(new.name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
        'branch'
      ), 48) || '-' || left(new.id::text, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists business_locations_customer_portal_slug on public.business_locations;
create trigger business_locations_customer_portal_slug
  before insert or update of name, customer_portal_slug on public.business_locations
  for each row execute function public.set_business_location_customer_portal_slug();

create or replace function public.place_customer_portal_order_for_branch(
  p_org_id uuid,
  p_branch_slug text,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text,
  p_delivery_address text,
  p_delivery_option text,
  p_notes text,
  p_voice_note_url text,
  p_items jsonb
)
returns table(order_id uuid, order_number text, access_token uuid, branch_name text, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch public.business_locations%rowtype;
  v_settings public.customer_portal_settings%rowtype;
  v_order record;
  v_requires_approval boolean;
begin
  select * into v_branch
  from public.business_locations
  where org_id = p_org_id
    and customer_portal_slug = p_branch_slug
    and is_active = true
    and customer_portal_enabled = true
  for share;

  if not found then
    raise exception 'This branch storefront is unavailable.';
  end if;

  select * into v_settings
  from public.customer_portal_settings
  where org_id = p_org_id and is_enabled = true;
  if not found then
    raise exception 'Ordering is currently unavailable.';
  end if;

  perform stock.product_id
  from public.product_stock_levels stock
  join jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    on item.product_id = stock.product_id
  where stock.org_id = p_org_id and stock.location_id = v_branch.id
  for update of stock;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    left join public.product_stock_levels branch_stock
      on branch_stock.org_id = p_org_id
      and branch_stock.location_id = v_branch.id
      and branch_stock.product_id = item.product_id
    where branch_stock.product_id is null
       or branch_stock.quantity < item.quantity
  ) then
    raise exception 'One or more items are not available at this branch.';
  end if;

  select * into v_order
  from public.place_customer_portal_order(
    p_org_id,
    p_guest_name,
    p_guest_phone,
    p_guest_email,
    p_delivery_address,
    p_delivery_option,
    case when v_settings.allow_customer_location_selection then v_branch.id else null end,
    p_notes,
    p_voice_note_url,
    p_items
  );

  v_requires_approval := coalesce(
    v_branch.customer_portal_requires_approval,
    v_settings.require_approval_before_processing,
    true
  );

  update public.customer_orders
  set location_id = v_branch.id,
      status = case
        when v_requires_approval then 'new'::public.customer_order_status
        else 'processing'::public.customer_order_status
      end,
      approved_at = case when v_requires_approval then null else now() end,
      stock_reserved = case
        when v_requires_approval then false
        else coalesce(v_settings.auto_reserve_stock_on_approval, true)
      end
  where id = v_order.order_id;

  update public.customer_order_timeline
  set notes = 'Submitted through the ' || v_branch.name || ' branch storefront.'
  where order_id = v_order.order_id and title = 'Order Created';

  if not v_requires_approval then
    insert into public.customer_order_timeline (
      order_id, org_id, title, actor_name, status, notes
    )
    values (
      v_order.order_id,
      p_org_id,
      'Order Approved',
      'System',
      'completed',
      'Automatically routed to ' || v_branch.name || ' without manual approval.'
    );
  end if;

  return query select
    v_order.order_id,
    v_order.order_number,
    v_order.access_token,
    v_branch.name,
    v_order.total;
end;
$$;

revoke all on function public.place_customer_portal_order_for_branch(
  uuid, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.place_customer_portal_order_for_branch(
  uuid, text, text, text, text, text, text, text, text, jsonb
) to service_role;

commit;
