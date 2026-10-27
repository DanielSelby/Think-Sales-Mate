begin;

alter table public.restaurant_orders
  add column if not exists customer_tracking_token uuid;

create unique index if not exists restaurant_orders_customer_tracking_token_key
  on public.restaurant_orders(customer_tracking_token)
  where customer_tracking_token is not null;

create or replace function public.set_restaurant_order_tracking_token()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.order_source = 'online' and new.customer_tracking_token is null then
    new.customer_tracking_token := gen_random_uuid();
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_orders_tracking_token_trigger on public.restaurant_orders;
create trigger restaurant_orders_tracking_token_trigger
  before insert or update on public.restaurant_orders
  for each row execute function public.set_restaurant_order_tracking_token();

revoke all on function public.set_restaurant_order_tracking_token() from public, anon, authenticated;
grant execute on function public.set_restaurant_order_tracking_token() to service_role;

update public.restaurant_orders
set customer_tracking_token = gen_random_uuid()
where order_source = 'online' and customer_tracking_token is null;

commit;
