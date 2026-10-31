begin;

drop trigger if exists restaurant_orders_assign_cue_number on public.restaurant_orders;
drop function if exists public.assign_restaurant_order_cue_number();

alter table public.restaurant_orders
  drop constraint if exists restaurant_orders_cue_number_check,
  drop constraint if exists restaurant_orders_branch_daily_cue_number_key;

do $$
begin
  if exists (
    select 1
    from public.restaurant_orders orders
    group by orders.org_id, orders.location_id, orders.cue_date,
      case orders.order_type
        when 'takeaway' then 'TA'
        when 'pickup' then 'TA'
        when 'dine_in' then 'DI'
        when 'delivery' then 'DV'
      end
    having count(*) > 8999
  ) then
    raise exception 'Existing restaurant orders exceed the four-digit Cue No. capacity for a branch/day/order type.';
  end if;
end;
$$;

alter table public.restaurant_orders
  alter column cue_number type text using cue_number::text;

with numbered_orders as (
  select orders.id,
    case orders.order_type
      when 'takeaway' then 'TA'
      when 'pickup' then 'TA'
      when 'dine_in' then 'DI'
      when 'delivery' then 'DV'
    end as cue_prefix,
    row_number() over (
      partition by orders.org_id, orders.location_id, orders.cue_date,
        case orders.order_type
          when 'takeaway' then 'TA'
          when 'pickup' then 'TA'
          when 'dine_in' then 'DI'
          when 'delivery' then 'DV'
        end
      order by orders.created_at, orders.id
    )::integer + 1000 as sequence_number
  from public.restaurant_orders orders
)
update public.restaurant_orders orders
set cue_number = numbered_orders.cue_prefix || lpad(numbered_orders.sequence_number::text, 4, '0')
from numbered_orders
where orders.id = numbered_orders.id;

alter table public.restaurant_orders
  add constraint restaurant_orders_cue_number_check
    check (cue_number ~ '^(TA|DI|DV)[0-9]{4}$'),
  add constraint restaurant_orders_branch_daily_cue_number_key
    unique (org_id, location_id, cue_date, cue_number);

alter table public.restaurant_order_cue_counters
  drop constraint restaurant_order_cue_counters_pkey,
  add column cue_prefix text;

delete from public.restaurant_order_cue_counters;

alter table public.restaurant_order_cue_counters
  alter column cue_prefix set not null,
  add constraint restaurant_order_cue_counters_prefix_check
    check (cue_prefix in ('TA', 'DI', 'DV')),
  add constraint restaurant_order_cue_counters_pkey
    primary key (org_id, location_id, cue_date, cue_prefix);

insert into public.restaurant_order_cue_counters (org_id, location_id, cue_date, cue_prefix, last_cue_number)
select org_id,
  location_id,
  cue_date,
  left(cue_number, 2),
  max(substring(cue_number from 3)::integer)
from public.restaurant_orders
group by org_id, location_id, cue_date, left(cue_number, 2);

create or replace function public.assign_restaurant_order_cue_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cue_timezone text;
  cue_prefix text;
  next_number integer;
begin
  select settings.timezone into cue_timezone
  from public.org_general_settings settings
  where settings.org_id = new.org_id;
  new.cue_date := (coalesce(new.created_at, now()) at time zone coalesce(cue_timezone, 'UTC'))::date;
  cue_prefix := case new.order_type
    when 'takeaway' then 'TA'
    when 'pickup' then 'TA'
    when 'dine_in' then 'DI'
    when 'delivery' then 'DV'
    else null
  end;
  if cue_prefix is null then
    raise exception 'Could not assign a cue number for this order type.';
  end if;

  insert into public.restaurant_order_cue_counters (org_id, location_id, cue_date, cue_prefix, last_cue_number)
  values (new.org_id, new.location_id, new.cue_date, cue_prefix, 1001)
  on conflict (org_id, location_id, cue_date, cue_prefix)
  do update set last_cue_number = restaurant_order_cue_counters.last_cue_number + 1
    where restaurant_order_cue_counters.last_cue_number < 9999
  returning last_cue_number into next_number;

  if next_number is null then
    raise exception 'This branch has reached its daily limit of 8999 cue numbers for this order type.';
  end if;
  new.cue_number := cue_prefix || lpad(next_number::text, 4, '0');
  return new;
end;
$$;

revoke all on function public.assign_restaurant_order_cue_number()
  from public, anon, authenticated;

create trigger restaurant_orders_assign_cue_number
  before insert on public.restaurant_orders
  for each row execute function public.assign_restaurant_order_cue_number();

commit;
