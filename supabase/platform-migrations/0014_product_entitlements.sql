create table if not exists public.platform_products (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_plan_products (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  product_slug text not null references public.platform_products(slug) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (plan_id, product_slug)
);

create table if not exists public.platform_product_features (
  product_slug text not null references public.platform_products(slug) on delete cascade,
  module text not null,
  is_product_entitling_feature boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_slug, module)
);

create table if not exists public.platform_organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_slug text not null references public.platform_products(slug) on delete restrict,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null check (status in ('pending', 'trial', 'active', 'grace', 'suspended', 'expired', 'cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  source text not null default 'manual',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_slug)
);

alter table public.platform_organizations
  add column if not exists requested_product_slugs text[] not null default '{}';

create index if not exists platform_organization_subscriptions_org_idx
  on public.platform_organization_subscriptions (organization_id);

create table if not exists public.platform_entitlement_outbox (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  organization_id uuid not null,
  product_slug text not null,
  version bigint not null check (version > 0),
  payload jsonb not null,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, version)
);

create index if not exists platform_entitlement_outbox_pending_idx
  on public.platform_entitlement_outbox (next_attempt_at, created_at, id)
  where processed_at is null;

insert into public.platform_products (slug, name, description, is_published)
values
  ('thinksales-erp', 'ThinkSales ERP', 'Core ThinkSales ERP product.', true),
  ('restaurant', 'Restaurant', 'Restaurant operations product.', true)
on conflict (slug) do nothing;

insert into public.platform_product_features (product_slug, module, is_product_entitling_feature)
values
  ('thinksales-erp', 'Dashboard', false),
  ('thinksales-erp', 'Approval Center', false),
  ('thinksales-erp', 'POS', true),
  ('thinksales-erp', 'Sales', true),
  ('thinksales-erp', 'Orders', true),
  ('thinksales-erp', 'Customer Ordering', true),
  ('thinksales-erp', 'Purchases', true),
  ('thinksales-erp', 'Products', true),
  ('thinksales-erp', 'Stock Transfer', true),
  ('thinksales-erp', 'Stock Adjustment', true),
  ('thinksales-erp', 'CRM', true),
  ('thinksales-erp', 'Route Sales', true),
  ('thinksales-erp', 'Expenses', true),
  ('thinksales-erp', 'HRM & Payroll', true),
  ('thinksales-erp', 'Accounting', true),
  ('thinksales-erp', 'End Of Day Accounts', true),
  ('thinksales-erp', 'Assets', true),
  ('thinksales-erp', 'Projects', true),
  ('thinksales-erp', 'Business Report', true),
  ('thinksales-erp', 'Audit Center', true),
  ('thinksales-erp', 'Fraud & Anomaly Detection', true),
  ('thinksales-erp', 'ThinkSales Ai Agent', true),
  ('thinksales-erp', 'Communication', true),
  ('thinksales-erp', 'User Management', true),
  ('thinksales-erp', 'Users', true),
  ('thinksales-erp', 'Offline Center', true),
  ('restaurant', 'Dashboard', false),
  ('restaurant', 'Approval Center', false),
  ('restaurant', 'Restaurant', true),
  ('restaurant', 'End Of Day Accounts', false),
  ('restaurant', 'Expenses', false),
  ('restaurant', 'Accounting', false),
  ('restaurant', 'Assets', false),
  ('restaurant', 'HRM & Payroll', false),
  ('restaurant', 'Fraud & Anomaly Detection', false),
  ('restaurant', 'Communication', false),
  ('restaurant', 'User Management', false),
  ('restaurant', 'Users', false)
on conflict (product_slug, module) do nothing;

insert into public.platform_plan_products (plan_id, product_slug)
select distinct plans.id, features.product_slug
from public.subscription_plans as plans
join public.platform_product_features as features
  on features.is_product_entitling_feature
 and (
   features.module = any(plans.included_modules)
   or exists (
     select 1
     from public.platform_plan_features as plan_features
     where plan_features.plan_id = plans.id
       and plan_features.module = features.module
       and plan_features.access_mode <> 'disabled'
   )
 )
