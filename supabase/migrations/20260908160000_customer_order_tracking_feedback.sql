alter table public.customer_orders
  add column if not exists customer_received_at timestamptz,
  add column if not exists customer_feedback text;
