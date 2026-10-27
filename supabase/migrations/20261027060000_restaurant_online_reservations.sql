begin;

alter table public.restaurant_online_settings
  add column if not exists accepts_online_reservations boolean not null default false;

alter table public.restaurant_reservations
  alter column created_by drop not null,
  add column if not exists reservation_source text not null default 'staff',
  add column if not exists customer_confirmation_token uuid;

alter table public.restaurant_reservations
  drop constraint if exists restaurant_reservations_reservation_source_check,
  add constraint restaurant_reservations_reservation_source_check
    check (reservation_source in ('staff', 'online'));

create unique index if not exists restaurant_reservations_customer_confirmation_token_key
  on public.restaurant_reservations(customer_confirmation_token)
  where customer_confirmation_token is not null;

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
      and (settings.is_enabled or settings.accepts_online_reservations)
  ) then
    raise exception 'This restaurant is not accepting online orders or reservations.';
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

create or replace function public.create_restaurant_online_reservation(
  p_org_id uuid,
  p_branch_slug text,
  p_guest_name text,
  p_guest_phone text,
  p_party_size integer,
  p_starts_at timestamptz,
  p_notes text
)
returns table (reservation_id uuid, confirmation_token uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_location public.business_locations%rowtype;
  candidate_table record;
  created_reservation public.restaurant_reservations%rowtype;
  normalized_name text := btrim(coalesce(p_guest_name, ''));
  normalized_phone text := btrim(coalesce(p_guest_phone, ''));
  normalized_notes text := btrim(coalesce(p_notes, ''));
  reservation_duration constant integer := 90;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create public restaurant reservations.';
  end if;
  if length(normalized_name) not between 1 and 120
    or length(normalized_phone) not between 7 and 40
    or length(normalized_notes) > 500 then
    raise exception 'Enter a valid guest name, phone number, and reservation note.';
  end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 20 then
    raise exception 'Party size must be between 1 and 20.';
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '30 minutes'
    or p_starts_at > now() + interval '60 days' then
    raise exception 'Choose a reservation time at least 30 minutes from now and within the next 60 days.';
  end if;

  select location.* into target_location
  from public.business_locations location
  join public.restaurant_online_settings settings
    on settings.org_id = location.org_id and settings.location_id = location.id
  where location.org_id = p_org_id
    and location.customer_portal_slug = p_branch_slug
    and location.is_active
    and settings.accepts_online_reservations
  for share of location;
  if not found then
    raise exception 'This restaurant is not accepting online reservations.';
  end if;

  for candidate_table in
    select dining_table.id
    from public.restaurant_tables dining_table
    where dining_table.org_id = p_org_id
      and dining_table.location_id = target_location.id
      and dining_table.is_active
      and dining_table.seats >= p_party_size
    order by dining_table.seats, dining_table.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || candidate_table.id::text, 0));
    if not exists (
      select 1 from public.restaurant_reservations reservation
      where reservation.org_id = p_org_id
        and reservation.table_id = candidate_table.id
        and reservation.status in ('confirmed', 'seated')
        and reservation.starts_at < p_starts_at + make_interval(mins => reservation_duration)
        and reservation.ends_at > p_starts_at
    ) then
      insert into public.restaurant_reservations (
        org_id, location_id, table_id, guest_name, guest_phone, party_size,
        starts_at, ends_at, status, notes, created_by, reservation_source,
        customer_confirmation_token
      ) values (
        p_org_id, target_location.id, candidate_table.id, normalized_name, normalized_phone,
        p_party_size, p_starts_at, p_starts_at + make_interval(mins => reservation_duration),
        'confirmed', nullif(normalized_notes, ''), null, 'online', gen_random_uuid()
      )
      returning * into created_reservation;

      return query select created_reservation.id, created_reservation.customer_confirmation_token,
        created_reservation.starts_at, created_reservation.ends_at;
      return;
    end if;
  end loop;

  raise exception 'No suitable table is available at that time. Choose another time.';
end;
$$;

create or replace function public.get_restaurant_online_reservation_confirmation(p_token uuid)
returns table (
  guest_name text,
  party_size integer,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  branch_name text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select reservation.guest_name, reservation.party_size, reservation.starts_at,
    reservation.ends_at, reservation.status, location.name
  from public.restaurant_reservations reservation
  join public.business_locations location
    on location.org_id = reservation.org_id and location.id = reservation.location_id
  where reservation.customer_confirmation_token = p_token
    and reservation.reservation_source = 'online';
$$;

create or replace function public.cancel_restaurant_online_reservation(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cancelled boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can cancel public restaurant reservations.';
  end if;

  update public.restaurant_reservations
  set status = 'cancelled', updated_at = now()
  where customer_confirmation_token = p_token
    and reservation_source = 'online'
    and (
      status = 'cancelled'
      or (status = 'confirmed' and starts_at > now())
    );
  cancelled := found;
  return cancelled;
end;
$$;

revoke all on function public.create_restaurant_online_reservation(uuid, text, text, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.get_restaurant_online_reservation_confirmation(uuid) from public, anon, authenticated;
revoke all on function public.cancel_restaurant_online_reservation(uuid) from public, anon, authenticated;
grant execute on function public.create_restaurant_online_reservation(uuid, text, text, text, integer, timestamptz, text) to service_role;
grant execute on function public.get_restaurant_online_reservation_confirmation(uuid) to service_role;
grant execute on function public.cancel_restaurant_online_reservation(uuid) to service_role;

commit;