on conflict (plan_id, product_slug) do nothing;

alter table public.platform_products enable row level security;
alter table public.platform_plan_products enable row level security;
alter table public.platform_product_features enable row level security;
alter table public.platform_organization_subscriptions enable row level security;
alter table public.platform_entitlement_outbox enable row level security;

drop policy if exists "platform admins manage products" on public.platform_products;
create policy "platform admins manage products"
  on public.platform_products for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform admins manage plan products" on public.platform_plan_products;
create policy "platform admins manage plan products"
  on public.platform_plan_products for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform admins manage product features" on public.platform_product_features;
create policy "platform admins manage product features"
  on public.platform_product_features for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform admins manage organization subscriptions" on public.platform_organization_subscriptions;
create policy "platform admins manage organization subscriptions"
  on public.platform_organization_subscriptions for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform admins read entitlement outbox" on public.platform_entitlement_outbox;
create policy "platform admins read entitlement outbox"
  on public.platform_entitlement_outbox for select
  using (public.is_platform_admin());

create or replace function public.bump_product_subscription_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_product_entitlement_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_entitlement_outbox (
    subscription_id,
    organization_id,
    product_slug,
    version,
    payload
  )
  values (
    new.id,
    new.organization_id,
    new.product_slug,
    new.version,
    jsonb_build_object(
      'organization_id', new.organization_id,
      'product_slug', new.product_slug,
      'plan_id', new.plan_id,
      'status', new.status,
      'current_period_start', new.current_period_start,
      'current_period_end', new.current_period_end,
      'trial_ends_at', new.trial_ends_at,
      'grace_ends_at', new.grace_ends_at,
      'cancel_at_period_end', new.cancel_at_period_end,
      'cancelled_at', new.cancelled_at,
      'source', new.source,
      'version', new.version,
      'updated_at', new.updated_at,
      'organization_status', (
        select organizations.status
        from public.platform_organizations as organizations
        where organizations.organization_id = new.organization_id
      ),
      'registration_state', (
        select organizations.registration_state
        from public.platform_organizations as organizations
        where organizations.organization_id = new.organization_id
      ),
      'organization_expires_at', (
        select organizations.expires_at
        from public.platform_organizations as organizations
        where organizations.organization_id = new.organization_id
      )
    )
  );
  return new;
end;
$$;

create or replace function public.enqueue_organization_entitlement_refresh()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.platform_organization_subscriptions
  set updated_at = now()
  where organization_id = new.organization_id;
  return new;
end;
$$;

drop trigger if exists platform_organization_subscription_version on public.platform_organization_subscriptions;
create trigger platform_organization_subscription_version
  before insert or update on public.platform_organization_subscriptions
  for each row execute function public.bump_product_subscription_version();

drop trigger if exists platform_organization_subscription_outbox on public.platform_organization_subscriptions;
create trigger platform_organization_subscription_outbox
  after insert or update on public.platform_organization_subscriptions
  for each row execute function public.enqueue_product_entitlement_projection();

drop trigger if exists platform_organization_entitlement_refresh on public.platform_organizations;
create trigger platform_organization_entitlement_refresh
  after update of status, registration_state, expires_at on public.platform_organizations
  for each row
  when (
    old.status is distinct from new.status
    or old.registration_state is distinct from new.registration_state
    or old.expires_at is distinct from new.expires_at
  )
  execute function public.enqueue_organization_entitlement_refresh();

create or replace function public.sync_legacy_product_entitlement_from_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feature_row record;
  organization_row record;
  grant_is_enabled boolean;
