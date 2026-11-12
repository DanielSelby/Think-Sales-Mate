alter table public.organization_product_role_templates
  drop constraint if exists organization_product_role_templates_product_slug_check;
alter table public.organization_product_role_templates
  add constraint organization_product_role_templates_product_slug_check
  check (product_slug in ('thinksales-erp', 'restaurant', 'think-service-repairs', 'think-education'));

alter table public.organization_member_product_permissions
  drop constraint if exists organization_member_product_permissions_product_slug_check;
alter table public.organization_member_product_permissions
  add constraint organization_member_product_permissions_product_slug_check
  check (product_slug in ('thinksales-erp', 'restaurant', 'think-service-repairs', 'think-education'));

create or replace function public.product_permission_module_is_allowed(
  target_product_slug text,
  target_module text
) returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when target_module in ('settings', 'user_management') then false
    when target_module like 'education_%' or target_module like 'education.%'
      then target_product_slug = 'think-education'
    when target_module = 'restaurant' or target_module like 'restaurant.%'
      then target_product_slug = 'restaurant'
    when target_module like 'service_%' or target_module = 'customer_assets'
      then target_product_slug = 'think-service-repairs'
    when target_module in (
      'approvals', 'assets', 'banking', 'cash_closing', 'communication',
      'customer_messaging', 'expenses', 'fraud', 'fraud_detection', 'hrm',
      'hrm_payroll', 'payroll', 'cash-closing'
    )
      then target_product_slug in ('thinksales-erp', 'restaurant')
    else target_product_slug = 'thinksales-erp'
  end;
$$;

create or replace function public.has_org_permission(
  target_org_id uuid,
  target_module text,
  target_action text
) returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  active_product_slug text;
  required_product_slug text;
begin
  begin
    active_product_slug := current_setting('request.headers', true)::jsonb ->> 'x-active-product-slug';
  exception when others then
    active_product_slug := null;
  end;

  if target_module in ('settings', 'user_management') or target_module like 'settings.%' then
    active_product_slug := null;
  elsif target_module like 'education_%' or target_module like 'education.%' then
    required_product_slug := 'think-education';
  elsif target_module = 'restaurant' or target_module like 'restaurant.%' then
    required_product_slug := 'restaurant';
  elsif target_module like 'service_%' or target_module = 'customer_assets' then
    required_product_slug := 'think-service-repairs';
  elsif target_module in (
    'approvals', 'assets', 'banking', 'cash_closing', 'communication',
    'customer_messaging', 'expenses', 'fraud', 'fraud_detection', 'hrm',
    'hrm_payroll', 'payroll', 'cash-closing'
  ) then
    if active_product_slug not in ('thinksales-erp', 'restaurant') then
      return false;
    end if;
    required_product_slug := active_product_slug;
  else
    required_product_slug := 'thinksales-erp';
  end if;

  if required_product_slug is not null then
    if active_product_slug is distinct from required_product_slug then
      return false;
    end if;
    return public.has_org_product_permission(
      target_org_id, required_product_slug, target_module, target_action
    );
  end if;

  return exists (
    select 1
    from public.organization_members member
    left join public.organization_role_templates template
      on template.org_id = member.org_id
     and template.role_key = case coalesce(member.access_permissions ->> 'role_key', member.role::text)
       when 'admin' then 'administrator'
       when 'branch_manager' then 'manager'
       when 'super_admin' then 'owner'
       else coalesce(member.access_permissions ->> 'role_key', member.role::text)
     end
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role = 'owner'
        or (
          case
            when member.access_permissions ->> 'permissions_mode' = 'custom' then
              coalesce(member.access_permissions -> 'permissions' -> target_module, '[]'::jsonb)
                ? target_action
            when template.org_id is not null then
              coalesce(template.permissions -> target_module, '[]'::jsonb) ? target_action
            else
              coalesce(member.access_permissions -> 'role_defaults_fallback' -> target_module, '[]'::jsonb)
                ? target_action
          end
        )
      )
  );
end;
$$;

revoke all on function public.has_org_permission(uuid, text, text) from public, anon;
grant execute on function public.has_org_permission(uuid, text, text) to authenticated;
