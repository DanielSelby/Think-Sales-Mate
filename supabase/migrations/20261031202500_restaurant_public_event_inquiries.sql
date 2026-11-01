begin;

alter table public.restaurant_online_settings
  add column accepts_online_event_inquiries boolean not null default false;

alter table public.restaurant_catering_events
  alter column created_by drop not null,
  add column inquiry_source text not null default 'staff',
  add column estimated_budget numeric(14, 2),
  add constraint restaurant_catering_events_inquiry_source_check
    check (inquiry_source in ('staff', 'customer_portal')),
  add constraint restaurant_catering_events_estimated_budget_check
    check (estimated_budget is null or estimated_budget >= 0);

create or replace function public.consume_restaurant_online_order_rate_limit(
  p_location_id uuid,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  current_request_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can consume public restaurant rate limits.';
  end if;
  if p_location_id is null or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid restaurant rate-limit key is required.';
  end if;
  if not exists (
    select 1
    from public.business_locations location
    join public.restaurant_online_settings settings
      on settings.org_id = location.org_id and settings.location_id = location.id
    where location.id = p_location_id and location.is_active
      and (settings.is_enabled or settings.accepts_online_reservations
        or settings.accepts_online_event_inquiries)
  ) then
    raise exception 'This restaurant is not accepting online orders, reservations, or event inquiries.';
  end if;

  insert into public.restaurant_online_order_rate_limits (
    location_id, ip_hash, window_started_at, request_count
  ) values (p_location_id, p_ip_hash, current_window, 1)
  on conflict (location_id, ip_hash, window_started_at)
  do update set request_count = restaurant_online_order_rate_limits.request_count + 1
  returning restaurant_online_order_rate_limits.request_count into current_request_count;

  delete from public.restaurant_online_order_rate_limits
  where location_id = p_location_id
    and ip_hash = p_ip_hash
    and window_started_at < current_window - interval '24 hours';

  return current_request_count <= 10;
end;
$$;

commit;
