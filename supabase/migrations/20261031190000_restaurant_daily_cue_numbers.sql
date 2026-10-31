begin;

create table public.restaurant_order_cue_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  cue_date date not null,
  last_cue_number integer not null check (last_cue_number > 0),
  primary key (org_id, location_id, cue_date)
);

alter table public.restaurant_order_cue_counters enable row level security;
revoke all on public.restaurant_order_cue_counters from public, anon, authenticated;
grant all on public.restaurant_order_cue_counters to service_role;

alter table public.restaurant_orders
  add column cue_date date,
  add column cue_number integer;

with numbered_orders as (
  select orders.id,
    (orders.created_at at time zone coalesce(settings.timezone, 'UTC'))::date as cue_date,
    row_number() over (
      partition by orders.org_id, orders.location_id,
        (orders.created_at at time zone coalesce(settings.timezone, 'UTC'))::date
      order by orders.created_at, orders.id
    )::integer as cue_number
  from public.restaurant_orders orders
  left join public.org_general_settings settings on settings.org_id = orders.org_id
)
update public.restaurant_orders orders
set cue_date = numbered_orders.cue_date,
    cue_number = numbered_orders.cue_number
from numbered_orders
where orders.id = numbered_orders.id;

insert into public.restaurant_order_cue_counters (org_id, location_id, cue_date, last_cue_number)
select org_id, location_id, cue_date, max(cue_number)
from public.restaurant_orders
group by org_id, location_id, cue_date
on conflict (org_id, location_id, cue_date)
do update set last_cue_number = greatest(
  restaurant_order_cue_counters.last_cue_number,
  excluded.last_cue_number
);

alter table public.restaurant_orders
  alter column cue_date set not null,
  alter column cue_number set not null,
  add constraint restaurant_orders_cue_number_check check (cue_number > 0),
  add constraint restaurant_orders_branch_daily_cue_number_key
    unique (org_id, location_id, cue_date, cue_number);

create or replace function public.assign_restaurant_order_cue_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cue_timezone text;
begin
  select settings.timezone into cue_timezone
  from public.org_general_settings settings
  where settings.org_id = new.org_id;
  new.cue_date := (coalesce(new.created_at, now()) at time zone coalesce(cue_timezone, 'UTC'))::date;
  insert into public.restaurant_order_cue_counters (org_id, location_id, cue_date, last_cue_number)
  values (new.org_id, new.location_id, new.cue_date, 1)
  on conflict (org_id, location_id, cue_date)
  do update set last_cue_number = restaurant_order_cue_counters.last_cue_number + 1
  returning last_cue_number into new.cue_number;
  return new;
end;
$$;

revoke all on function public.assign_restaurant_order_cue_number()
  from public, anon, authenticated;

create trigger restaurant_orders_assign_cue_number
  before insert on public.restaurant_orders
  for each row execute function public.assign_restaurant_order_cue_number();

commit;
