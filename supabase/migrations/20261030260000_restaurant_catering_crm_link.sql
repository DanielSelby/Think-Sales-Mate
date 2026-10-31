begin;

alter table public.restaurant_catering_events
  add column customer_id uuid references public.customers(id) on delete set null;

create index restaurant_catering_events_customer_idx
  on public.restaurant_catering_events(org_id, customer_id, updated_at desc)
  where customer_id is not null;

create or replace function public.link_restaurant_catering_event_crm_customer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_customer_id uuid;
  match_count integer;
begin
  if new.customer_id is not null then
    if not exists (
      select 1 from public.customers
      where id = new.customer_id and org_id = new.org_id
    ) then
      raise exception 'The catering customer must belong to this organization.';
    end if;
    return new;
  end if;

  select count(distinct customer.id), min(customer.id::text)::uuid
    into match_count, matched_customer_id
  from public.customers customer
  where customer.org_id = new.org_id
    and (
      (nullif(btrim(new.customer_email), '') is not null
        and lower(btrim(customer.email)) = lower(btrim(new.customer_email)))
      or
      (nullif(regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g'), '') is not null
        and regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(new.customer_phone, '[^0-9]', '', 'g'))
    );

  if match_count = 1 then
    new.customer_id := matched_customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_catering_events_link_crm_customer
  on public.restaurant_catering_events;
create trigger restaurant_catering_events_link_crm_customer
  before insert or update of customer_email, customer_phone, customer_id
  on public.restaurant_catering_events
  for each row execute function public.link_restaurant_catering_event_crm_customer();

revoke all on function public.link_restaurant_catering_event_crm_customer()
  from public, anon, authenticated;
grant execute on function public.link_restaurant_catering_event_crm_customer()
  to service_role;

with matches as (
  select event.id,
    min(customer.id::text)::uuid as customer_id
  from public.restaurant_catering_events event
  join public.customers customer on customer.org_id = event.org_id
    and (
      (nullif(btrim(event.customer_email), '') is not null
        and lower(btrim(customer.email)) = lower(btrim(event.customer_email)))
      or
      (nullif(regexp_replace(coalesce(event.customer_phone, ''), '[^0-9]', '', 'g'), '') is not null
        and regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(event.customer_phone, '[^0-9]', '', 'g'))
    )
  where event.customer_id is null
  group by event.id
  having count(distinct customer.id) = 1
)
update public.restaurant_catering_events event
set customer_id = matches.customer_id
from matches
where event.id = matches.id;

create or replace function public.get_restaurant_customer_history(
  p_org_id uuid,
  p_location_ids uuid[] default null
)
returns table (
  customer_id uuid,
  visits bigint,
  net_spend numeric,
  last_activity timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read Restaurant customer history.';
  end if;

  return query
  with customer_activity as (
    select order_row.customer_id,
      count(*)::bigint as visits,
      coalesce(sum(case
        when coalesce(payment_totals.payment_count, 0) > 0 then payment_totals.net_paid
        else order_row.total
      end), 0)::numeric as net_spend,
      max(order_row.created_at) as last_activity
    from public.restaurant_orders order_row
    left join lateral (
      select count(*) as payment_count,
        sum(case when payment.payment_type = 'payment' then payment.amount else -payment.amount end) as net_paid
      from public.restaurant_order_payments payment
      where payment.org_id = order_row.org_id and payment.order_id = order_row.id
    ) payment_totals on true
    where order_row.org_id = p_org_id
      and order_row.customer_id is not null
      and order_row.status = 'completed'
      and (p_location_ids is null or order_row.location_id = any(p_location_ids))
    group by order_row.customer_id

    union all

    select event.customer_id,
      count(*)::bigint as visits,
      coalesce(sum(payment_totals.amount_paid), 0)::numeric as net_spend,
      max(greatest(event.updated_at, coalesce(payment_totals.last_paid_at, event.updated_at))) as last_activity
    from public.restaurant_catering_events event
    left join lateral (
      select coalesce(sum(payment.amount), 0)::numeric as amount_paid,
        max(payment.paid_at) as last_paid_at
      from public.restaurant_catering_payments payment
      where payment.org_id = event.org_id and payment.event_id = event.id
    ) payment_totals on true
    where event.org_id = p_org_id
      and event.customer_id is not null
      and event.status = 'completed'
      and (p_location_ids is null or event.location_id = any(p_location_ids))
    group by event.customer_id
  )
  select activity.customer_id,
    sum(activity.visits)::bigint,
    sum(activity.net_spend)::numeric,
    max(activity.last_activity)
  from customer_activity activity
  group by activity.customer_id;
end;
$$;

revoke all on function public.get_restaurant_customer_history(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.get_restaurant_customer_history(uuid, uuid[])
  to service_role;

commit;
