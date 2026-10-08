alter table public.company_profile
  add column if not exists sales_invoice_template text not null default 'standard'
  check (sales_invoice_template in ('standard', 'think-sales'));
