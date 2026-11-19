begin;

alter table public.education_documents
  add column if not exists staff_id uuid;

alter table public.education_documents
  drop constraint if exists education_documents_staff_link_check;
alter table public.education_documents
  add constraint education_documents_staff_link_check
  check (
    staff_id is null
    or (student_id is null and admission_id is null and category = 'staff')
  );

alter table public.education_documents
  drop constraint if exists education_documents_org_branch_staff_fkey;
alter table public.education_documents
  add constraint education_documents_org_branch_staff_fkey
  foreign key (org_id, branch_id, staff_id)
  references public.education_staff(org_id, branch_id, id)
  on delete restrict;

create index if not exists education_documents_staff_idx
  on public.education_documents (org_id, branch_id, staff_id, created_at desc)
  where staff_id is not null;

drop function if exists public.education_document_register(
  uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid
);

create function public.education_document_register(
  p_org_id uuid,
  p_branch_id uuid,
  p_student_id uuid,
  p_title text,
  p_category text,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_storage_path text,
  p_retention_until date,
  p_admission_id uuid default null,
  p_staff_id uuid default null
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
    or (p_retention_until is not null and p_retention_until < current_date)
    or (p_admission_id is not null and (p_category <> 'admission' or p_student_id is not null or p_staff_id is not null))
    or (p_staff_id is not null and (p_category <> 'staff' or p_student_id is not null or p_admission_id is not null)) then
    raise exception 'Document details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_documents', 'create') then
    raise exception 'You are not authorized to upload documents at this campus.' using errcode = '42501';
  end if;
  if p_admission_id is not null
    and not public.education_can_access_branch(p_org_id, p_branch_id, 'education_admissions', 'edit') then
    raise exception 'Admission edit access is required to upload applicant documents.' using errcode = '42501';
  end if;
  if p_staff_id is not null and not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_staff', 'view'
  ) then
    raise exception 'Staff profile access is required to link a document to a staff member.' using errcode = '42501';
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
  if p_staff_id is not null and not exists (
    select 1 from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = p_branch_id
      and staff.id = p_staff_id
  ) then
    raise exception 'The selected staff member is not at this campus.' using errcode = '22023';
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
    org_id, branch_id, student_id, admission_id, staff_id, title, category, file_name, content_type,
    file_size, storage_path, retention_until, uploaded_by, verification_status
  ) values (
    p_org_id, p_branch_id, p_student_id, p_admission_id, p_staff_id, btrim(p_title), p_category,
    btrim(p_file_name), p_content_type, p_file_size, p_storage_path, p_retention_until, auth.uid(),
    case when p_admission_id is null then 'not_required' else 'pending' end
  ) returning id into document_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_uploaded', 'education_document', document_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'student_id', p_student_id,
      'admission_id', p_admission_id,
      'staff_id', p_staff_id,
      'category', p_category,
      'file_name', btrim(p_file_name),
      'file_size', p_file_size,
      'retention_until', p_retention_until,
      'verification_status', case when p_admission_id is null then 'not_required' else 'pending' end
    )
  );
  return document_id;
end;
$$;

revoke all on function public.education_document_register(uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid, uuid)
  from public, anon;
grant execute on function public.education_document_register(uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid, uuid)
  to authenticated;

commit;
