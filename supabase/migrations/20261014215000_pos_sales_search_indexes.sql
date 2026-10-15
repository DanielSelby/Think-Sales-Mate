create extension if not exists pg_trgm with schema extensions;

create index if not exists sales_pos_list_sale_number_search_idx
  on public.sales using gin ((sale_number::text) gin_trgm_ops)
  where register_session_id is not null and document_status = 'final';

create index if not exists sales_pos_list_id_search_idx
  on public.sales using gin ((id::text) gin_trgm_ops)
  where register_session_id is not null and document_status = 'final';

create index if not exists sales_pos_list_customer_search_idx
  on public.sales using gin (customer_name gin_trgm_ops)
  where register_session_id is not null and document_status = 'final' and customer_name is not null;

create index if not exists customers_phone_search_idx
  on public.customers using gin (phone gin_trgm_ops)
  where phone is not null;

create index if not exists sales_pos_list_location_filter_idx
  on public.sales (org_id, location_id, sale_date desc, created_at desc)
  where register_session_id is not null and document_status = 'final';

create index if not exists sales_pos_list_cashier_filter_idx
  on public.sales (org_id, sold_by, sale_date desc, created_at desc)
  where register_session_id is not null and document_status = 'final';
