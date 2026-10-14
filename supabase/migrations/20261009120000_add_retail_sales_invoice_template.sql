alter table public.company_profile
  drop constraint if exists company_profile_sales_invoice_template_check;

alter table public.company_profile
  add constraint company_profile_sales_invoice_template_check
  check (sales_invoice_template in ('standard', 'think-sales', 'retail'));
