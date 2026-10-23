alter table public.company_profile
  add column if not exists whatsapp_business_number text
    check (whatsapp_business_number is null or whatsapp_business_number ~ '^[1-9][0-9]{7,14}$'),
  add column if not exists customer_portal_whatsapp_message text
    check (customer_portal_whatsapp_message is null or char_length(customer_portal_whatsapp_message) <= 300);
