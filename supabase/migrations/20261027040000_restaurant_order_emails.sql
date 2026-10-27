begin;

alter table public.restaurant_online_settings
  add column if not exists send_order_emails boolean not null default true;

commit;
