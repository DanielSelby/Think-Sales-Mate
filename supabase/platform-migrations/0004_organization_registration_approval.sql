alter table public.platform_organizations
  drop constraint if exists platform_organizations_status_check;

alter table public.platform_organizations
  add constraint platform_organizations_status_check
    check (status in ('active', 'trial', 'pending', 'rejected', 'suspended', 'expired')),
  add column if not exists owner_user_id uuid,
  add column if not exists owner_email text,
  add column if not exists registration_state text not null default 'approved'
    check (registration_state in ('pending', 'information_requested', 'approved', 'rejected')),
  add column if not exists registration_notes text,
  add column if not exists info_requested_at timestamptz,
  add column if not exists reviewed_by uuid references public.platform_admins(id),
  add column if not exists reviewed_at timestamptz;

create table if not exists public.platform_registration_deliveries (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  organization_id uuid,
  recipient text not null,
  subject text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  provider text,
  error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists platform_registration_deliveries_status_created_idx
  on public.platform_registration_deliveries (status, created_at desc);
alter table public.platform_registration_deliveries enable row level security;
create policy "platform admins manage registration deliveries"
  on public.platform_registration_deliveries
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.claim_platform_registration_delivery(
  p_dedupe_key text,
  p_organization_id uuid,
  p_recipient text,
  p_subject text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can claim registration email delivery.';
  end if;

  insert into public.platform_registration_deliveries (
    dedupe_key, organization_id, recipient, subject, content, status, attempts, updated_at
  ) values (
    p_dedupe_key, p_organization_id, p_recipient, p_subject, p_content, 'sending', 1, now()
  )
  on conflict (dedupe_key) do update set
    organization_id = excluded.organization_id,
    recipient = excluded.recipient,
    subject = excluded.subject,
    content = excluded.content,
    status = 'sending',
    attempts = public.platform_registration_deliveries.attempts + 1,
    updated_at = now()
  where public.platform_registration_deliveries.status = 'pending'
     or public.platform_registration_deliveries.status = 'failed'
     or (
       public.platform_registration_deliveries.status = 'sending'
       and public.platform_registration_deliveries.updated_at < now() - interval '5 minutes'
     )
  returning id into claimed_id;

  return claimed_id;
end;
$$;

revoke all on function public.claim_platform_registration_delivery(text, uuid, text, text, text) from public;
grant execute on function public.claim_platform_registration_delivery(text, uuid, text, text, text) to service_role;
