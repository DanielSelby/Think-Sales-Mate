update public.platform_settings
set value = jsonb_set(value, '{name}', '"Think Digital Solutions"'::jsonb, true),
    updated_at = now()
where key = 'system_name'
  and jsonb_typeof(value) = 'object'
  and lower(trim(value->>'name')) in (
    'thinksales',
    'thinksales erp',
    'thinksales pro',
    'thinksales erp pro',
    'salesmate erp',
    'think-salesmate erp'
  );

update public.login_themes
set name = 'Default Think Digital Solutions Login',
    description = 'The original Think Digital Solutions login experience.',
    updated_at = now()
where id = 'default-thinksales-login'
  and name = 'Default ThinkSales Login';
