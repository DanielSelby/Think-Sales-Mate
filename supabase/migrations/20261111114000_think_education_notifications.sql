begin;

create table if not exists public.education_notification_preferences (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'announcement', 'attendance', 'results', 'fees', 'admissions', 'transport'
  )),
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, notification_type)
);

create table if not exists public.education_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'announcement', 'attendance', 'results', 'fees', 'admissions', 'transport'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  announcement_id uuid,
  delivery_status text not null default 'delivered' check (delivery_status in ('delivered', 'read')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, announcement_id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete cascade,
  foreign key (org_id, branch_id, announcement_id)
    references public.education_communications(org_id, branch_id, id) on delete cascade,
  check ((delivery_status = 'read' and read_at is not null) or delivery_status <> 'read')
);

create index if not exists education_notifications_user_inbox_idx
  on public.education_notifications (user_id, created_at desc);
create index if not exists education_notifications_unread_idx
  on public.education_notifications (user_id, created_at desc)
  where delivery_status = 'delivered';

alter table public.education_notifications enable row level security;
alter table public.education_notification_preferences enable row level security;

create or replace function public.education_notification_user_is_linked(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and public.has_product_access(target_org_id, 'think-education', false)
    and exists (
      select 1 from public.organizations organization
      where organization.id = target_org_id
        and organization.registration_status = 'approved'
    )
    and (
      public.education_user_has_any_branch_scope(target_org_id)
      or exists (
        select 1
        from public.education_students student
        where student.org_id = target_org_id
          and student.user_id = auth.uid()
          and student.status = 'active'
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
        where guardian.org_id = target_org_id
          and guardian.user_id = auth.uid()
          and guardian.status = 'active'
      )
    );
$$;

create or replace function public.education_notification_user_can_read(
  target_org_id uuid,
  target_branch_id uuid,
  target_user_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and target_user_id = auth.uid()
    and public.has_product_access(target_org_id, 'think-education', false)
    and exists (
      select 1 from public.organizations organization
      where organization.id = target_org_id
        and organization.registration_status = 'approved'
    )
    and (
      (
        public.is_org_member(target_org_id)
        and public.education_user_has_branch_scope(target_org_id, target_branch_id)
      )
      or exists (
        select 1
        from public.education_students student
        where student.org_id = target_org_id
          and student.branch_id = target_branch_id
          and student.user_id = auth.uid()
          and student.status = 'active'
      )
      or exists (
        select 1
        from public.education_guardians guardian
        join public.education_student_guardians relationship
          on relationship.org_id = guardian.org_id
          and relationship.guardian_id = guardian.id
          and relationship.branch_id = target_branch_id
          and relationship.status = 'verified'
        join public.education_students student
          on student.org_id = relationship.org_id
          and student.branch_id = relationship.branch_id
          and student.id = relationship.student_id
          and student.status = 'active'
        where guardian.org_id = target_org_id
          and guardian.user_id = auth.uid()
          and guardian.status = 'active'
      )
    );
$$;

revoke all on function public.education_notification_user_is_linked(uuid) from public, anon;
grant execute on function public.education_notification_user_is_linked(uuid) to authenticated;
revoke all on function public.education_notification_user_can_read(uuid, uuid, uuid) from public, anon;
grant execute on function public.education_notification_user_can_read(uuid, uuid, uuid) to authenticated;

create policy "education notifications read own"
  on public.education_notifications for select to authenticated
  using (public.education_notification_user_can_read(org_id, branch_id, user_id));

create policy "education notification preferences read own"
  on public.education_notification_preferences for select to authenticated
  using (user_id = auth.uid() and public.education_notification_user_is_linked(org_id));

create or replace function public.education_notification_set_preference(
  p_org_id uuid,
  p_notification_type text,
  p_in_app_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_value boolean;
begin
  if auth.uid() is null or p_notification_type is null
    or p_notification_type not in ('announcement', 'attendance', 'results', 'fees', 'admissions', 'transport')
    or p_in_app_enabled is null then
    raise exception 'Notification preference is invalid.' using errcode = '22023';
  end if;
  if not public.education_notification_user_is_linked(p_org_id) then
    raise exception 'You are not linked to this Think Education organization.' using errcode = '42501';
  end if;
  if public.education_user_has_any_branch_scope(p_org_id)
    and not public.has_org_product_permission(
      p_org_id, 'think-education', 'education_notifications', 'edit'
    ) then
    raise exception 'You are not authorized to change notification preferences.' using errcode = '42501';
  end if;

  select preference.in_app_enabled into previous_value
  from public.education_notification_preferences preference
  where preference.org_id = p_org_id
    and preference.user_id = auth.uid()
    and preference.notification_type = p_notification_type
  for update;

  insert into public.education_notification_preferences (
    org_id, user_id, notification_type, in_app_enabled, updated_at
  ) values (
    p_org_id, auth.uid(), p_notification_type, p_in_app_enabled, now()
  )
  on conflict (org_id, user_id, notification_type)
  do update set in_app_enabled = excluded.in_app_enabled, updated_at = now();

  if previous_value is distinct from p_in_app_enabled then
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_org_id, auth.uid(), 'education_notification_preference_updated',
      'education_notification_preference', null,
      jsonb_build_object('notification_type', p_notification_type, 'in_app_enabled', p_in_app_enabled)
    );
  end if;
  return true;
end;
$$;

create or replace function public.education_notification_mark_read(
  p_notification_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_row public.education_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update notifications.' using errcode = '42501';
  end if;
  select * into notification_row
  from public.education_notifications
  where id = p_notification_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'The notification was not found.' using errcode = 'P0002';
  end if;
  if not public.education_notification_user_can_read(
    notification_row.org_id, notification_row.branch_id, notification_row.user_id
  ) then
    raise exception 'You are not authorized to update this notification.' using errcode = '42501';
  end if;
  if notification_row.delivery_status = 'delivered' then
    update public.education_notifications
    set delivery_status = 'read', read_at = now()
    where id = p_notification_id;
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      notification_row.org_id, auth.uid(), 'education_notification_read',
      'education_notification', p_notification_id,
      jsonb_build_object('branch_id', notification_row.branch_id, 'notification_type', notification_row.notification_type)
    );
  end if;
  return true;
end;
$$;

create or replace function public.education_queue_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  created_count integer;
begin
  if old.status <> 'draft' or new.status <> 'published' then
    return new;
  end if;

  with recipients as (
    select member.user_id
    from public.organization_members member
    where new.audience in ('all', 'staff')
      and member.org_id = new.org_id
      and member.status = 'active'
      and exists (
        select 1
        from public.education_member_branch_scopes scope
        where scope.org_id = new.org_id
          and scope.user_id = member.user_id
          and (
            scope.scope_type = 'organization'
            or (scope.scope_type = 'branch' and scope.branch_id = new.branch_id)
          )
      )
    union
    select student.user_id
    from public.education_students student
    where new.audience in ('all', 'students')
      and student.org_id = new.org_id
      and student.branch_id = new.branch_id
      and student.status = 'active'
      and student.user_id is not null
    union
    select guardian.user_id
    from public.education_guardians guardian
    join public.education_student_guardians relationship
      on relationship.org_id = guardian.org_id
      and relationship.guardian_id = guardian.id
      and relationship.branch_id = new.branch_id
      and relationship.status = 'verified'
    join public.education_students student
      on student.org_id = relationship.org_id
      and student.branch_id = relationship.branch_id
      and student.id = relationship.student_id
      and student.status = 'active'
    where new.audience in ('all', 'guardians')
      and guardian.org_id = new.org_id
      and guardian.status = 'active'
      and guardian.user_id is not null
  )
  insert into public.education_notifications (
    org_id, branch_id, user_id, notification_type, title, message, announcement_id
  )
  select new.org_id, new.branch_id, recipient.user_id, 'announcement', new.title, new.body, new.id
  from recipients recipient
  where recipient.user_id is not null
    and not exists (
      select 1
      from public.education_notification_preferences preference
      where preference.org_id = new.org_id
        and preference.user_id = recipient.user_id
        and preference.notification_type = 'announcement'
        and preference.in_app_enabled = false
    )
  on conflict (org_id, user_id, announcement_id) do nothing;
  get diagnostics created_count = row_count;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.org_id, auth.uid(), 'education_announcement_notifications_created',
    'education_communication', new.id,
    jsonb_build_object('branch_id', new.branch_id, 'recipient_count', created_count)
  );
  return new;
end;
$$;

drop trigger if exists education_announcement_notifications_after_publish
  on public.education_communications;
create trigger education_announcement_notifications_after_publish
  after update of status on public.education_communications
  for each row
  when (old.status = 'draft' and new.status = 'published')
  execute function public.education_queue_announcement_notifications();

revoke all on function public.education_notification_set_preference(uuid, text, boolean) from public, anon;
grant execute on function public.education_notification_set_preference(uuid, text, boolean) to authenticated;
revoke all on function public.education_notification_mark_read(uuid) from public, anon;
grant execute on function public.education_notification_mark_read(uuid) to authenticated;
revoke all on function public.education_queue_announcement_notifications() from public, anon, authenticated;

grant select on public.education_notifications to authenticated;
grant select on public.education_notification_preferences to authenticated;
revoke insert, update, delete on public.education_notifications from authenticated;
revoke insert, update, delete on public.education_notification_preferences from authenticated;
revoke all on public.education_notifications from anon;
revoke all on public.education_notification_preferences from anon;

commit;
