create table if not exists public.organization_product_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_slug text not null check (product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  requested_at timestamptz not null default now(),
  request_status text not null default 'pending' check (request_status in ('pending', 'approved', 'declined')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  primary key (organization_id, product_slug)
);

alter table public.organization_product_requests enable row level security;
revoke all on table public.organization_product_requests from public, anon, authenticated;
grant all on public.organization_product_requests to service_role;

drop function if exists public.create_organization_registration(uuid, text, text, text);

create or replace function public.create_organization_registration(
  p_user_id uuid,
  p_name text,
  p_slug text,
  p_ip_hash text default null,
  p_product_slugs text[] default '{}'
)
returns table (organization_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_organization_id uuid;
  new_organization_id uuid;
  recent_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create organization registrations.';
  end if;
  if p_user_id is null or p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
    raise exception 'Enter an organization name between 1 and 120 characters.';
  end if;
  if coalesce(cardinality(p_product_slugs), 0) < 1 or cardinality(p_product_slugs) > 10 then
    raise exception 'Select between 1 and 10 products.';
  end if;
  if (
    select count(distinct requested.product_slug)
    from unnest(p_product_slugs) as requested(product_slug)
  ) <> cardinality(p_product_slugs) then
    raise exception 'Product selections must not contain duplicates.';
  end if;
  if exists (
    select 1
    from unnest(p_product_slugs) as requested(product_slug)
    where requested.product_slug is null
      or requested.product_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ) then
    raise exception 'Product selections contain an invalid product.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 1));
  end if;

  select id into existing_organization_id
  from public.organizations
  where created_by = p_user_id
    and registration_status = 'pending'
  order by created_at desc
  limit 1;

  if existing_organization_id is not null then
    return query select existing_organization_id, false;
    return;
  end if;

  select count(*)::integer into recent_attempts
  from public.organization_registration_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if recent_attempts >= 3 then
    raise exception 'You have reached the workspace registration limit. Please try again later.';
  end if;

  if p_ip_hash is not null and (
    select count(*) from public.organization_registration_attempts
    where ip_hash = p_ip_hash
      and created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Too many workspace registrations were submitted from this network. Please try again later.';
  end if;

  insert into public.organizations (name, slug, created_by, registration_status)
  values (btrim(p_name), p_slug, p_user_id, 'pending')
  returning id into new_organization_id;

  insert into public.organization_product_requests (organization_id, product_slug)
  select new_organization_id, requested.product_slug
  from unnest(p_product_slugs) as requested(product_slug);

  insert into public.organization_members (org_id, user_id, role, status)
  values (new_organization_id, p_user_id, 'owner', 'invited');

  insert into public.organization_registration_attempts (user_id, ip_hash)
  values (p_user_id, p_ip_hash);

  return query select new_organization_id, true;
end;
$$;

revoke all on function public.create_organization_registration(uuid, text, text, text, text[]) from public;
grant execute on function public.create_organization_registration(uuid, text, text, text, text[]) to service_role;

create or replace function public.review_organization_registration_products(
  p_organization_id uuid,
  p_registration_status text,
  p_reviewed_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can review organization registrations.';
  end if;
  if p_organization_id is null
    or p_registration_status not in ('approved', 'rejected')
    or p_reviewed_by is null then
    raise exception 'A valid organization, registration decision, and reviewer are required.';
  end if;

  update public.organizations
  set registration_status = p_registration_status
  where id = p_organization_id
    and registration_status = 'pending';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    return false;
  end if;

  update public.organization_product_requests
  set
    request_status = p_registration_status,
    reviewed_at = now(),
    reviewed_by = p_reviewed_by
  where organization_id = p_organization_id
    and request_status = 'pending';

  return true;
end;
$$;

revoke all on function public.review_organization_registration_products(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.review_organization_registration_products(uuid, text, uuid) to service_role;

create or replace function public.request_organization_product(
  p_organization_id uuid,
  p_product_slug text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_status text;
  resulting_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can submit organization product requests.';
  end if;
  if p_organization_id is null
    or p_product_slug is null
    or p_product_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'A valid organization and product are required.';
  end if;

  select registration_status into organization_status
  from public.organizations
  where id = p_organization_id
  for update;

  if organization_status is distinct from 'approved' then
    raise exception 'Product requests can only be submitted by approved organizations.';
  end if;

  insert into public.organization_product_requests as existing_request (
    organization_id,
    product_slug
  )
  values (p_organization_id, p_product_slug)
  on conflict (organization_id, product_slug) do update
  set
    requested_at = now(),
    request_status = 'pending',
    reviewed_at = null,
    reviewed_by = null
  where existing_request.request_status = 'declined'
  returning request_status into resulting_status;

  if resulting_status is not null then
    return resulting_status;
  end if;

  select request_status into resulting_status
  from public.organization_product_requests
  where organization_id = p_organization_id
    and product_slug = p_product_slug;

  return resulting_status;
end;
$$;

revoke all on function public.request_organization_product(uuid, text) from public, anon, authenticated;
grant execute on function public.request_organization_product(uuid, text) to service_role;
