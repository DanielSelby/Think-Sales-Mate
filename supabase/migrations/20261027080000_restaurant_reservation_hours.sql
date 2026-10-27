begin;

alter table public.restaurant_online_settings
  add column if not exists reservation_timezone text not null default 'UTC',
  add column if not exists reservation_hours jsonb not null default
    '[{"open":"09:00","close":"21:00"},{"open":"09:00","close":"21:00"},{"open":"09:00","close":"21:00"},{"open":"09:00","close":"21:00"},{"open":"09:00","close":"21:00"},{"open":"09:00","close":"21:00"},{"open":"09:00","close":"21:00"}]'::jsonb,
  add column if not exists reservation_duration_minutes integer not null default 90,
  add column if not exists reservation_slot_interval_minutes integer not null default 30;

alter table public.restaurant_online_settings
  drop constraint if exists restaurant_online_settings_reservation_duration_check,
  add constraint restaurant_online_settings_reservation_duration_check
    check (reservation_duration_minutes between 30 and 240),
  drop constraint if exists restaurant_online_settings_reservation_slot_interval_check,
  add constraint restaurant_online_settings_reservation_slot_interval_check
    check (reservation_slot_interval_minutes between 15 and 120);

alter table public.restaurant_online_settings
  drop constraint if exists restaurant_online_settings_reservation_timezone_check,
  add constraint restaurant_online_settings_reservation_timezone_check
    check (length(btrim(reservation_timezone)) between 1 and 100);

