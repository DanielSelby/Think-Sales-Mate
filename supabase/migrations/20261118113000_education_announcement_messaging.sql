begin;

alter table public.education_notification_preferences
  add column if not exists email_enabled boolean not null default false,
  add column if not exists sms_enabled boolean not null default false;

create table if not exists public.education_announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  announcement_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'unconfigured', 'skipped')),
  provider text check (provider is null or char_length(provider) <= 80),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  claimed_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, announcement_id, recipient_user_id, channel),
  foreign key (org_id, branch_id, announcement_id)
    references public.education_communications(org_id, branch_id, id) on delete cascade,
  check ((status = 'sent' and sent_at is not null) or status <> 'sent')
);

create index if not exists education_announcement_deliveries_status_idx
  on public.education_announcement_deliveries (org_id, announcement_id, status, channel);

alter table public.education_announcement_deliveries enable row level security;
revoke all on public.education_announcement_deliveries from anon, authenticated;

create or replace function public.education_announcement_delivery_summary(
  p_org_id uuid,
  p_announcement_ids uuid[]
) returns table (
  announcement_id uuid,
  channel text,
  status text,
  delivery_count bigint
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    delivery.announcement_id,
    delivery.channel,
    delivery.status,
    count(*) as delivery_count
  from public.education_announcement_deliveries delivery
  where auth.uid() is not null
    and p_org_id is not null
    and p_announcement_ids is not null
    and cardinality(p_announcement_ids) <= 100
    and delivery.org_id = p_org_id
    and delivery.announcement_id = any (p_announcement_ids)
    and public.education_can_access_branch(
      delivery.org_id,
      delivery.branch_id,
      'education_communication',
      'view'
    )
  group by delivery.announcement_id, delivery.channel, delivery.status;
$$;

create or replace function public.education_announcement_recipient_contacts(
  p_org_id uuid,
  p_branch_id uuid,
  p_audience text
) returns table (recipient_user_id uuid, email text, phone text)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with candidates as (
    select
      staff.user_id as user_id,
      staff.email as email,
      staff.phone as phone,
      case when staff.branch_id = p_branch_id then 1 else 2 end as priority
    from public.education_staff staff
    join public.organization_members member
      on member.org_id = staff.org_id
      and member.user_id = staff.user_id
      and member.status = 'active'
    join public.education_communications communication
      on communication.org_id = staff.org_id
      and communication.branch_id = p_branch_id
      and communication.audience = p_audience
    where p_audience in ('all', 'staff')
      and staff.org_id = p_org_id
      and staff.status = 'active'
      and staff.user_id is not null
      and exists (
        select 1
        from public.education_member_branch_scopes scope
        where scope.org_id = member.org_id
          and scope.user_id = member.user_id
          and (
            scope.scope_type = 'organization'
            or (scope.scope_type = 'branch' and scope.branch_id = p_branch_id
              and staff.branch_id = p_branch_id)
          )
      )

    union all

    select student.user_id, student.email, student.phone, 3
    from public.education_students student
    join public.education_communications communication
      on communication.org_id = student.org_id
      and communication.branch_id = student.branch_id
      and communication.audience = p_audience
    where p_audience in ('all', 'students')
      and student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.status = 'active'
      and student.user_id is not null

    union all

    select guardian.user_id, guardian.email, guardian.phone, 4
    from public.education_guardians guardian
    join public.education_student_guardians relationship
      on relationship.org_id = guardian.org_id
      and relationship.guardian_id = guardian.id
      and relationship.branch_id = p_branch_id
      and relationship.status = 'verified'
    join public.education_students student
      on student.org_id = relationship.org_id
      and student.branch_id = relationship.branch_id
      and student.id = relationship.student_id
      and student.status = 'active'
    join public.education_communications communication
      on communication.org_id = student.org_id
      and communication.branch_id = student.branch_id
      and communication.audience = p_audience
    where p_audience in ('all', 'guardians')
      and guardian.org_id = p_org_id
      and guardian.status = 'active'
      and guardian.user_id is not null
  ),
  recipients as (
    select distinct candidates.user_id
    from candidates
  )
  select
    recipients.user_id,
    (
      select nullif(btrim(candidate.email), '')
      from candidates candidate
      where candidate.user_id = recipients.user_id
        and nullif(btrim(candidate.email), '') is not null
      order by candidate.priority
      limit 1
    ),
    (
      select nullif(btrim(candidate.phone), '')
      from candidates candidate
      where candidate.user_id = recipients.user_id
        and nullif(btrim(candidate.phone), '') is not null
      order by candidate.priority
      limit 1
    )
  from recipients
  where exists (
    select 1
    from public.organizations organization
    join public.education_campuses campus
      on campus.org_id = organization.id
      and campus.branch_id = p_branch_id
      and campus.status = 'active'
    where organization.id = p_org_id
      and organization.registration_status = 'approved'
  );
$$;

revoke all on function public.education_announcement_recipient_contacts(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.education_announcement_user_can_manage_preferences(
  p_org_id uuid
) returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organizations organization
    join public.organization_product_entitlements entitlement
      on entitlement.organization_id = organization.id
      and entitlement.product_slug = 'think-education'
      and entitlement.registration_state = 'approved'
      and (
        (
          entitlement.status in ('active', 'trial')
          and entitlement.organization_status in ('active', 'trial')
          and (entitlement.current_period_end is null or entitlement.current_period_end > now())
          and (entitlement.status <> 'trial'
            or entitlement.trial_ends_at is null
            or entitlement.trial_ends_at > now())
          and not (
            entitlement.cancel_at_period_end
            and coalesce(entitlement.current_period_end, entitlement.trial_ends_at) <= now()
          )
        )
        or (
          entitlement.grace_ends_at is not null
          and entitlement.grace_ends_at > now()
          and entitlement.organization_status in ('active', 'trial', 'expired')
          and (
            entitlement.status in ('grace', 'expired')
            or (
              entitlement.status in ('active', 'trial')
              and (
                (entitlement.current_period_end is not null and entitlement.current_period_end <= now())
                or (entitlement.status = 'trial' and entitlement.trial_ends_at is not null
                  and entitlement.trial_ends_at <= now())
              )
            )
          )
          and not (
            entitlement.cancel_at_period_end
            and coalesce(entitlement.current_period_end, entitlement.trial_ends_at) <= now()
          )
        )
      )
    where organization.id = p_org_id
      and organization.registration_status = 'approved'
      and (
        exists (
          select 1
          from public.organization_members member
          join public.education_member_branch_scopes scope
            on scope.org_id = member.org_id
            and scope.user_id = member.user_id
          where member.org_id = p_org_id
            and member.user_id = auth.uid()
            and member.status = 'active'
            and (scope.scope_type = 'organization' or scope.branch_id is not null)
        )
        or exists (
          select 1
          from public.education_guardians guardian
          join public.education_student_guardians relationship
            on relationship.org_id = guardian.org_id
            and relationship.guardian_id = guardian.id
            and relationship.status = 'verified'
          join public.education_students student
            on student.org_id = relationship.org_id
            and student.branch_id = relationship.branch_id
            and student.id = relationship.student_id
            and student.status = 'active'
          where guardian.org_id = p_org_id
            and guardian.user_id = auth.uid()
            and guardian.status = 'active'
        )
        or exists (
          select 1
          from public.education_students student
          join public.education_campuses campus
            on campus.org_id = student.org_id
            and campus.branch_id = student.branch_id
            and campus.status = 'active'
          where student.org_id = p_org_id
            and student.user_id = auth.uid()
            and student.status = 'active'
        )
      )
  );
$$;

revoke all on function public.education_announcement_user_can_manage_preferences(uuid)
  from public, anon;
grant execute on function public.education_announcement_user_can_manage_preferences(uuid)
  to authenticated;

create or replace function public.education_announcement_get_delivery_preferences()
returns table (
  org_id uuid,
  organization_name text,
  email_enabled boolean,
  sms_enabled boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    organization.id,
    organization.name,
    coalesce(preference.email_enabled, false),
    coalesce(preference.sms_enabled, false)
  from public.organizations organization
  left join public.education_notification_preferences preference
    on preference.org_id = organization.id
    and preference.user_id = auth.uid()
    and preference.notification_type = 'announcement'
  where auth.uid() is not null
    and public.education_announcement_user_can_manage_preferences(organization.id)
  order by organization.name;
$$;

create policy "education announcement delivery preferences read own"
  on public.education_notification_preferences for select to authenticated
  using (
    user_id = auth.uid()
    and notification_type = 'announcement'
    and public.education_announcement_user_can_manage_preferences(org_id)
  );

create or replace function public.education_queue_announcement_outbound_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_count integer;
begin
  if old.status <> 'draft' or new.status <> 'published' then
    return new;
  end if;

  insert into public.education_announcement_deliveries (
    org_id, branch_id, announcement_id, recipient_user_id, channel, status, last_error
  )
  select
    new.org_id,
    new.branch_id,
    new.id,
    recipient.recipient_user_id,
    channel.channel,
    case when channel.has_contact then 'pending' else 'skipped' end,
    case when channel.has_contact then null else 'No on-file contact for this channel.' end
  from public.education_announcement_recipient_contacts(
    new.org_id, new.branch_id, new.audience
  ) recipient
  join public.education_notification_preferences preference
    on preference.org_id = new.org_id
    and preference.user_id = recipient.recipient_user_id
    and preference.notification_type = 'announcement'
  cross join lateral (
    values
      ('email'::text, preference.email_enabled, recipient.email is not null),
      ('sms'::text, preference.sms_enabled, recipient.phone is not null)
  ) as channel(channel, enabled, has_contact)
  where channel.enabled
  on conflict (org_id, announcement_id, recipient_user_id, channel) do nothing;
  get diagnostics created_count = row_count;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.org_id,
    auth.uid(),
    'education_announcement_outbound_delivery_queued',
    'education_communication',
    new.id,
    jsonb_build_object('branch_id', new.branch_id, 'delivery_count', created_count)
  );

  return new;
end;
$$;

drop trigger if exists education_announcement_outbound_deliveries_after_publish
  on public.education_communications;
create trigger education_announcement_outbound_deliveries_after_publish
  after update of status on public.education_communications
  for each row
  when (old.status = 'draft' and new.status = 'published')
  execute function public.education_queue_announcement_outbound_deliveries();

revoke all on function public.education_queue_announcement_outbound_deliveries()
  from public, anon, authenticated;

create or replace function public.education_notification_set_delivery_preference(
  p_org_id uuid,
  p_channel text,
  p_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_value boolean;
begin
  if auth.uid() is null or p_org_id is null
    or p_channel is null or p_channel not in ('email', 'sms') or p_enabled is null then
    raise exception 'Announcement delivery preference is invalid.' using errcode = '22023';
  end if;
  if not public.education_announcement_user_can_manage_preferences(p_org_id) then
    raise exception 'An active Think Education staff or verified guardian account is required.'
      using errcode = '42501';
  end if;

  select case when p_channel = 'email' then preference.email_enabled else preference.sms_enabled end
    into previous_value
  from public.education_notification_preferences preference
  where preference.org_id = p_org_id
    and preference.user_id = auth.uid()
    and preference.notification_type = 'announcement'
  for update;

  insert into public.education_notification_preferences as current_preference (
    org_id, user_id, notification_type, email_enabled, sms_enabled, updated_at
  ) values (
    p_org_id, auth.uid(), 'announcement',
    p_channel = 'email' and p_enabled,
    p_channel = 'sms' and p_enabled,
    now()
  )
  on conflict (org_id, user_id, notification_type)
  do update set
    email_enabled = case when p_channel = 'email' then excluded.email_enabled else current_preference.email_enabled end,
    sms_enabled = case when p_channel = 'sms' then excluded.sms_enabled else current_preference.sms_enabled end,
    updated_at = now();

  if previous_value is distinct from p_enabled then
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_org_id,
      auth.uid(),
      'education_announcement_delivery_preference_updated',
      'education_notification_preference',
      null,
      jsonb_build_object(
        'notification_type', 'announcement',
        'channel', p_channel,
        'enabled', p_enabled
      )
    );
  end if;
  return true;
end;
$$;

create or replace function public.education_announcement_claim_delivery_jobs(
  p_actor_id uuid,
  p_announcement_id uuid,
  p_retry_failed boolean default false
) returns table (
  delivery_id uuid,
  channel text,
  recipient text,
  subject text,
  campus_name text,
  content text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  announcement_row public.education_communications%rowtype;
begin
  if p_actor_id is null or p_announcement_id is null then
    raise exception 'Announcement delivery request is invalid.' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  select communication.* into announcement_row
  from public.education_communications communication
  where communication.id = p_announcement_id
    and communication.status = 'published'
  for share;
  if not found then
    raise exception 'The published announcement was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    announcement_row.org_id,
    announcement_row.branch_id,
    'education_communication',
    'publish'
  ) then
    raise exception 'You are not authorized to deliver this announcement.' using errcode = '42501';
  end if;

  update public.education_announcement_deliveries delivery
  set status = 'skipped',
      last_error = 'Recipient eligibility, contact, or consent changed before delivery.',
      updated_at = now()
  where delivery.org_id = announcement_row.org_id
    and delivery.announcement_id = announcement_row.id
    and (
      delivery.status = 'pending'
      or (p_retry_failed and delivery.status in ('failed', 'unconfigured'))
    )
    and not exists (
      select 1
      from public.education_announcement_recipient_contacts(
        announcement_row.org_id,
        announcement_row.branch_id,
        announcement_row.audience
      ) recipient
      join public.education_notification_preferences preference
        on preference.org_id = announcement_row.org_id
        and preference.user_id = recipient.recipient_user_id
        and preference.notification_type = 'announcement'
      where recipient.recipient_user_id = delivery.recipient_user_id
        and (
          (delivery.channel = 'email' and preference.email_enabled and recipient.email is not null)
          or (delivery.channel = 'sms' and preference.sms_enabled and recipient.phone is not null)
        )
    );

  return query
  with eligible as (
    select
      recipient.recipient_user_id,
      recipient.email,
      recipient.phone
    from public.education_announcement_recipient_contacts(
      announcement_row.org_id,
      announcement_row.branch_id,
      announcement_row.audience
    ) recipient
  ),
  claimable as (
    select
      delivery.id,
      delivery.channel,
      case when delivery.channel = 'email' then eligible.email else eligible.phone end as target,
      announcement_row.title as message_subject,
      location.name as message_campus,
      announcement_row.body as message_content
    from public.education_announcement_deliveries delivery
    join public.business_locations location
      on location.org_id = announcement_row.org_id
      and location.id = announcement_row.branch_id
    join eligible
      on eligible.recipient_user_id = delivery.recipient_user_id
    join public.education_notification_preferences preference
      on preference.org_id = delivery.org_id
      and preference.user_id = delivery.recipient_user_id
      and preference.notification_type = 'announcement'
    where delivery.org_id = announcement_row.org_id
      and delivery.announcement_id = announcement_row.id
      and (
        delivery.status = 'pending'
        or (p_retry_failed and delivery.status in ('failed', 'unconfigured'))
      )
      and (
        (delivery.channel = 'email' and preference.email_enabled and eligible.email is not null)
        or (delivery.channel = 'sms' and preference.sms_enabled and eligible.phone is not null)
      )
    order by delivery.created_at, delivery.id
    limit 25
      for update of delivery skip locked
  ),
  claimed as (
    update public.education_announcement_deliveries delivery
    set status = 'sending',
        attempts = delivery.attempts + 1,
        claimed_by = p_actor_id,
        last_error = null,
        updated_at = now()
    from claimable
    where delivery.id = claimable.id
      and delivery.status in ('pending', 'failed', 'unconfigured')
    returning delivery.id, delivery.channel
  )
  select
    claimed.id,
    claimed.channel,
    claimable.target,
    claimable.message_subject,
    claimable.message_campus,
    claimable.message_content
  from claimed
  join claimable on claimable.id = claimed.id;
end;
$$;

create or replace function public.education_announcement_complete_delivery_job(
  p_actor_id uuid,
  p_delivery_id uuid,
  p_status text,
  p_provider text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_row public.education_announcement_deliveries%rowtype;
begin
  if p_actor_id is null or p_delivery_id is null
    or p_status is null or p_status not in ('sent', 'failed', 'unconfigured')
    or (p_provider is not null and char_length(p_provider) > 80)
    or (p_error is not null and char_length(p_error) > 300) then
    raise exception 'Announcement delivery result is invalid.' using errcode = '22023';
  end if;

  select delivery.* into delivery_row
  from public.education_announcement_deliveries delivery
  where delivery.id = p_delivery_id
    and delivery.status = 'sending'
    and delivery.claimed_by = p_actor_id
  for update;
  if not found then
    raise exception 'The claimed announcement delivery was not found.' using errcode = 'P0002';
  end if;

  update public.education_announcement_deliveries
  set status = p_status,
      provider = nullif(p_provider, ''),
      last_error = nullif(p_error, ''),
      sent_at = case when p_status = 'sent' then now() else null end,
      updated_at = now()
  where id = p_delivery_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    delivery_row.org_id,
    p_actor_id,
    'education_announcement_outbound_delivery_' || p_status,
    'education_announcement_delivery',
    delivery_row.id,
    jsonb_build_object(
      'branch_id', delivery_row.branch_id,
      'announcement_id', delivery_row.announcement_id,
      'channel', delivery_row.channel,
      'provider', nullif(p_provider, ''),
      'attempt', delivery_row.attempts
    )
  );
  return true;
end;
$$;

revoke all on function public.education_notification_set_delivery_preference(uuid, text, boolean)
  from public, anon;
grant execute on function public.education_notification_set_delivery_preference(uuid, text, boolean)
  to authenticated;
revoke all on function public.education_announcement_delivery_summary(uuid, uuid[])
  from public, anon;
grant execute on function public.education_announcement_delivery_summary(uuid, uuid[])
  to authenticated;
revoke all on function public.education_announcement_get_delivery_preferences()
  from public, anon;
grant execute on function public.education_announcement_get_delivery_preferences()
  to authenticated;
revoke all on function public.education_announcement_claim_delivery_jobs(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.education_announcement_claim_delivery_jobs(uuid, uuid, boolean)
  to service_role;
revoke all on function public.education_announcement_complete_delivery_job(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.education_announcement_complete_delivery_job(uuid, uuid, text, text, text)
  to service_role;

commit;
