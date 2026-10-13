create index if not exists sales_pos_list_filter_idx
  on public.sales (org_id, sale_date desc, created_at desc)
  where register_session_id is not null and document_status = 'final';

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
