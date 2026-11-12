insert into public.platform_products (slug, name, description, is_published)
values (
  'think-education',
  'Think Education',
  'Education management for schools, colleges, universities, and training institutions.',
  false
)
on conflict (slug) do nothing;

insert into public.platform_product_features (product_slug, module, is_product_entitling_feature)
values
  ('think-education', 'Think Education', true),
  ('think-education', 'Dashboard', false),
  ('think-education', 'Organization & Branches', false),
  ('think-education', 'Students', false),
  ('think-education', 'Staff', false),
  ('think-education', 'Admissions', false),
  ('think-education', 'Academic Management', false),
  ('think-education', 'Attendance', false),
  ('think-education', 'Timetables', false),
  ('think-education', 'Examinations', false),
  ('think-education', 'Results & Report Cards', false),
  ('think-education', 'Promotion & Graduation', false),
  ('think-education', 'Student Transfers', false),
  ('think-education', 'Fees & Finance', false),
  ('think-education', 'Library', false),
  ('think-education', 'Transport', false),
  ('think-education', 'Communication', false),
  ('think-education', 'Reports', false),
  ('think-education', 'User Management', false),
  ('think-education', 'Roles & Permissions', false),
  ('think-education', 'Settings', false)
on conflict (product_slug, module) do nothing;
