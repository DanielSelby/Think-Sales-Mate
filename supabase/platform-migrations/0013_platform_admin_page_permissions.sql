alter table public.platform_admins
  add column if not exists page_permissions text[] not null default array[
    'Overview',
rn     'Usage & Analytics',
    'Activity Logs',
    'Impersonation',
    'Billing & Subscriptions',
    'Complaints & Support',
    'API & Integrations',
    'Security Center',
    'System Settings',
    'Feature Flags',
    'Audit Logs',
    'Login Experience',
    'registrations',
    'communication'
  ]::text[];
