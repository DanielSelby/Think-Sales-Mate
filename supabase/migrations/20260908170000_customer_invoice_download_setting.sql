alter table public.customer_portal_settings
  add column if not exists allow_customer_invoice_download boolean not null default true;
