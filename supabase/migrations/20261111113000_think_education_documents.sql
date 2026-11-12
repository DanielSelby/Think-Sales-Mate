begin;

create table if not exists public.education_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  category text not null check (category in (
    'student_record', 'admission', 'medical', 'finance', 'staff', 'institutional', 'other'
  )),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  )),
  file_size bigint not null check (file_size between 1 and 15728640),
  storage_path text not null unique,
  retention_until date,
  status text not null default 'active' check (status in ('active', 'archived')),
  uploaded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  check (retention_until is null or retention_until >= created_at::date)
);

create index if not exists education_documents_campus_status_idx
  on public.education_documents (org_id, branch_id, status, created_at desc);
create index if not exists education_documents_student_idx
  on public.education_documents (org_id, branch_id, student_id, created_at desc)
  where student_id is not null;

alter table public.education_documents enable row level security;

create policy "education documents read"
  on public.education_documents for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_documents', 'view'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'education-documents',
  'education-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
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

create or replace function public.education_document_storage_can_access(
  folder_names text[],
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when coalesce(array_length(folder_names, 1), 0) = 2
      and folder_names[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and folder_names[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.education_can_access_branch(folder_names[1]::uuid, folder_names[2]::uuid, 'education_documents', target_action)
    else false
  end;
$$;

revoke all on function public.education_document_storage_can_access(text[], text) from public, anon;
grant execute on function public.education_document_storage_can_access(text[], text) to authenticated;

drop policy if exists "education documents upload" on storage.objects;
create policy "education documents upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'education-documents'
    and public.education_document_storage_can_access(storage.foldername(name), 'create')
  );

drop policy if exists "education documents download" on storage.objects;
create policy "education documents download"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'education-documents'
    and exists (
      select 1
      from public.education_documents document
      where document.storage_path = storage.objects.name
        and document.status = 'active'
        and (document.retention_until is null or document.retention_until >= current_date)
        and public.education_can_access_branch(
          document.org_id, document.branch_id, 'education_documents', 'view'
        )
    )
  );

drop policy if exists "education documents cleanup" on storage.objects;
create policy "education documents cleanup"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'education-documents'
    and (
      (
        owner_id = auth.uid()::text
        and not exists (
          select 1
          from public.education_documents document
          where document.storage_path = storage.objects.name
        )
      )
      or exists (
        select 1
        from public.education_documents document
        where document.storage_path = storage.objects.name
          and document.status = 'archived'
          and document.retention_until < current_date
          and public.education_can_access_branch(
            document.org_id, document.branch_id, 'education_documents', 'delete'
          )
      )
    )
  );

create or replace function public.education_document_register(
  p_org_id uuid,
  p_branch_id uuid,
  p_student_id uuid,
  p_title text,
  p_category text,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_storage_path text,
  p_retention_until date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  document_id uuid;
begin
  if auth.uid() is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_category is null or p_category not in (
      'student_record', 'admission', 'medical', 'finance', 'staff', 'institutional', 'other'
    )
    or p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 255
    or p_content_type is null or p_content_type not in (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )
    or p_file_size is null or p_file_size not between 1 and 15728640
    or p_storage_path is null
    or p_storage_path !~ (
      '^' || p_org_id::text || '/' || p_branch_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    or (p_retention_until is not null and p_retention_until < current_date) then
    raise exception 'Document details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_documents', 'create') then
    raise exception 'You are not authorized to upload documents at this campus.' using errcode = '42501';
  end if;
  if p_student_id is not null and not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = p_student_id
      and student.status = 'active'
  ) then
    raise exception 'The selected student is not active at this campus.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'education-documents'
      and object.name = p_storage_path
      and object.owner_id = auth.uid()::text
  ) then
    raise exception 'The uploaded file could not be verified.' using errcode = '22023';
  end if;

  insert into public.education_documents (
    org_id, branch_id, student_id, title, category, file_name, content_type,
    file_size, storage_path, retention_until, uploaded_by
  ) values (
    p_org_id, p_branch_id, p_student_id, btrim(p_title), p_category, btrim(p_file_name),
    p_content_type, p_file_size, p_storage_path, p_retention_until, auth.uid()
  ) returning id into document_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_uploaded', 'education_document', document_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'student_id', p_student_id,
      'category', p_category,
      'file_name', btrim(p_file_name),
      'file_size', p_file_size,
      'retention_until', p_retention_until
    )
  );
  return document_id;
end;
$$;

