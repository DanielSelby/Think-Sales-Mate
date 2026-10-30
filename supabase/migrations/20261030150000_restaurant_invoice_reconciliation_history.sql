begin;

create or replace function public.get_restaurant_invoice_reconciliation_history(
  p_org_id uuid,
  p_purchase_order_ids uuid[],
  p_per_order_limit integer default 10
)
returns table (
  id uuid,
  purchase_order_id uuid,
  invoice_reference text,
  due_date date,
  invoice_amount numeric,
  reconciliation_notes text,
  recorded_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can view Restaurant invoice reconciliation history.';
  end if;
  if p_org_id is null
    or coalesce(array_length(p_purchase_order_ids, 1), 0) > 100
    or p_per_order_limit is null
    or p_per_order_limit < 1
    or p_per_order_limit > 20 then
    raise exception 'Provide a valid organization, purchase order list, and history limit.';
  end if;

  return query
  with ranked_history as (
    select history.id,
      history.purchase_order_id,
      history.invoice_reference,
      history.due_date,
      history.invoice_amount,
      history.reconciliation_notes,
      history.recorded_by,
      history.created_at,
      row_number() over (
        partition by history.purchase_order_id
        order by history.created_at desc, history.id desc
      ) as entry_number
    from public.restaurant_ingredient_invoice_reconciliation_history history
    where history.org_id = p_org_id
      and history.purchase_order_id = any(coalesce(p_purchase_order_ids, '{}'::uuid[]))
  )
  select ranked_history.id,
    ranked_history.purchase_order_id,
    ranked_history.invoice_reference,
    ranked_history.due_date,
    ranked_history.invoice_amount,
    ranked_history.reconciliation_notes,
    ranked_history.recorded_by,
    ranked_history.created_at
  from ranked_history
  where ranked_history.entry_number <= p_per_order_limit
  order by ranked_history.created_at desc, ranked_history.id desc;
end;
$$;

revoke all on function public.get_restaurant_invoice_reconciliation_history(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.get_restaurant_invoice_reconciliation_history(uuid, uuid[], integer) to service_role;

commit;
