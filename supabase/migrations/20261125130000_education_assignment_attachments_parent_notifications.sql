begin;

create table if not exists public.education_assignment_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null,
  submission_id uuid references public.education_assignment_submissions(id) on delete cascade,
  kind text not null check (kind in ('assignment', 'submission')),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  )),
  file_size bigint not null check (file_size between 1 and 10485760),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, assignment_id)
    references public.education_assignments(org_id, id) on delete cascade,
  check ((kind = 'assignment' and submission_id is null) or (kind = 'submission' and submission_id is not null))
);

create index if not exists education_assignment_attachments_assignment_idx
  on public.education_assignment_attachments (org_id, assignment_id, created_at);
create index if not exists education_assignment_attachments_submission_idx
  on public.education_assignment_attachments (submission_id, created_at)
  where submission_id is not null;

create or replace function public.education_assignment_attachment_can_access(
  p_org_id uuid,
  p_assignment_id uuid,
  p_submission_id uuid default null
) returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.education_assignments assignment
    where assignment.org_id = p_org_id
      and assignment.id = p_assignment_id
      and (
        public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
        or (
          assignment.status = 'published'
          and exists (
            select 1
            from public.education_assignment_targets target
            where target.org_id = assignment.org_id
              and target.assignment_id = assignment.id
              and (
                public.education_current_student_can_access(target.org_id, target.student_id)
                or public.education_current_guardian_can_access_student(target.org_id, target.student_id)
              )
              and (
                p_submission_id is null
                or exists (
                  select 1
                  from public.education_assignment_submissions submission
                  where submission.id = p_submission_id
                    and submission.org_id = target.org_id
                    and submission.assignment_id = target.assignment_id
                    and submission.student_id = target.student_id
                )
              )
          )
        )
      )
  );
$$;

