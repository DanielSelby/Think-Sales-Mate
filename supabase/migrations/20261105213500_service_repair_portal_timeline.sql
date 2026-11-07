create or replace function public.get_service_repair_portal_view(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  portal_link public.service_quotation_portal_links%rowtype;
  quotation_row public.service_quotations%rowtype;
  job_row public.service_jobs%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into portal_link
  from public.service_quotation_portal_links
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now();
  if not found then
    return null;
  end if;

  select * into quotation_row
  from public.service_quotations
  where org_id = portal_link.org_id
    and location_id = portal_link.location_id
    and job_id = portal_link.job_id
    and id = portal_link.quotation_id
    and status in ('sent', 'approved', 'rejected');
  if not found then
    return null;
  end if;

  select * into job_row
  from public.service_jobs
  where org_id = portal_link.org_id
    and location_id = portal_link.location_id
    and id = portal_link.job_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'jobNumber', job_row.job_number,
    'jobStatus', job_row.status,
    'statusHistory', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', history.new_status,
          'occurredAt', history.created_at
        )
        order by history.created_at, history.id
      )
      from (
        select id, new_status, created_at
        from public.service_job_status_history
        where org_id = portal_link.org_id
          and location_id = portal_link.location_id
          and job_id = portal_link.job_id
        order by created_at desc, id desc
        limit 50
      ) history
    ), '[]'::jsonb),
    'reportedProblem', job_row.reported_problem,
    'currency', (
      select organization.currency
      from public.organizations organization
      where organization.id = job_row.org_id
    ),
    'equipment', (
      select jsonb_build_object(
        'type', asset.asset_type,
        'brand', asset.brand,
        'model', asset.model
      )
      from public.service_assets asset
      where asset.org_id = job_row.org_id
        and asset.location_id = job_row.location_id
        and asset.customer_id = job_row.customer_id
        and asset.id = job_row.asset_id
    ),
    'quotation', jsonb_build_object(
      'version', quotation_row.version,
      'status', quotation_row.status,
      'notes', quotation_row.notes,
      'subtotal', quotation_row.subtotal,
      'taxRate', quotation_row.tax_rate,
      'taxAmount', quotation_row.tax_amount,
      'total', quotation_row.total,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'description', item.description,
          'quantity', item.quantity,
          'unitPrice', item.unit_price,
          'lineTotal', item.line_total
        ) order by item.created_at, item.id)
        from public.service_quotation_items item
        where item.org_id = quotation_row.org_id
          and item.location_id = quotation_row.location_id
          and item.quotation_id = quotation_row.id
      ), '[]'::jsonb)
    ),
    'expiresAt', portal_link.expires_at,
    'canRespond', portal_link.responded_at is null
      and quotation_row.status = 'sent'
      and job_row.status = 'awaiting_customer_approval'
  );
end;
$$;
