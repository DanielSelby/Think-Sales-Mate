begin;

create or replace function public.assign_restaurant_order_cue_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cue_timezone text;
  v_cue_prefix text;
  next_number integer;
begin
  select settings.timezone into cue_timezone
  from public.org_general_settings settings
  where settings.org_id = new.org_id;
  new.cue_date := (coalesce(new.created_at, now()) at time zone coalesce(cue_timezone, 'UTC'))::date;
  v_cue_prefix := case new.order_type
    when 'takeaway' then 'TA'
    when 'pickup' then 'TA'
    when 'dine_in' then 'DI'
    when 'delivery' then 'DV'
    else null
  end;
  if v_cue_prefix is null then
    raise exception 'Could not assign a cue number for this order type.';
  end if;

  insert into public.restaurant_order_cue_counters (org_id, location_id, cue_date, cue_prefix, last_cue_number)
  values (new.org_id, new.location_id, new.cue_date, v_cue_prefix, 1001)
  on conflict (org_id, location_id, cue_date, cue_prefix)
  do update set last_cue_number = restaurant_order_cue_counters.last_cue_number + 1
    where restaurant_order_cue_counters.last_cue_number < 9999
  returning last_cue_number into next_number;

  if next_number is null then
    raise exception 'This branch has reached its daily limit of 8999 cue numbers for this order type.';
  end if;
  new.cue_number := v_cue_prefix || lpad(next_number::text, 4, '0');
  return new;
end;
$$;

revoke all on function public.assign_restaurant_order_cue_number()
  from public, anon, authenticated;

commit;
