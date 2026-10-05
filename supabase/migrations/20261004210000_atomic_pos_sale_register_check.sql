begin;

create or replace function public.create_pos_sale_header(
  p_org_id uuid,
  p_location_id uuid,
  p_register_session_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_reference text,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_shipping_amount numeric,
  p_total numeric,
  p_payment_method text,
  p_sale_date date
)
returns table (id uuid, sale_number integer)
language plpgsql
set search_path = public
as $$
declare
  v_session public.pos_register_sessions%rowtype;
begin
  if auth.uid() is null
    or not public.has_org_role(p_org_id, 'staff')
    or not public.can_access_org_location(p_org_id, p_location_id) then
    raise exception 'You are not authorized to create a sale at this branch.';
  end if;

  if p_subtotal < 0
    or p_discount_amount < 0
    or p_tax_amount < 0
    or p_shipping_amount < 0
    or p_total < 0 then
    raise exception 'Sale amounts cannot be negative.';
  end if;

  select *
  into v_session
  from public.pos_register_sessions
  where id = p_register_session_id
    and org_id = p_org_id
    and location_id = p_location_id
    and cashier_id = auth.uid()
    and status = 'open'
  for update;

  if not found then
    raise exception 'Your register is not open at the selected branch. Refresh POS and reopen the register if needed.';
  end if;

  return query
  insert into public.sales (
    org_id,
    customer_name,
    customer_id,
    location_id,
    reference,
    subtotal,
    discount_amount,
    tax_amount,
    shipping_amount,
    total,
    payment_method,
    amount_paid,
    sold_by,
    register_session_id,
    status,
    sale_date
  )
  values (
    p_org_id,
    p_customer_name,
    p_customer_id,
    p_location_id,
    p_reference,
    p_subtotal,
    p_discount_amount,
    p_tax_amount,
    p_shipping_amount,
    p_total,
    p_payment_method,
    p_total,
    auth.uid(),
    v_session.id,
    'completed',
    coalesce(p_sale_date, current_date)
  )
  returning sales.id, sales.sale_number;
end;
$$;

revoke all on function public.create_pos_sale_header(
  uuid, uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, date
) from public, anon;
grant execute on function public.create_pos_sale_header(
  uuid, uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, date
) to authenticated;

commit;
