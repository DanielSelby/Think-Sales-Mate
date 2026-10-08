alter table public.sales
  add column if not exists offline_operation_id uuid,
  add column if not exists offline_sync_completed_at timestamptz;

create unique index if not exists sales_offline_operation_id_uidx
  on public.sales (offline_operation_id)
  where offline_operation_id is not null;
