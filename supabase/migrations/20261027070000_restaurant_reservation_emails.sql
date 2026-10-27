begin;

alter table public.restaurant_reservations
  add column if not exists customer_email text;

alter table public.restaurant_reservations
  drop constraint if exists restaurant_reservations_customer_email_check,
  add constraint restaurant_reservations_customer_email_check
    check (
      customer_email is null
      or (
        length(customer_email) between 3 and 254
        and customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    );

drop function if exists public.create_restaurant_online_reservation(uuid, text, text, text, integer, timestamptz, text);

create or replace function public.create_restaurant_online_reservation(
  p_org_id uuid,
  p_branch_slug text,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text,
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
  normalized_email text := lower(btrim(coalesce(p_guest_email, '')));
  normalized_notes text := btrim(coalesce(p_notes, ''));
  reservation_duration constant integer := 90;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create public restaurant reservations.';
  end if;
  if length(normalized_name) not between 1 and 120
    or length(normalized_phone) not between 7 and 40
    or length(normalized_email) not between 3 and 254
    or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(normalized_notes) > 500 then
    raise exception 'Enter a valid guest name, phone number, email, and reservation note.';
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
        org_id, location_id, table_id, guest_name, guest_phone, customer_email, party_size,
        starts_at, ends_at, status, notes, created_by, reservation_source,
        customer_confirmation_token
      ) values (
        p_org_id, target_location.id, candidate_table.id, normalized_name, normalized_phone,
        normalized_email, p_party_size, p_starts_at,
        p_starts_at + make_interval(mins => reservation_duration),
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

revoke all on function public.create_restaurant_online_reservation(uuid, text, text, text, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_restaurant_online_reservation(uuid, text, text, text, text, integer, timestamptz, text) to service_role;

commit;
