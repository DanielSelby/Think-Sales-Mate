begin;

create table if not exists public.restaurant_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete restrict,
  table_id uuid,
  guest_name text not null check (length(btrim(guest_name)) between 1 and 120),
  guest_phone text not null check (length(btrim(guest_phone)) between 1 and 40),
  party_size integer not null check (party_size between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('waitlisted', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, table_id)
    references public.restaurant_tables(org_id, id) on delete restrict,
  check (ends_at > starts_at),
  check ((status = 'waitlisted' and table_id is null) or status <> 'waitlisted')
);

create index if not exists restaurant_reservations_org_location_start_idx
  on public.restaurant_reservations(org_id, location_id, starts_at);
create index if not exists restaurant_reservations_org_table_start_idx
  on public.restaurant_reservations(org_id, table_id, starts_at)
  where table_id is not null and status in ('confirmed', 'seated');

alter table public.restaurant_reservations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_reservations'
      and policyname = 'Restaurant reservations: members read assigned locations'
  ) then
    create policy "Restaurant reservations: members read assigned locations"
      on public.restaurant_reservations for select
      using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
  end if;
end
$$;

grant select on public.restaurant_reservations to authenticated;

create or replace function public.create_restaurant_reservation(
  p_org_id uuid,
  p_location_id uuid,
  p_table_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_party_size integer,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_notes text,
  p_created_by uuid,
  p_waitlist boolean
)
returns public.restaurant_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_reservation public.restaurant_reservations;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create restaurant reservations.';
  end if;
  if length(btrim(coalesce(p_guest_name, ''))) not between 1 and 120
    or length(btrim(coalesce(p_guest_phone, ''))) not between 1 and 40 then
    raise exception 'Enter a guest name and a valid phone number.';
  end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 100 then
    raise exception 'Party size must be between 1 and 100.';
  end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes'
    or p_duration_minutes is null or p_duration_minutes not between 30 and 240 then
    raise exception 'Choose a future start time and a duration between 30 and 240 minutes.';
  end if;
  if not exists (
    select 1 from public.business_locations location
    where location.id = p_location_id and location.org_id = p_org_id and location.is_active
  ) then
    raise exception 'The selected restaurant location is not active for this organization.';
  end if;
  if p_waitlist and p_table_id is not null then
    raise exception 'Waitlist entries cannot be assigned a table.';
  end if;
  if not p_waitlist and p_table_id is null then
    raise exception 'Choose a table for a reservation or add the guest to the waitlist.';
  end if;
  if not p_waitlist and p_table_id is not null then
    if not exists (
      select 1 from public.restaurant_tables dining_table
      where dining_table.id = p_table_id
        and dining_table.org_id = p_org_id
        and dining_table.location_id = p_location_id
        and dining_table.is_active
        and dining_table.seats >= p_party_size
    ) then
      raise exception 'Choose an active table at this branch that can seat the whole party.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_table_id::text, 0));
    if exists (
      select 1 from public.restaurant_reservations reservation
      where reservation.org_id = p_org_id
        and reservation.table_id = p_table_id
        and reservation.status in ('confirmed', 'seated')
        and reservation.starts_at < p_starts_at + make_interval(mins => p_duration_minutes)
        and reservation.ends_at > p_starts_at
    ) then
      raise exception 'That table already has a reservation during the selected time.';
    end if;
  end if;

  insert into public.restaurant_reservations (
    org_id, location_id, table_id, guest_name, guest_phone, party_size, starts_at, ends_at,
    status, notes, created_by
  ) values (
    p_org_id, p_location_id, p_table_id, btrim(p_guest_name), btrim(p_guest_phone), p_party_size,
    p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes),
    case when p_waitlist then 'waitlisted' else 'confirmed' end,
    nullif(btrim(p_notes), ''), p_created_by
  ) returning * into created_reservation;

  return created_reservation;
end;
$$;

revoke all on function public.create_restaurant_reservation(uuid, uuid, uuid, text, text, integer, timestamptz, integer, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_restaurant_reservation(uuid, uuid, uuid, text, text, integer, timestamptz, integer, text, uuid, boolean) to service_role;

create or replace function public.assign_restaurant_reservation_table(
  p_org_id uuid,
  p_reservation_id uuid,
  p_table_id uuid
)
returns public.restaurant_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  target_reservation public.restaurant_reservations;
  target_table public.restaurant_tables;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can assign restaurant reservation tables.';
  end if;

  select * into target_reservation
  from public.restaurant_reservations
  where id = p_reservation_id and org_id = p_org_id
  for update;
  if not found or target_reservation.status not in ('waitlisted', 'confirmed') then
    raise exception 'Reservation not found or cannot be assigned a table.';
  end if;

  select * into target_table
  from public.restaurant_tables
  where id = p_table_id
    and org_id = p_org_id
    and location_id = target_reservation.location_id
    and is_active
    and seats >= target_reservation.party_size;
  if not found then
    raise exception 'Choose an active table at this branch that can seat the whole party.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_table_id::text, 0));
  if exists (
    select 1 from public.restaurant_reservations reservation
    where reservation.org_id = p_org_id
      and reservation.table_id = p_table_id
      and reservation.id <> target_reservation.id
      and reservation.status in ('confirmed', 'seated')
      and reservation.starts_at < target_reservation.ends_at
      and reservation.ends_at > target_reservation.starts_at
  ) then
    raise exception 'That table already has a reservation during the selected time.';
  end if;

  update public.restaurant_reservations
  set table_id = p_table_id, status = 'confirmed', updated_at = now()
  where id = target_reservation.id
  returning * into target_reservation;
  return target_reservation;
end;
$$;

revoke all on function public.assign_restaurant_reservation_table(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_restaurant_reservation_table(uuid, uuid, uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_reservations'
    ) then
    alter publication supabase_realtime add table public.restaurant_reservations;
  end if;
end
$$;

commit;
