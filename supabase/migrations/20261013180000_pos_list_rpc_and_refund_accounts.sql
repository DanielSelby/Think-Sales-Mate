begin;

drop function if exists public.list_pos_sales(uuid, date, date, uuid[], uuid, uuid, text, text, text, text, integer, integer);

create or replace function public.list_pos_sales(
  p_org_id uuid,
  p_from date,
  p_to date,
  p_location_ids uuid[],
  p_location_id uuid,
  p_cashier_id uuid,
  p_payment_method text,
  p_status text,
  p_payment_status text,
  p_search text,
  p_sort_by text,
  p_sort_direction text,
  p_page integer,
  p_page_size integer
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      s.id,
      s.sale_number,
      s.customer_name,
      s.customer_id,
      c.phone as customer_phone,
      s.sold_by as cashier_id,
      coalesce(profile.full_name, 'Unknown cashier') as cashier_name,
      s.location_id as branch_id,
      coalesce(location.name, 'Unassigned') as branch_name,
      s.created_at,
      s.sale_date,
      s.subtotal,
      s.discount_amount,
      s.tax_amount,
      s.total,
      coalesce(s.amount_paid, 0) as amount_paid,
      s.payment_method,
      s.status,
      coalesce(s.refunded_amount, 0) as refunded_amount,
      coalesce(item_totals.item_count, 0) as item_count,
      coalesce(item_totals.unit_count, 0) as unit_count
    from public.sales s
    left join public.customers c on c.id = s.customer_id and c.org_id = s.org_id
    left join public.profiles profile on profile.id = s.sold_by
    left join public.business_locations location on location.id = s.location_id and location.org_id = s.org_id
    left join lateral (
      select count(*)::bigint as item_count, coalesce(sum(si.quantity), 0)::numeric as unit_count
      from public.sale_items si
      where si.sale_id = s.id
    ) item_totals on true
    where s.org_id = p_org_id
      and s.register_session_id is not null
      and s.document_status = 'final'
      and (p_from is null or s.sale_date >= p_from)
      and (p_to is null or s.sale_date <= p_to)
      and (p_location_ids is null or s.location_id = any(p_location_ids))
      and (p_location_id is null or s.location_id = p_location_id)
      and (p_cashier_id is null or s.sold_by = p_cashier_id)
      and exists (
        select 1
        from public.organization_members member
        where member.org_id = p_org_id
          and member.user_id = auth.uid()
          and member.status = 'active'
          and (
            public.has_org_role(p_org_id, 'owner')
            or lower(coalesce(member.access_permissions ->> 'role_key', '')) in ('owner', 'super_admin')
            or member.branch_scope = 'all'
            or s.location_id = member.location_id
            or s.location_id = any(coalesce(member.secondary_location_ids, '{}'::uuid[]))
          )
          and (
            public.has_org_role(p_org_id, 'owner')
            or lower(coalesce(member.access_permissions ->> 'role_key', '')) in ('owner', 'super_admin')
            or coalesce(member.can_view_other_users_transactions, true)
            or s.sold_by = auth.uid()
          )
      )
      and (
        coalesce(p_search, '') = ''
        or s.sale_number::text ilike ('%' || p_search || '%')
        or s.id::text ilike ('%' || p_search || '%')
        or coalesce(s.customer_name, '') ilike ('%' || p_search || '%')
        or coalesce(c.phone, '') ilike ('%' || p_search || '%')
      )
      and (
        coalesce(p_payment_method, 'all') = 'all'
        or (p_payment_method = 'Multi Payment' and s.payment_method ~* '^(split|multi[\s_-]*payment)')
        or (p_payment_method <> 'Multi Payment' and s.payment_method = p_payment_method)
      )
      and (
        coalesce(p_status, 'all') = 'all'
        or (p_status = 'voided' and s.status::text = 'cancelled')
        or (p_status = 'pending' and s.status::text = 'completed' and coalesce(s.amount_paid, 0) < s.total)
        or s.status::text = p_status
      )
      and (
        coalesce(p_payment_status, 'all') = 'all'
        or (p_payment_status = 'paid' and coalesce(s.amount_paid, 0) >= s.total)
        or (p_payment_status = 'partial' and coalesce(s.amount_paid, 0) > 0 and coalesce(s.amount_paid, 0) < s.total)
        or (p_payment_status = 'unpaid' and coalesce(s.amount_paid, 0) <= 0)
      )
  ),
  totals as (
    select
      count(*)::bigint as total_transactions,
      coalesce(sum(case when sale_date = current_date and status <> 'cancelled' then greatest(total - refunded_amount, 0) else 0 end), 0) as today_sales,
      coalesce(sum(case when status <> 'cancelled' then greatest(total - refunded_amount, 0) else 0 end), 0) as total_sales_value,
      count(*) filter (where status = 'completed')::bigint as completed_transactions,
      count(*) filter (where status = 'completed' and amount_paid < total)::bigint as pending_transactions,
      count(*) filter (where status in ('cancelled', 'returned'))::bigint as voided_transactions
    from filtered
  ),
  page_rows as (
    select *
    from filtered
    order by
      case when p_sort_by = 'date' and p_sort_direction = 'asc' then created_at end asc,
      case when p_sort_by = 'date' and p_sort_direction <> 'asc' then created_at end desc,
      case when p_sort_by = 'total' and p_sort_direction = 'asc' then total end asc,
      case when p_sort_by = 'total' and p_sort_direction <> 'asc' then total end desc,
      created_at desc,
      id desc
    offset greatest(coalesce(p_page, 1) - 1, 0) * greatest(least(coalesce(p_page_size, 25), 100), 1)
    limit greatest(least(coalesce(p_page_size, 25), 100), 1)
  )
  select jsonb_build_object(
    'totalTransactions', totals.total_transactions,
    'todaySales', totals.today_sales,
    'totalSalesValue', totals.total_sales_value,
    'completedTransactions', totals.completed_transactions,
    'pendingTransactions', totals.pending_transactions,
    'voidedTransactions', totals.voided_transactions,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_rows.id,
        'saleNumber', page_rows.sale_number,
        'customerName', page_rows.customer_name,
        'customerPhone', page_rows.customer_phone,
        'customerId', page_rows.customer_id,
        'cashierId', page_rows.cashier_id,
        'cashierName', page_rows.cashier_name,
        'branchId', page_rows.branch_id,
        'branchName', page_rows.branch_name,
        'createdAt', page_rows.created_at,
        'saleDate', page_rows.sale_date,
        'subtotal', page_rows.subtotal,
        'discountAmount', page_rows.discount_amount,
        'taxAmount', page_rows.tax_amount,
        'total', page_rows.total,
        'amountPaid', page_rows.amount_paid,
        'paymentMethod', page_rows.payment_method,
        'status', page_rows.status,
        'refundedAmount', page_rows.refunded_amount,
        'itemCount', page_rows.item_count,
        'unitCount', page_rows.unit_count
      ) order by
        case when p_sort_by = 'date' and p_sort_direction = 'asc' then page_rows.created_at end asc,
        case when p_sort_by = 'date' and p_sort_direction <> 'asc' then page_rows.created_at end desc,
        case when p_sort_by = 'total' and p_sort_direction = 'asc' then page_rows.total end asc,
        case when p_sort_by = 'total' and p_sort_direction <> 'asc' then page_rows.total end desc,
        page_rows.created_at desc,
        page_rows.id desc)
      from page_rows
    ), '[]'::jsonb)
  )
  from totals;
