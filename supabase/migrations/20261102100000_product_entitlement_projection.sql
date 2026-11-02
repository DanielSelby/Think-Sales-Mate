create table if not exists public.organization_product_entitlements (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_slug text not null,
  plan_id uuid,
  status text not null check (status in ('pending', 'trial', 'active', 'grace', 'suspended', 'expired', 'cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  source text not null,
  source_version bigint not null check (source_version > 0),
  source_updated_at timestamptz not null,
  organization_status text not null check (organization_status in ('active', 'trial', 'pending', 'rejected', 'suspended', 'expired')),
  registration_state text not null check (registration_state in ('pending', 'information_requested', 'approved', 'rejected')),
  organization_expires_at timestamptz,
  projected_at timestamptz not null default now(),
  primary key (organization_id, product_slug)
);

create index if not exists organization_product_entitlements_product_status_idx
  on public.organization_product_entitlements (product_slug, status);

alter table public.organization_product_entitlements enable row level security;

create or replace function public.apply_product_entitlement_projection(
  p_organization_id uuid,
  p_product_slug text,
  p_plan_id uuid,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_trial_ends_at timestamptz,
  p_grace_ends_at timestamptz,
  p_cancel_at_period_end boolean,
  p_cancelled_at timestamptz,
  p_source text,
  p_source_version bigint,
  p_source_updated_at timestamptz,
  p_organization_status text,
  p_registration_state text,
  p_organization_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role is required to update product entitlement projections';
  end if;
  if p_status not in ('pending', 'trial', 'active', 'grace', 'suspended', 'expired', 'cancelled')
     or p_source_version <= 0
     or p_organization_status not in ('active', 'trial', 'pending', 'rejected', 'suspended', 'expired')
     or p_registration_state not in ('pending', 'information_requested', 'approved', 'rejected') then
    raise exception 'invalid product entitlement projection';
  end if;

  insert into public.organization_product_entitlements (
    organization_id,
    product_slug,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    trial_ends_at,
    grace_ends_at,
    cancel_at_period_end,
    cancelled_at,
    source,
    source_version,
    source_updated_at,
    organization_status,
    registration_state,
    organization_expires_at,
    projected_at
  )
  values (
    p_organization_id,
    p_product_slug,
    p_plan_id,
    p_status,
    p_current_period_start,
    p_current_period_end,
    p_trial_ends_at,
    p_grace_ends_at,
    p_cancel_at_period_end,
    p_cancelled_at,
    p_source,
    p_source_version,
    p_source_updated_at,
    p_organization_status,
    p_registration_state,
    p_organization_expires_at,
    now()
  )
  on conflict (organization_id, product_slug) do update
  set
    plan_id = excluded.plan_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    trial_ends_at = excluded.trial_ends_at,
    grace_ends_at = excluded.grace_ends_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    cancelled_at = excluded.cancelled_at,
    source = excluded.source,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    organization_status = excluded.organization_status,
    registration_state = excluded.registration_state,
    organization_expires_at = excluded.organization_expires_at,
    projected_at = now()
  where public.organization_product_entitlements.source_version < excluded.source_version;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.apply_product_entitlement_projection(
  uuid, text, uuid, text, timestamptz, timestamptz, timestamptz, timestamptz,
  boolean, timestamptz, text, bigint, timestamptz, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_product_entitlement_projection(
  uuid, text, uuid, text, timestamptz, timestamptz, timestamptz, timestamptz,
  boolean, timestamptz, text, bigint, timestamptz, text, text, timestamptz
) to service_role;

create or replace function public.has_product_access(
  p_organization_id uuid,
  p_product_slug text,
  p_require_write boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_product_entitlements as entitlement
    where entitlement.organization_id = p_organization_id
      and entitlement.product_slug = p_product_slug
      and public.is_org_member(p_organization_id)
      and entitlement.registration_state = 'approved'
      and (
        (
          entitlement.status in ('active', 'trial')
          and entitlement.organization_status in ('active', 'trial')
          and (entitlement.current_period_end is null or entitlement.current_period_end > now())
          and (
            entitlement.status <> 'trial'
            or entitlement.trial_ends_at is null
            or entitlement.trial_ends_at > now()
          )
          and not (
            entitlement.cancel_at_period_end
            and (
              coalesce(
                entitlement.current_period_end,
                case when entitlement.status = 'trial' then entitlement.trial_ends_at end
              ) is null
              or coalesce(
                entitlement.current_period_end,
                case when entitlement.status = 'trial' then entitlement.trial_ends_at end
              ) <= now()
            )
          )
        )
        or (
          not coalesce(p_require_write, true)
          and entitlement.grace_ends_at is not null
          and entitlement.grace_ends_at > now()
          and entitlement.organization_status in ('active', 'trial', 'expired')
          and (
            entitlement.status in ('grace', 'expired')
            or (
              entitlement.status in ('active', 'trial')
              and (
                (entitlement.current_period_end is not null and entitlement.current_period_end <= now())
                or (entitlement.status = 'trial' and entitlement.trial_ends_at is not null and entitlement.trial_ends_at <= now())
              )
            )
          )
          and not (
            entitlement.cancel_at_period_end
            and (
              coalesce(
                entitlement.current_period_end,
                case when entitlement.status = 'trial' then entitlement.trial_ends_at end
              ) is null
              or coalesce(
                entitlement.current_period_end,
                case when entitlement.status = 'trial' then entitlement.trial_ends_at end
              ) <= now()
            )
          )
        )
      )
  );
$$;

revoke all on function public.has_product_access(uuid, text, boolean) from public, anon;
grant execute on function public.has_product_access(uuid, text, boolean) to authenticated, service_role;