begin
  grant_is_enabled := new.enabled and new.access_mode <> 'disabled';

  for feature_row in
    select product_features.product_slug
    from public.platform_product_features as product_features
    where product_features.is_product_entitling_feature
      and (
        product_features.module = new.module
        or (
          product_features.module = 'Restaurant'
          and new.module like 'Restaurant:%'
        )
      )
  loop
    select status, registration_state, plan_id, expires_at, created_at
    into organization_row
    from public.platform_organizations
    where organization_id = new.organization_id;

    if not found then
      continue;
    end if;

    if grant_is_enabled then
      insert into public.platform_organization_subscriptions (
        organization_id,
        product_slug,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        trial_ends_at,
        grace_ends_at,
        source
      )
      values (
        new.organization_id,
        feature_row.product_slug,
        organization_row.plan_id,
        case
          when organization_row.registration_state in ('pending', 'information_requested') then 'pending'
          when organization_row.registration_state = 'rejected' then 'suspended'
          when organization_row.status = 'pending' then 'pending'
          when organization_row.status in ('suspended', 'rejected') then 'suspended'
          when organization_row.status = 'expired' then 'expired'
          else organization_row.status
        end,
        organization_row.created_at,
        organization_row.expires_at,
        case when organization_row.status = 'trial' then organization_row.expires_at else null end,
        case
          when organization_row.expires_at is not null then organization_row.expires_at
            + make_interval(days => coalesce((
              select plans.grace_period_days
              from public.subscription_plans as plans
              where plans.id = organization_row.plan_id
            ), 0))
          else null
        end,
        'legacy_feature_grant'
      )
      on conflict (organization_id, product_slug) do nothing;
    end if;

    update public.platform_organization_subscriptions as subscriptions
    set status = case
      when exists (
        select 1
        from public.platform_product_features as product_features
        join public.platform_organization_features as organization_features
          on organization_features.organization_id = new.organization_id
         and organization_features.enabled
         and organization_features.access_mode <> 'disabled'
         and (
           organization_features.module = product_features.module
           or (
             product_features.module = 'Restaurant'
             and organization_features.module like 'Restaurant:%'
           )
         )
        where product_features.product_slug = subscriptions.product_slug
          and product_features.is_product_entitling_feature
      ) then case
        when organization_row.registration_state in ('pending', 'information_requested') then 'pending'
        when organization_row.registration_state = 'rejected' then 'suspended'
        when organization_row.status in ('suspended', 'rejected') then 'suspended'
        when organization_row.status = 'expired' then 'expired'
        else organization_row.status
      end
      else 'expired'
    end
    where subscriptions.organization_id = new.organization_id
      and subscriptions.product_slug = feature_row.product_slug
      and subscriptions.source = 'legacy_feature_grant';
  end loop;

  return new;
end;
$$;

drop trigger if exists platform_organization_feature_legacy_entitlement on public.platform_organization_features;
create trigger platform_organization_feature_legacy_entitlement
  after insert or update of enabled, access_mode on public.platform_organization_features
  for each row execute function public.sync_legacy_product_entitlement_from_feature();

insert into public.platform_organization_subscriptions (
  organization_id,
  product_slug,
  plan_id,
  status,
  current_period_start,
  current_period_end,
  trial_ends_at,
  grace_ends_at,
  source
)
select
  organizations.organization_id,
  products.slug,
  organizations.plan_id,
  case
    when organizations.registration_state in ('pending', 'information_requested') then 'pending'
    when organizations.registration_state = 'rejected' then 'suspended'
    when organizations.status = 'pending' then 'pending'
    when organizations.status = 'rejected' then 'suspended'
    else organizations.status
  end,
  organizations.created_at,
  organizations.expires_at,
  case when organizations.status = 'trial' then organizations.expires_at else null end,
  case
    when organizations.expires_at is not null and coalesce(plans.grace_period_days, 0) > 0
      then organizations.expires_at + make_interval(days => plans.grace_period_days)
    else null
  end,
  'legacy_backfill'
from public.platform_organizations as organizations
left join public.subscription_plans as plans on plans.id = organizations.plan_id
cross join public.platform_products as products
where exists (
  select 1
  from public.platform_product_features as product_features
  join public.platform_organization_features as organization_features
    on organization_features.organization_id = organizations.organization_id
   and (
     organization_features.module = product_features.module
     or (
       product_features.module = 'Restaurant'
       and organization_features.module like 'Restaurant:%'
     )
   )
   and organization_features.enabled
   and organization_features.access_mode <> 'disabled'
  where product_features.product_slug = products.slug
    and product_features.is_product_entitling_feature
)
on conflict (organization_id, product_slug) do nothing;
