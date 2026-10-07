alter table public.company_profile
  add column if not exists show_contact_on_invoices boolean not null default true;
