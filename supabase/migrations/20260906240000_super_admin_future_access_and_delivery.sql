begin;

-- Super Admin access is derived from organization ownership, not from a
-- snapshot of branch IDs. New branches and future branch-scoped records are
-- therefore available automatically.
create or replace function public.can_access_org_location(
  target_org_id uuid,
  target_location_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.org_id
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        o.created_by = auth.uid()
        or m.role = 'owner'
        or m.branch_scope = 'all'
        or (
          target_location_id is not null
          and (m.location_id = target_location_id or target_location_id = any(m.secondary_location_ids))
        )
      )
  );
$$;

alter table public.communication_automations
  add column if not exists fallback_email boolean not null default true,
  add column if not exists use_transaction_phone boolean not null default true;

alter table public.communication_automations
  alter column channel set default 'SMS';

alter table public.communication_message_history
  add column if not exists delivery_provider text,
  add column if not exists delivery_recipient text,
  add column if not exists failure_reason text;

commit;
