insert into public.platform_products (slug, name, description, is_published)
values (
  'think-service-repairs',
  'Think Service & Repairs',
  'Service center operations for jobs, assets, appointments, technicians, and workshop workflows.',
  false
)
on conflict (slug) do nothing;

insert into public.platform_product_features (product_slug, module, is_product_entitling_feature)
values
  ('think-service-repairs', 'Think Service & Repairs', true),
  ('think-service-repairs', 'Think Service & Repairs:Service Jobs', false),
  ('think-service-repairs', 'Think Service & Repairs:Job Cards', false),
  ('think-service-repairs', 'Think Service & Repairs:Customers', false),
  ('think-service-repairs', 'Think Service & Repairs:Customer Assets', false),
  ('think-service-repairs', 'Think Service & Repairs:Appointments', false),
  ('think-service-repairs', 'Think Service & Repairs:Technicians', false),
  ('think-service-repairs', 'Think Service & Repairs:Workshop', false),
  ('think-service-repairs', 'Think Service & Repairs:Quotations', false),
  ('think-service-repairs', 'Think Service & Repairs:Invoices and Payments', false),
  ('think-service-repairs', 'Think Service & Repairs:Inventory and Parts', false),
  ('think-service-repairs', 'Think Service & Repairs:Suppliers and Procurement', false),
  ('think-service-repairs', 'Think Service & Repairs:Warranty', false),
  ('think-service-repairs', 'Think Service & Repairs:Returns', false),
  ('think-service-repairs', 'Think Service & Repairs:Communications', false),
  ('think-service-repairs', 'Think Service & Repairs:Reports', false),
  ('think-service-repairs', 'Think Service & Repairs:Configuration', false),
  ('think-service-repairs', 'Think Service & Repairs:Activity Logs', false)
on conflict (product_slug, module) do nothing;
