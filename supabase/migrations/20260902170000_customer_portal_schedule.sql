begin;

alter table public.customer_portal_settings
  add column if not exists schedule_enabled boolean not null default false,
  add column if not exists active_from time not null default '00:00',
  add column if not exists active_until time not null default '23:59',
  add column if not exists schedule_timezone text not null default 'UTC';

drop policy if exists "customer_orders: guests can place orders" on public.customer_orders;

create policy "customer_orders: guests can place orders"
  on public.customer_orders for insert
  to anon
  with check (
    exists (
      select 1
      from public.customer_portal_settings s
      where s.org_id = customer_orders.org_id
        and s.is_enabled = true
        and (
          s.schedule_enabled = false
          or (
            case
              when s.active_from = s.active_until then true
              when s.active_from < s.active_until then
                (now() at time zone s.schedule_timezone)::time >= s.active_from
                and (now() at time zone s.schedule_timezone)::time < s.active_until
              else
                (now() at time zone s.schedule_timezone)::time >= s.active_from
                or (now() at time zone s.schedule_timezone)::time < s.active_until
            end
          )
        )
    )
  );

commit;
