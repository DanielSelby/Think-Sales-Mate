alter table public.platform_usage_metrics
  add column if not exists purchase_count integer not null default 0;
