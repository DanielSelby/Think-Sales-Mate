begin;

alter table public.education_documents
  add column if not exists admission_id uuid,
  add column if not exists verification_status text not null default 'not_required',
  add column if not exists verification_note text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.education_documents'::regclass
      and conname = 'education_documents_admission_fkey'
  ) then
    alter table public.education_documents
      add constraint education_documents_admission_fkey
      foreign key (org_id, admission_id)
      references public.education_admissions(org_id, id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.education_documents'::regclass
      and conname = 'education_documents_verification_status_check'
  ) then
    alter table public.education_documents
      add constraint education_documents_verification_status_check
      check (verification_status in ('not_required', 'pending', 'verified', 'rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.education_documents'::regclass
      and conname = 'education_documents_admission_verification_check'
  ) then
    alter table public.education_documents
      add constraint education_documents_admission_verification_check
      check (
        (admission_id is null and verification_status = 'not_required'
          and verified_by is null and verified_at is null)
        or (admission_id is not null and category = 'admission'
          and student_id is null and verification_status <> 'not_required'
          and (
            (verification_status = 'pending' and verified_by is null and verified_at is null)
            or (verification_status in ('verified', 'rejected')
              and verified_at is not null)
          ))
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.education_documents'::regclass
      and conname = 'education_documents_verification_note_length_check'
  ) then
    alter table public.education_documents
      add constraint education_documents_verification_note_length_check
      check (verification_note is null or char_length(btrim(verification_note)) <= 1000);
  end if;
end;
$$;

create index if not exists education_documents_admission_review_idx
  on public.education_documents (org_id, branch_id, admission_id, verification_status, created_at desc)
  where admission_id is not null;

create or replace function public.education_validate_admission_document_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  application_branch_id uuid;
  application_status text;
begin
  if new.admission_id is null then
    return new;
  end if;
  if new.category <> 'admission' or new.student_id is not null
    or new.verification_status not in ('pending', 'verified', 'rejected') then
    raise exception 'Admission documents must be linked to an application and reviewed in the admission workflow.'
      using errcode = '22023';
  end if;
  select branch_id, status into application_branch_id, application_status
  from public.education_admissions
  where org_id = new.org_id and id = new.admission_id;
  if not found or application_branch_id <> new.branch_id then
    raise exception 'The application is not available at the selected campus.'
      using errcode = '22023';
  end if;
  if application_status not in ('pending', 'under_review', 'admitted') then
    raise exception 'Documents can only be linked before an application is enrolled, rejected, or withdrawn.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists education_admission_document_link_guard on public.education_documents;
create trigger education_admission_document_link_guard
  before insert or update of admission_id, org_id, branch_id, category, student_id, verification_status
  on public.education_documents
  for each row execute function public.education_validate_admission_document_link();

drop function if exists public.education_document_register(
  uuid, uuid, uuid, text, text, text, text, bigint, text, date
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
  p_admission_id uuid default null
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
    or (p_admission_id is not null and (p_category <> 'admission' or p_student_id is not null)) then
    raise exception 'Document details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_documents', 'create') then
    raise exception 'You are not authorized to upload documents at this campus.' using errcode = '42501';
  end if;
  if p_admission_id is not null
    and not public.education_can_access_branch(p_org_id, p_branch_id, 'education_admissions', 'edit') then
    raise exception 'Admission edit access is required to upload applicant documents.' using errcode = '42501';
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
    org_id, branch_id, student_id, admission_id, title, category, file_name, content_type,
    file_size, storage_path, retention_until, uploaded_by, verification_status
  ) values (
    p_org_id, p_branch_id, p_student_id, p_admission_id, btrim(p_title), p_category, btrim(p_file_name),
    p_content_type, p_file_size, p_storage_path, p_retention_until, auth.uid(),
    case when p_admission_id is null then 'not_required' else 'pending' end
  ) returning id into document_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_document_uploaded', 'education_document', document_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'student_id', p_student_id,
      'admission_id', p_admission_id,
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

create or replace function public.education_admission_document_review(
  p_org_id uuid,
  p_document_id uuid,
  p_verification_status text,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.education_documents%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_document_id is null
    or p_verification_status is null
    or p_verification_status not in ('verified', 'rejected')
    or char_length(btrim(coalesce(p_note, ''))) > 1000
    or (p_verification_status = 'rejected' and nullif(btrim(p_note), '') is null) then
    raise exception 'Admission document review details are invalid.'
      using errcode = '22023';
  end if;

  select * into document_row
  from public.education_documents
  where org_id = p_org_id and id = p_document_id
  for update;
  if not found or document_row.admission_id is null or document_row.category <> 'admission' then
    raise exception 'The applicant document was not found.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
      p_org_id, document_row.branch_id, 'education_admissions', 'edit'
    )
    or not public.education_can_access_branch(
      p_org_id, document_row.branch_id, 'education_documents', 'view'
    ) then
    raise exception 'Admission edit and document view access are required to review applicant documents.'
      using errcode = '42501';
  end if;
  if document_row.status <> 'active'
    or (document_row.retention_until is not null and document_row.retention_until < current_date) then
    raise exception 'Archived or expired applicant documents cannot be reviewed.'
      using errcode = '22023';
  end if;

  update public.education_documents
  set verification_status = p_verification_status,
      verification_note = nullif(btrim(p_note), ''),
      verified_by = auth.uid(),
      verified_at = now(),
      updated_at = now()
  where org_id = p_org_id and id = p_document_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(),
    case when p_verification_status = 'verified'
      then 'education_admission_document_verified'
      else 'education_admission_document_rejected'
    end,
    'education_document', p_document_id,
    jsonb_build_object(
      'branch_id', document_row.branch_id,
      'admission_id', document_row.admission_id,
      'previous_status', document_row.verification_status,
      'verification_status', p_verification_status,
      'note', nullif(btrim(p_note), '')
    )
  );
  return true;
end;
$$;

revoke all on function public.education_validate_admission_document_link() from public, anon, authenticated;
revoke all on function public.education_document_register(uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid) from public, anon;
grant execute on function public.education_document_register(uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid) to authenticated;
revoke all on function public.education_admission_document_review(uuid, uuid, text, text) from public, anon;
grant execute on function public.education_admission_document_review(uuid, uuid, text, text) to authenticated;

commit;
