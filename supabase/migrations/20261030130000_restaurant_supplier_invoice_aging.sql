begin;

create or replace function public.get_restaurant_supplier_invoice_aging(
  p_org_id uuid,
  p_location_ids uuid[]
)
returns table (
  purchase_order_id uuid,
  location_id uuid,
  location_name text,
  supplier_name text,
  reference text,
  invoice_reference text,
  due_date date,
  invoice_date date,
  invoiced_total numeric,
  paid_total numeric,
  outstanding numeric,
  overdue_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    purchase_order.id,
    purchase_order.location_id,
    location.name,
    supplier.name,
    purchase_order.reference,
    purchase_order.invoice_reference,
    purchase_order.due_date,
    purchase_order.created_at::date,
    receipts.invoiced_total,
    payments.paid_total,
    receipts.invoiced_total - payments.paid_total,
    case
      when purchase_order.due_date is null or purchase_order.due_date >= current_date then 0
      else current_date - purchase_order.due_date
    end
  from public.restaurant_ingredient_purchase_orders purchase_order
  join public.business_locations location
    on location.org_id = purchase_order.org_id
    and location.id = purchase_order.location_id
  join public.suppliers supplier
    on supplier.org_id = purchase_order.org_id
    and supplier.id = purchase_order.supplier_id
  cross join lateral (
    select coalesce(sum(receipt.amount), 0)::numeric(14,2) as invoiced_total
    from public.restaurant_ingredient_receipts receipt
    where receipt.org_id = purchase_order.org_id
      and receipt.purchase_order_id = purchase_order.id
      and receipt.accounting_status = 'posted'
  ) receipts
  cross join lateral (
    select coalesce(sum(payment.amount), 0)::numeric(14,2) as paid_total
    from public.restaurant_ingredient_payments payment
    where payment.org_id = purchase_order.org_id
      and payment.purchase_order_id = purchase_order.id
  ) payments
  where coalesce(auth.role(), '') = 'service_role'
    and purchase_order.org_id = p_org_id
    and purchase_order.location_id = any(coalesce(p_location_ids, '{}'::uuid[]))
    and receipts.invoiced_total > payments.paid_total
  order by
    (purchase_order.due_date is null),
    purchase_order.due_date,
    purchase_order.created_at;
$$;

revoke all on function public.get_restaurant_supplier_invoice_aging(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.get_restaurant_supplier_invoice_aging(uuid, uuid[]) to service_role;

commit;