create or replace function public.get_restaurant_online_reservation_slots(
  p_org_id uuid,
  p_branch_slug text,
  p_date date,
  p_party_size integer
)
returns table (slot_starts_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_location public.business_locations%rowtype;
  online_settings public.restaurant_online_settings%rowtype;
  day_schedule jsonb;
  open_time time;
  close_time time;
  local_slot timestamp;
  local_close timestamp;
  slot_start timestamptz;
  day_of_week integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can check public restaurant reservation availability.';
  end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 20 or p_date is null then
    raise exception 'Choose a valid reservation date and party size.';
  end if;

  select location.* into target_location
  from public.business_locations location
  join public.restaurant_online_settings settings
    on settings.org_id = location.org_id and settings.location_id = location.id
  where location.org_id = p_org_id
    and location.customer_portal_slug = p_branch_slug
    and location.is_active
    and settings.accepts_online_reservations;
  if not found then return; end if;

  select * into online_settings
  from public.restaurant_online_settings
  where org_id = p_org_id and location_id = target_location.id;

  if p_date < (now() at time zone online_settings.reservation_timezone)::date
    or p_date > (now() at time zone online_settings.reservation_timezone)::date + 60 then
    return;
  end if;
  if jsonb_typeof(online_settings.reservation_hours) is distinct from 'array' then
    raise exception 'Reservation hours are not configured correctly.';
  end if;
  if jsonb_array_length(online_settings.reservation_hours) <> 7 then
    raise exception 'Reservation hours are not configured correctly.';
  end if;

  day_of_week := extract(dow from p_date)::integer;
  day_schedule := online_settings.reservation_hours -> day_of_week;
  if day_schedule is null or day_schedule = 'null'::jsonb
    or jsonb_typeof(day_schedule) <> 'object' then
    return;
  end if;
  if coalesce(day_schedule->>'closed', 'false') = 'true' then return; end if;
  if coalesce(day_schedule->>'open', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(day_schedule->>'close', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Reservation hours are not configured correctly.';
  end if;

  open_time := (day_schedule->>'open')::time;
  close_time := (day_schedule->>'close')::time;
  if close_time <= open_time then
    raise exception 'Reservation closing time must be after opening time.';
  end if;

  local_slot := p_date + open_time;
  local_close := p_date + close_time;
  while local_slot + make_interval(mins => online_settings.reservation_duration_minutes) <= local_close loop
    slot_start := local_slot at time zone online_settings.reservation_timezone;
    if (slot_start at time zone online_settings.reservation_timezone) = local_slot
      and slot_start >= now() + interval '30 minutes'
      and exists (
        select 1
        from public.restaurant_tables dining_table
        where dining_table.org_id = p_org_id
          and dining_table.location_id = target_location.id
          and dining_table.is_active
          and dining_table.seats >= p_party_size
          and not exists (
            select 1 from public.restaurant_reservations reservation
            where reservation.org_id = p_org_id
              and reservation.table_id = dining_table.id
              and reservation.status in ('confirmed', 'seated')
              and reservation.starts_at < slot_start + make_interval(mins => online_settings.reservation_duration_minutes)
              and reservation.ends_at > slot_start
          )
      ) then
      slot_starts_at := slot_start;
      return next;
    end if;
    local_slot := local_slot + make_interval(mins => online_settings.reservation_slot_interval_minutes);
  end loop;
end;
$$;

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
  online_settings public.restaurant_online_settings%rowtype;
  candidate_table record;
  created_reservation public.restaurant_reservations%rowtype;
  normalized_name text := btrim(coalesce(p_guest_name, ''));
  normalized_phone text := btrim(coalesce(p_guest_phone, ''));
  normalized_email text := lower(btrim(coalesce(p_guest_email, '')));
  normalized_notes text := btrim(coalesce(p_notes, ''));
  local_start timestamp;
  local_open timestamp;
  local_close timestamp;
  day_schedule jsonb;
  day_of_week integer;
  interval_seconds integer;
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
  if not found then raise exception 'This restaurant is not accepting online reservations.'; end if;

  select * into online_settings
  from public.restaurant_online_settings
  where org_id = p_org_id and location_id = target_location.id
  for share;

  local_start := p_starts_at at time zone online_settings.reservation_timezone;
  day_of_week := extract(dow from local_start::date)::integer;
  if jsonb_typeof(online_settings.reservation_hours) is distinct from 'array' then
    raise exception 'Reservation hours are not configured correctly.';
  end if;
  if jsonb_array_length(online_settings.reservation_hours) <> 7 then
    raise exception 'Reservation hours are not configured correctly.';
  end if;
  day_schedule := online_settings.reservation_hours -> day_of_week;
  if day_schedule is null or day_schedule = 'null'::jsonb
    or jsonb_typeof(day_schedule) <> 'object'
    or coalesce(day_schedule->>'closed', 'false') = 'true'
    or coalesce(day_schedule->>'open', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(day_schedule->>'close', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'The restaurant is closed at the selected time.';
  end if;
  local_open := local_start::date + (day_schedule->>'open')::time;
  local_close := local_start::date + (day_schedule->>'close')::time;
  interval_seconds := online_settings.reservation_slot_interval_minutes * 60;
  if local_close <= local_open
    or local_start < local_open
    or local_start + make_interval(mins => online_settings.reservation_duration_minutes) > local_close
    or mod(extract(epoch from (local_start - local_open))::integer, interval_seconds) <> 0
    or (local_start at time zone online_settings.reservation_timezone) <> p_starts_at then
    raise exception 'Choose one of the available reservation time slots.';
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
        and reservation.starts_at < p_starts_at + make_interval(mins => online_settings.reservation_duration_minutes)
        and reservation.ends_at > p_starts_at
    ) then
      insert into public.restaurant_reservations (
        org_id, location_id, table_id, guest_name, guest_phone, customer_email, party_size,
        starts_at, ends_at, status, notes, created_by, reservation_source,
        customer_confirmation_token
      ) values (
        p_org_id, target_location.id, candidate_table.id, normalized_name, normalized_phone,
        normalized_email, p_party_size, p_starts_at,
        p_starts_at + make_interval(mins => online_settings.reservation_duration_minutes),
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

revoke all on function public.get_restaurant_online_reservation_slots(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.get_restaurant_online_reservation_slots(uuid, text, date, integer) to service_role;
revoke all on function public.create_restaurant_online_reservation(uuid, text, text, text, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_restaurant_online_reservation(uuid, text, text, text, text, integer, timestamptz, text) to service_role;

commit;