$$;

revoke all on function public.list_pos_sales(uuid, date, date, uuid[], uuid, uuid, text, text, text, text, text, text, integer, integer) from public;
grant execute on function public.list_pos_sales(uuid, date, date, uuid[], uuid, uuid, text, text, text, text, text, text, integer, integer) to authenticated;

create or replace function public.record_pos_sale_refund_with_account(
  p_sale_id uuid,
  p_org_id uuid,
  p_actor_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_session_id uuid,
  p_location_id uuid,
  p_return_lines jsonb,
  p_note text,
  p_refund_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_session public.pos_register_sessions%rowtype;
  v_account public.bank_accounts%rowtype;
  v_transaction_id uuid;
  v_line jsonb;
  v_sale_item_quantity integer;
  v_already_returned integer;
  v_return_quantity integer;
  v_sale_item_id uuid;
  v_product_id uuid;
  v_account_type text;
begin
  if p_amount is null or p_amount < 0
    or (p_amount > 0 and p_payment_method is null)
    or (p_amount = 0 and (p_payment_method is not null or p_refund_account_id is not null))
    or (p_payment_method is not null and p_payment_method not in ('Cash', 'Card', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Other')) then
    raise exception 'Enter a valid refund amount and payment method.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and org_id = p_org_id
  for update;
  if not found then raise exception 'Sale not found.'; end if;
  if p_amount > greatest(least(v_sale.total, coalesce(v_sale.amount_paid, 0)) - coalesce(v_sale.refunded_amount, 0), 0) then
    raise exception 'Refund amount cannot exceed the unrefunded amount paid.';
  end if;
  if p_amount > v_sale.total then raise exception 'Refund amount cannot exceed the sale total.'; end if;
  if p_location_id is null then raise exception 'A branch is required to process a return.'; end if;
  if v_sale.location_id is not null and v_sale.location_id <> p_location_id then
    raise exception 'Return branch must match the sale branch.';
  end if;
  if not exists (
    select 1 from public.business_locations l
    where l.id = p_location_id and l.org_id = p_org_id
  ) then
    raise exception 'Return branch is not part of this organization.';
  end if;
  if jsonb_typeof(coalesce(p_return_lines, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_return_lines, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one item to return.';
  end if;

  if p_amount > 0 and p_payment_method = 'Cash' then
    if p_refund_account_id is not null then raise exception 'Cash refunds use the register, not a bank account.'; end if;
    select * into v_session
    from public.pos_register_sessions
    where id = p_session_id
      and org_id = p_org_id
      and location_id = p_location_id
      and cashier_id = p_actor_id
    for update;
    if not found or v_session.status <> 'open' then
      raise exception 'A cash refund requires your open register session at the sale branch.';
    end if;
  elsif p_amount > 0 then
    if p_refund_account_id is null then raise exception 'Select the account used to pay this refund.'; end if;
    select * into v_account
    from public.bank_accounts
    where id = p_refund_account_id and org_id = p_org_id
    for update;
    if not found then raise exception 'The selected refund account is unavailable in this organization.'; end if;
    v_account_type := v_account.account_type::text;
    if p_payment_method = 'Mobile Money' and v_account_type <> 'mobile_money' then
      raise exception 'Mobile Money refunds require a mobile-money account.';
    elsif p_payment_method = 'Card' and v_account_type not in ('card', 'checking', 'savings', 'other') then
      raise exception 'Card refunds require a card or bank account.';
    elsif p_payment_method in ('Bank Transfer', 'Cheque') and v_account_type not in ('card', 'checking', 'savings', 'other') then
      raise exception 'This refund method requires a bank account.';
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_return_lines)
  loop
    v_sale_item_id := (v_line->>'saleItemId')::uuid;
    v_product_id := (v_line->>'productId')::uuid;
    v_return_quantity := (v_line->>'quantity')::integer;
    if v_return_quantity <= 0 then raise exception 'Return quantities must be positive.'; end if;

    select si.quantity,
      coalesce((select sum(ri.quantity)::integer
        from public.sale_return_items ri
        where ri.sale_id = p_sale_id and ri.sale_item_id = si.id), 0)
    into v_sale_item_quantity, v_already_returned
    from public.sale_items si
    where si.id = v_sale_item_id
      and si.sale_id = p_sale_id
      and si.product_id = v_product_id;

    if not found or v_return_quantity > v_sale_item_quantity - v_already_returned then
      raise exception 'Return quantities exceed the remaining quantity for a sale line.';
    end if;

    insert into public.sale_return_items (
      org_id, sale_id, sale_item_id, product_id, quantity, location_id, created_by
    ) values (
      p_org_id, p_sale_id, v_sale_item_id, v_product_id, v_return_quantity, p_location_id, p_actor_id
    );

    perform public.adjust_product_stock_at_location(v_product_id, p_location_id, p_org_id, v_return_quantity);
  end loop;

  if p_amount > 0 and p_payment_method = 'Cash' then
    insert into public.pos_cash_movements (
      org_id, location_id, register_session_id, movement_type, amount, reason, reference, created_by
    ) values (
      p_org_id, p_location_id, v_session.id, 'cash_out', p_amount,
      coalesce(nullif(p_note, ''), 'Cash refund for sale ' || v_sale.sale_number::text),
      'SALE-' || v_sale.sale_number::text, p_actor_id
    ) returning id into v_transaction_id;
  elsif p_amount > 0 then
    insert into public.bank_transactions (
      org_id, account_id, type, amount, description, counterparty_name,
      transaction_category, transaction_date, recorded_by, location_id
    ) values (
      p_org_id, p_refund_account_id, 'withdrawal', p_amount,
      coalesce(nullif(p_note, ''), p_payment_method || ' refund for sale #' || v_sale.sale_number::text),
      coalesce(nullif(v_sale.customer_name, ''), 'Walk-in Customer'),
      'expense', current_date, p_actor_id, p_location_id
    ) returning id into v_transaction_id;
  end if;

  update public.sales
  set status = 'returned',
      refunded_amount = coalesce(v_sale.refunded_amount, 0) + p_amount,
      refund_payment_method = p_payment_method,
      refund_register_session_id = case when p_payment_method = 'Cash' and p_amount > 0 then p_session_id else null end,
      status_note = nullif(p_note, ''),
      status_changed_by = p_actor_id,
      status_changed_at = now()
  where id = p_sale_id and org_id = p_org_id;

  return v_transaction_id;
end;
$$;

revoke all on function public.record_pos_sale_refund_with_account(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.record_pos_sale_refund_with_account(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
