alter table public.company_profile
  add column if not exists invoice_slogan text,
  add column if not exists invoice_thank_you_message text,
  add column if not exists invoice_terms_and_conditions text;