create or replace function public.education_assignment_attachment_storage_can_upload(
  p_folder_names text[]
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  target_org_id uuid;
  target_assignment_id uuid;
  target_student_id uuid;
  target_kind text;
begin
  if auth.uid() is null or coalesce(array_length(p_folder_names, 1), 0) not in (3, 4)
    or p_folder_names[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_folder_names[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  target_org_id := p_folder_names[1]::uuid;
  target_assignment_id := p_folder_names[2]::uuid;
  target_kind := p_folder_names[3];

  if target_kind = 'assignment' and array_length(p_folder_names, 1) = 3 then
    return exists (
      select 1 from public.education_assignments assignment
      where assignment.org_id = target_org_id
        and assignment.id = target_assignment_id
        and public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
    ) and (
      select count(*) < 10 from storage.objects object
      where object.bucket_id = 'education-assignment-attachments'
        and object.name like target_org_id::text || '/' || target_assignment_id::text || '/assignment/%'
    );
  end if;

  if target_kind = 'submission' and array_length(p_folder_names, 1) = 4
    and p_folder_names[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_student_id := p_folder_names[4]::uuid;
    return exists (
      select 1
      from public.education_assignment_targets target
      join public.education_assignments assignment
        on assignment.org_id = target.org_id and assignment.id = target.assignment_id
      where target.org_id = target_org_id
        and target.assignment_id = target_assignment_id
        and target.student_id = target_student_id
        and assignment.status = 'published'
        and public.education_current_student_can_access(target.org_id, target.student_id)
    ) and (
      select count(*) < 5 from storage.objects object
      where object.bucket_id = 'education-assignment-attachments'
        and object.name like target_org_id::text || '/' || target_assignment_id::text
          || '/submission/' || target_student_id::text || '/%'
    );
  end if;

  return false;
end;
$$;

revoke all on function public.education_assignment_attachment_can_access(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.education_assignment_attachment_can_access(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.education_assignment_attachment_storage_can_upload(text[])
  from public, anon;
grant execute on function public.education_assignment_attachment_storage_can_upload(text[])
  to authenticated;

alter table public.education_assignment_attachments enable row level security;
create policy "education assignment attachments authorized reads"
  on public.education_assignment_attachments for select to authenticated
  using (public.education_assignment_attachment_can_access(org_id, assignment_id, submission_id));
revoke all on public.education_assignment_attachments from public, anon, authenticated;
grant select on public.education_assignment_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'education-assignment-attachments',
  'education-assignment-attachments',
  false,
  10485760,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "education assignment attachments upload" on storage.objects;
create policy "education assignment attachments upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'education-assignment-attachments'
    and public.education_assignment_attachment_storage_can_upload(storage.foldername(name))
  );

drop policy if exists "education assignment attachments download" on storage.objects;
create policy "education assignment attachments download"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'education-assignment-attachments'
    and exists (
      select 1
      from public.education_assignment_attachments attachment
      where attachment.storage_path = storage.objects.name
        and public.education_assignment_attachment_can_access(
          attachment.org_id, attachment.assignment_id, attachment.submission_id
        )
    )
  );

drop policy if exists "education assignment attachments cleanup" on storage.objects;
create policy "education assignment attachments cleanup"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'education-assignment-attachments'
    and owner_id = auth.uid()::text
    and not exists (
      select 1 from public.education_assignment_attachments attachment
      where attachment.storage_path = storage.objects.name
    )
  );

create or replace function public.education_assignment_attachment_register(
  p_org_id uuid,
  p_assignment_id uuid,
  p_submission_id uuid,
  p_student_id uuid,
  p_kind text,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attachment_id uuid;
  assignment_row public.education_assignments%rowtype;
  submission_row public.education_assignment_submissions%rowtype;
  expected_path text;
begin
  if auth.uid() is null
    or p_kind is null or p_kind not in ('assignment', 'submission')
    or p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 255
    or position('/' in p_file_name) > 0
    or position(chr(92) in p_file_name) > 0
    or p_file_name ~ '[[:cntrl:]]'
    or p_content_type is null or p_content_type not in (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )
    or p_file_size is null or p_file_size not between 1 and 10485760 then
    raise exception 'Assignment attachment details are invalid.' using errcode = '22023';
  end if;

  select * into assignment_row
  from public.education_assignments assignment
  where assignment.org_id = p_org_id and assignment.id = p_assignment_id;
  if not found then
    raise exception 'The assignment was not found.' using errcode = 'P0002';
  end if;

  if p_kind = 'assignment' then
    if p_submission_id is not null or p_student_id is not null
      or not public.education_current_teacher_can_access_class(p_org_id, assignment_row.class_id) then
      raise exception 'You are not authorized to attach a resource to this assignment.' using errcode = '42501';
    end if;
    expected_path := p_org_id::text || '/' || p_assignment_id::text || '/assignment/';
  else
    if p_submission_id is null or p_student_id is null
      or not public.education_current_student_can_access(p_org_id, p_student_id) then
      raise exception 'You are not authorized to attach a file to this submission.' using errcode = '42501';
    end if;
    select * into submission_row
    from public.education_assignment_submissions submission
    where submission.id = p_submission_id
      and submission.org_id = p_org_id
      and submission.assignment_id = p_assignment_id
      and submission.student_id = p_student_id;
    if not found then
      raise exception 'The submission was not found.' using errcode = 'P0002';
    end if;
    if assignment_row.status <> 'published'
      or (submission_row.graded_at is not null and submission_row.revision_requested_at is null) then
      raise exception 'Files can only be added to an active submission.' using errcode = '42501';
    end if;
    expected_path := p_org_id::text || '/' || p_assignment_id::text || '/submission/' || p_student_id::text || '/';
  end if;

  if p_storage_path is null
    or left(p_storage_path, char_length(expected_path)) <> expected_path
    or p_storage_path !~ (
      '^' || p_org_id::text || '/' || p_assignment_id::text || '/'
      || p_kind || '/' || case when p_kind = 'submission' then p_student_id::text || '/' else '' end
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'education-assignment-attachments'
        and object.name = p_storage_path
        and object.owner_id = auth.uid()::text
    ) then
    raise exception 'The uploaded attachment could not be verified.' using errcode = '22023';
  end if;

  insert into public.education_assignment_attachments (
    org_id, assignment_id, submission_id, kind, file_name,
    content_type, file_size, storage_path, uploaded_by
  ) values (
    p_org_id, p_assignment_id, p_submission_id, p_kind, btrim(p_file_name),
    p_content_type, p_file_size, p_storage_path, auth.uid()
  ) returning id into attachment_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_assignment_attachment_uploaded',
    'education_assignment_attachment', attachment_id,
    jsonb_build_object(
      'assignment_id', p_assignment_id,
      'submission_id', p_submission_id,
      'kind', p_kind,
      'file_name', btrim(p_file_name),
      'file_size', p_file_size
    )
  );
  return attachment_id;
end;
$$;

create or replace function public.education_assignment_attachment_prepare_download(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attachment_row public.education_assignment_attachments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to download assignment attachments.' using errcode = '42501';
  end if;
  select * into attachment_row
  from public.education_assignment_attachments attachment
  where attachment.id = p_attachment_id;
  if not found then
    raise exception 'The assignment attachment was not found.' using errcode = 'P0002';
  end if;
  if not public.education_assignment_attachment_can_access(
    attachment_row.org_id, attachment_row.assignment_id, attachment_row.submission_id
  ) then
    raise exception 'You are not authorized to download this attachment.' using errcode = '42501';
  end if;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    attachment_row.org_id, auth.uid(), 'education_assignment_attachment_downloaded',
    'education_assignment_attachment', attachment_row.id,
    jsonb_build_object('assignment_id', attachment_row.assignment_id, 'file_name', attachment_row.file_name)
  );
  return jsonb_build_object(
    'storage_path', attachment_row.storage_path,
    'file_name', attachment_row.file_name,
    'content_type', attachment_row.content_type
  );
end;
$$;

revoke all on function public.education_assignment_attachment_register(uuid, uuid, uuid, uuid, text, text, text, bigint, text)
  from public, anon;
grant execute on function public.education_assignment_attachment_register(uuid, uuid, uuid, uuid, text, text, text, bigint, text)
  to authenticated;
revoke all on function public.education_assignment_attachment_prepare_download(uuid)
  from public, anon;
grant execute on function public.education_assignment_attachment_prepare_download(uuid)
  to authenticated;

alter table public.education_notifications
  add column if not exists assignment_id uuid,
  add column if not exists assignment_event_key text;
alter table public.education_notifications
  drop constraint if exists education_notifications_notification_type_check;
alter table public.education_notifications
  add constraint education_notifications_notification_type_check
  check (notification_type in (
    'announcement', 'attendance', 'results', 'fees', 'admissions', 'transport', 'assignment'
  ));
alter table public.education_notification_preferences
  drop constraint if exists education_notification_preferences_notification_type_check;
alter table public.education_notification_preferences
  add constraint education_notification_preferences_notification_type_check
  check (notification_type in (
    'announcement', 'attendance', 'results', 'fees', 'admissions', 'transport', 'assignment'
  ));
alter table public.education_notifications
  add constraint education_notifications_assignment_fk
  foreign key (org_id, assignment_id)
  references public.education_assignments(org_id, id) on delete cascade;
create unique index if not exists education_notifications_assignment_event_unique_idx
  on public.education_notifications (org_id, user_id, assignment_event_key)
  where assignment_event_key is not null;

create or replace function public.education_notification_set_preference(
  p_org_id uuid,
  p_notification_type text,
  p_in_app_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_value boolean;
begin
  if auth.uid() is null or p_notification_type is null
    or p_notification_type not in (
      'announcement', 'attendance', 'results', 'fees', 'admissions', 'transport', 'assignment'
    )
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

create or replace function public.education_queue_assignment_target_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.education_notifications (
    org_id, branch_id, user_id, notification_type, title, message,
    assignment_id, assignment_event_key
  )
  select distinct
    assignment.org_id,
    classroom.branch_id,
    guardian.user_id,
    'assignment',
    'New homework assignment',
    'A linked student has been assigned "' || assignment.title || '", due ' || assignment.due_on::text || '.',
    assignment.id,
    'published:' || assignment.id::text || ':' || new.student_id::text
  from public.education_assignments assignment
  join public.education_classes classroom
    on classroom.org_id = assignment.org_id and classroom.id = assignment.class_id
  join public.education_student_guardians relationship
    on relationship.org_id = new.org_id
    and relationship.student_id = new.student_id
    and relationship.branch_id = classroom.branch_id
    and relationship.status = 'verified'
  join public.education_guardians guardian
    on guardian.org_id = relationship.org_id
    and guardian.id = relationship.guardian_id
    and guardian.status = 'active'
    and guardian.user_id is not null
  where assignment.org_id = new.org_id
    and assignment.id = new.assignment_id
    and assignment.status = 'published'
    and not exists (
      select 1 from public.education_notification_preferences preference
      where preference.org_id = assignment.org_id
        and preference.user_id = guardian.user_id
        and preference.notification_type = 'assignment'
        and preference.in_app_enabled = false
    )
  on conflict (org_id, user_id, assignment_event_key)
    where assignment_event_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists education_assignment_target_parent_notifications
  on public.education_assignment_targets;
create trigger education_assignment_target_parent_notifications
  after insert on public.education_assignment_targets
  for each row execute function public.education_queue_assignment_target_notifications();

create or replace function public.education_queue_assignment_submission_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_title text;
  event_message text;
  event_key text;
  target_assignment_id uuid;
  target_branch_id uuid;
begin
  if tg_op = 'INSERT' then
    event_title := 'Assignment submitted';
    event_message := 'A linked student submitted an assignment.';
    event_key := 'submitted:' || new.id::text || ':' || new.submitted_at::text;
  elsif new.revision_requested_at is distinct from old.revision_requested_at
    and new.revision_requested_at is not null then
    event_title := 'Assignment revision requested';
    event_message := 'A teacher has requested a revision to a linked student''s assignment.';
    event_key := 'revision:' || new.id::text || ':' || new.revision_requested_at::text;
  elsif new.graded_at is distinct from old.graded_at and new.graded_at is not null then
    event_title := 'Assignment graded';
    event_message := 'A linked student''s assignment has been graded.';
    event_key := 'graded:' || new.id::text || ':' || new.graded_at::text;
  elsif new.submitted_at is distinct from old.submitted_at then
    event_title := 'Assignment resubmitted';
    event_message := 'A linked student resubmitted an assignment.';
    event_key := 'resubmitted:' || new.id::text || ':' || new.submitted_at::text;
  else
    return new;
  end if;

  select assignment.id, classroom.branch_id
    into target_assignment_id, target_branch_id
  from public.education_assignments assignment
  join public.education_classes classroom
    on classroom.org_id = assignment.org_id and classroom.id = assignment.class_id
  where assignment.org_id = new.org_id and assignment.id = new.assignment_id;
  if target_assignment_id is null then
    return new;
  end if;

  insert into public.education_notifications (
    org_id, branch_id, user_id, notification_type, title, message,
    assignment_id, assignment_event_key
  )
  select distinct
    new.org_id, target_branch_id, guardian.user_id, 'assignment',
    event_title, event_message, new.assignment_id, event_key
  from public.education_student_guardians relationship
  join public.education_guardians guardian
    on guardian.org_id = relationship.org_id
    and guardian.id = relationship.guardian_id
    and guardian.status = 'active'
    and guardian.user_id is not null
  where relationship.org_id = new.org_id
    and relationship.student_id = new.student_id
    and relationship.branch_id = target_branch_id
    and relationship.status = 'verified'
    and not exists (
      select 1 from public.education_notification_preferences preference
      where preference.org_id = new.org_id
        and preference.user_id = guardian.user_id
        and preference.notification_type = 'assignment'
        and preference.in_app_enabled = false
    )
  on conflict (org_id, user_id, assignment_event_key)
    where assignment_event_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists education_assignment_submission_parent_notifications
  on public.education_assignment_submissions;
create trigger education_assignment_submission_parent_notifications
  after insert or update of submitted_at, graded_at, revision_requested_at
  on public.education_assignment_submissions
  for each row execute function public.education_queue_assignment_submission_notifications();

revoke all on function public.education_queue_assignment_target_notifications()
  from public, anon, authenticated;
revoke all on function public.education_queue_assignment_submission_notifications()
  from public, anon, authenticated;
revoke all on function public.education_notification_set_preference(uuid, text, boolean)
  from public, anon;
grant execute on function public.education_notification_set_preference(uuid, text, boolean)
  to authenticated;

commit;