create or replace function public.education_document_archive(
  p_org_id uuid,
  p_document_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.education_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to archive a document.' using errcode = '42501';
  end if;
  select * into document_row
  from public.education_documents
  where org_id = p_org_id and id = p_document_id
  for update;
  if not found then
    raise exception 'The document was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, document_row.branch_id, 'education_documents', 'edit') then
    raise exception 'You are not authorized to archive this document.' using errcode = '42501';
  end if;
  if document_row.status <> 'active' then
    raise exception 'This document is already archived.' using errcode = '22023';
  end if;

  update public.education_documents
  set status = 'archived', updated_at = now()
  where org_id = p_org_id and id = p_document_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_archived', 'education_document', p_document_id,
    jsonb_build_object('branch_id', document_row.branch_id, 'student_id', document_row.student_id, 'category', document_row.category)
  );
  return true;
end;
$$;

create or replace function public.education_document_prepare_download(
  p_org_id uuid,
  p_document_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.education_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to download documents.' using errcode = '42501';
  end if;
  select * into document_row
  from public.education_documents
  where org_id = p_org_id and id = p_document_id
  for share;
  if not found or document_row.status <> 'active'
    or (document_row.retention_until is not null and document_row.retention_until < current_date) then
    raise exception 'The document is unavailable or outside its retention period.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, document_row.branch_id, 'education_documents', 'view') then
    raise exception 'You are not authorized to download this document.' using errcode = '42501';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_downloaded', 'education_document', p_document_id,
    jsonb_build_object('branch_id', document_row.branch_id, 'student_id', document_row.student_id, 'file_name', document_row.file_name)
  );
  return jsonb_build_object(
    'storage_path', document_row.storage_path,
    'file_name', document_row.file_name,
    'content_type', document_row.content_type
  );
end;
$$;

create or replace function public.education_document_prepare_purge(
  p_org_id uuid,
  p_document_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.education_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to purge expired documents.' using errcode = '42501';
  end if;
  select * into document_row
  from public.education_documents
  where org_id = p_org_id and id = p_document_id
  for update;
  if not found then
    raise exception 'The document was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, document_row.branch_id, 'education_documents', 'delete') then
    raise exception 'You are not authorized to purge this document.' using errcode = '42501';
  end if;
  if document_row.retention_until is null or document_row.retention_until >= current_date then
    raise exception 'Only documents past their retention date can be purged.' using errcode = '22023';
  end if;

  if document_row.status = 'active' then
    update public.education_documents
    set status = 'archived', updated_at = now()
    where org_id = p_org_id and id = p_document_id;
  end if;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_retention_purge_started', 'education_document', p_document_id,
    jsonb_build_object('branch_id', document_row.branch_id, 'student_id', document_row.student_id, 'retention_until', document_row.retention_until)
  );
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'education-documents'
      and object.name = document_row.storage_path
  ) then
    return document_row.storage_path;
  end if;
  return null;
end;
$$;

create or replace function public.education_document_complete_purge(
  p_org_id uuid,
  p_document_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.education_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to complete document purging.' using errcode = '42501';
  end if;
  select * into document_row
  from public.education_documents
  where org_id = p_org_id and id = p_document_id
  for update;
  if not found then
    raise exception 'The document was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, document_row.branch_id, 'education_documents', 'delete') then
    raise exception 'You are not authorized to complete this purge.' using errcode = '42501';
  end if;
  if document_row.status <> 'archived'
    or document_row.retention_until is null
    or document_row.retention_until >= current_date then
    raise exception 'Only archived documents past their retention date can be purged.' using errcode = '22023';
  end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'education-documents'
      and object.name = document_row.storage_path
  ) then
    raise exception 'The stored file must be removed before its record can be purged.' using errcode = '22023';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_retention_purged', 'education_document', p_document_id,
    jsonb_build_object('branch_id', document_row.branch_id, 'student_id', document_row.student_id, 'file_name', document_row.file_name)
  );
  delete from public.education_documents where org_id = p_org_id and id = p_document_id;
  return true;
end;
$$;

revoke all on function public.education_document_register(uuid, uuid, uuid, text, text, text, text, bigint, text, date) from public, anon;
grant execute on function public.education_document_register(uuid, uuid, uuid, text, text, text, text, bigint, text, date) to authenticated;
revoke all on function public.education_document_archive(uuid, uuid) from public, anon;
grant execute on function public.education_document_archive(uuid, uuid) to authenticated;
revoke all on function public.education_document_prepare_download(uuid, uuid) from public, anon;
grant execute on function public.education_document_prepare_download(uuid, uuid) to authenticated;
revoke all on function public.education_document_prepare_purge(uuid, uuid) from public, anon;
grant execute on function public.education_document_prepare_purge(uuid, uuid) to authenticated;
revoke all on function public.education_document_complete_purge(uuid, uuid) from public, anon;
grant execute on function public.education_document_complete_purge(uuid, uuid) to authenticated;

grant select on public.education_documents to authenticated;
revoke insert, update, delete on public.education_documents from authenticated;
revoke all on public.education_documents from anon;

commit;
