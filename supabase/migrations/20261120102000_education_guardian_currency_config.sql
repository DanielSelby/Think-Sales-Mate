create or replace function public.education_get_guardian_currency_configs()
returns table (
  organization_id uuid,
  currency_code text,
  currency_symbol text,
  currency_name text,
  decimal_places integer,
  thousand_separator text,
  decimal_separator text,
  currency_position text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct
    organization.id,
    upper(organization.currency),
    coalesce(currency.symbol, currency_settings.currency_symbol, upper(organization.currency)),
    coalesce(currency.name, currency_settings.currency_name, upper(organization.currency)),
    coalesce(currency_settings.decimal_places, 2),
    coalesce(currency_settings.thousand_separator, ','),
    coalesce(currency_settings.decimal_separator, '.'),
    coalesce(currency_settings.currency_position, 'before')
  from public.education_guardians guardian
  join public.organizations organization on organization.id = guardian.org_id
  left join public.currencies currency
    on currency.org_id = organization.id
    and currency.code = upper(organization.currency)
  left join public.currency_settings currency_settings
    on currency_settings.org_id = organization.id
  where guardian.user_id = auth.uid()
    and guardian.status = 'active'
    and organization.registration_status = 'approved'
    and public.has_product_access(organization.id, 'think-education', false)
$$;

revoke all on function public.education_get_guardian_currency_configs() from public, anon;
grant execute on function public.education_get_guardian_currency_configs() to authenticated;
