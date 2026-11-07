create table if not exists public.service_status_notification_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.service_status_notification_settings enable row level security;
revoke all on public.service_status_notification_settings from public, anon, authenticated;
grant select, insert, update on public.service_status_notification_settings to authenticated;

create policy "service status notification settings: service viewers can read"
  on public.service_status_notification_settings for select
  using (
    public.is_org_member(org_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );
create policy "service status notification settings: settings editors can insert"
  on public.service_status_notification_settings for insert
  with check (
    public.is_org_member(org_id)
    and public.has_org_permission(org_id, 'settings', 'edit')
    and updated_by = auth.uid()
  );
create policy "service status notification settings: settings editors can update"
  on public.service_status_notification_settings for update
  using (
    public.is_org_member(org_id)
    and public.has_org_permission(org_id, 'settings', 'edit')
  )
  with check (
    public.is_org_member(org_id)
    and public.has_org_permission(org_id, 'settings', 'edit')
    and updated_by = auth.uid()
  );

create table if not exists public.service_job_status_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  status text not null check (status in (
    'received',
    'awaiting_customer_approval',
    'in_progress',
    'awaiting_parts',
    'ready_for_collection',
    'awaiting_payment'
  )),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1),
  provider text,
  result_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete cascade,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict
);

create index if not exists service_job_status_notification_pending_idx
  on public.service_job_status_notification_outbox (created_at, id)
  where delivery_status = 'pending';

alter table public.service_job_status_notification_outbox enable row level security;
revoke all on public.service_job_status_notification_outbox from public, anon, authenticated;
grant all on public.service_job_status_notification_outbox to service_role;
grant select on public.service_job_status_notification_outbox to authenticated;

create policy "service status notifications: service viewers can read branch results"
  on public.service_job_status_notification_outbox for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );

create or replace function public.enqueue_service_job_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in (
    'received',
    'awaiting_customer_approval',
    'in_progress',
    'awaiting_parts',
    'ready_for_collection',
    'awaiting_payment'
  ) then
    return new;
  end if;

  if cardinality(new.customer_update_channels) = 0
     or not exists (
       select 1
       from public.service_status_notification_settings settings
       where settings.org_id = new.org_id
         and settings.enabled
     ) then
    return new;
  end if;

  insert into public.service_job_status_notification_outbox (
    org_id, location_id, job_id, status
  ) values (
    new.org_id, new.location_id, new.id, new.status
  );
  return new;
end;
$$;

revoke all on function public.enqueue_service_job_status_notification() from public, anon, authenticated;

create or replace function public.prevent_service_job_update_consent_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.customer_update_channels is distinct from old.customer_update_channels
     or new.customer_update_consent_recorded_at is distinct from old.customer_update_consent_recorded_at
     or new.customer_update_consent_recorded_by is distinct from old.customer_update_consent_recorded_by then
    raise exception 'Repair update consent is recorded at intake; manage future opt-outs in customer messaging preferences';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_service_job_update_consent_changes() from public, anon, authenticated;

drop trigger if exists service_job_update_consent_immutable on public.service_jobs;
create trigger service_job_update_consent_immutable
  before update on public.service_jobs
  for each row execute function public.prevent_service_job_update_consent_changes();

drop trigger if exists service_job_status_notification_created on public.service_jobs;
create trigger service_job_status_notification_created
  after insert on public.service_jobs
  for each row execute function public.enqueue_service_job_status_notification();

drop trigger if exists service_job_status_notification_changed on public.service_jobs;
create trigger service_job_status_notification_changed
  after update of status on public.service_jobs
  for each row
  when (old.status is distinct from new.status)
  execute function public.enqueue_service_job_status_notification();

create or replace function public.claim_service_job_status_notifications(p_batch_limit integer)
returns table (
  id uuid,
  org_id uuid,
  location_id uuid,
  job_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_batch_limit is null or p_batch_limit not between 1 and 100 then
    raise exception 'Notification batch size must be between 1 and 100';
  end if;

  return query
  with candidates as (
    select notification.id
    from public.service_job_status_notification_outbox notification
    where notification.delivery_status = 'pending'
    order by notification.created_at, notification.id
    limit p_batch_limit
    for update skip locked
  )
  update public.service_job_status_notification_outbox notification
  set delivery_status = 'processing',
      attempt_count = 1
  from candidates
  where notification.id = candidates.id
  returning notification.id, notification.org_id, notification.location_id,
    notification.job_id, notification.status;
end;
$$;

revoke all on function public.claim_service_job_status_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_service_job_status_notifications(integer) to service_role;
