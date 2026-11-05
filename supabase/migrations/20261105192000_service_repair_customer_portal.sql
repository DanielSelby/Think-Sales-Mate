create table if not exists public.service_quotation_portal_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  quotation_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  responded_at timestamptz,
  decision text check (decision is null or decision in ('approved', 'rejected')),
  check (expires_at > created_at),
  check ((responded_at is null) = (decision is null)),
  unique (org_id, location_id, id),
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete cascade,
  foreign key (org_id, location_id, quotation_id)
    references public.service_quotations(org_id, location_id, id) on delete cascade
);

create unique index if not exists service_quotation_portal_one_link_per_quote_idx
  on public.service_quotation_portal_links (org_id, quotation_id)
  where revoked_at is null;

create index if not exists service_quotation_portal_expiry_idx
  on public.service_quotation_portal_links (expires_at)
  where revoked_at is null;

alter table public.service_quotation_portal_links enable row level security;
revoke all on public.service_quotation_portal_links from public, anon, authenticated;
grant all on public.service_quotation_portal_links to service_role;

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

create or replace function public.respond_to_service_repair_portal(
  p_token_hash text,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  portal_link public.service_quotation_portal_links%rowtype;
  quotation_row public.service_quotations%rowtype;
  job_row public.service_jobs%rowtype;
  decision_note_value text;
  history_note text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This repair link is invalid or has expired';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Choose whether to approve or decline the estimate';
  end if;
  if p_note is not null and length(trim(p_note)) > 500 then
    raise exception 'Your note cannot exceed 500 characters';
  end if;

  select * into portal_link
  from public.service_quotation_portal_links
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
  for update;
  if not found or portal_link.responded_at is not null then
    raise exception 'This repair link is invalid, expired, or has already been used';
  end if;

  select * into job_row
  from public.service_jobs
  where org_id = portal_link.org_id
    and location_id = portal_link.location_id
    and id = portal_link.job_id
  for update;
  if not found then
    raise exception 'The repair job is no longer available';
  end if;

  select * into quotation_row
  from public.service_quotations
  where org_id = portal_link.org_id
    and location_id = portal_link.location_id
    and job_id = portal_link.job_id
    and id = portal_link.quotation_id
  for update;
  if not found
     or quotation_row.status <> 'sent'
     or job_row.status <> 'awaiting_customer_approval' then
    raise exception 'This estimate is no longer awaiting your response';
  end if;

  decision_note_value := case
    when nullif(trim(p_note), '') is null then 'Customer responded through the secure repair portal.'
    else 'Customer responded through the secure repair portal: ' || trim(p_note)
  end;
  history_note := 'Quotation v' || quotation_row.version || ': ' || decision_note_value;

  update public.service_quotations
  set status = p_decision,
      decided_at = now(),
      decision_note = decision_note_value
  where org_id = quotation_row.org_id
    and location_id = quotation_row.location_id
    and id = quotation_row.id;

  insert into public.service_quotation_status_history (
    org_id, location_id, quotation_id, previous_status, new_status, note, actor_id
  ) values (
    quotation_row.org_id, quotation_row.location_id, quotation_row.id,
    quotation_row.status, p_decision, decision_note_value, null
  );

  update public.service_jobs
  set status = p_decision, updated_at = now()
  where org_id = job_row.org_id
    and location_id = job_row.location_id
    and id = job_row.id;

  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, note, actor_id
  ) values (
    job_row.org_id, job_row.location_id, job_row.id,
    job_row.status, p_decision, history_note, null
  );

  update public.service_quotation_portal_links
  set responded_at = now(), decision = p_decision
  where id = portal_link.id;
end;
$$;

revoke all on function public.get_service_repair_portal_view(text) from public, anon, authenticated;
revoke all on function public.respond_to_service_repair_portal(text, text, text) from public, anon, authenticated;
grant execute on function public.get_service_repair_portal_view(text) to service_role;
grant execute on function public.respond_to_service_repair_portal(text, text, text) to service_role;
