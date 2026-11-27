begin;

alter table public.education_documents enable row level security;

drop policy if exists education_documents_sensitive_visibility
  on public.education_documents;
create policy education_documents_sensitive_visibility
  on public.education_documents
  as restrictive
  for select
  to authenticated
  using (
    category <> 'medical'
    or public.education_can_access_branch(
      org_id, branch_id, 'education_sensitive_documents', 'view'
    )
  );

drop policy if exists education_documents_sensitive_storage_read
  on storage.objects;
create policy education_documents_sensitive_storage_read
  on storage.objects
  as restrictive
  for select
  to authenticated
  using (
    bucket_id <> 'education-documents'
    or exists (
      select 1
      from public.education_documents document
      where document.storage_path = name
        and document.status = 'active'
        and (document.retention_until is null or document.retention_until >= current_date)
        and (
          document.category <> 'medical'
          or public.education_can_access_branch(
            document.org_id,
            document.branch_id,
            'education_sensitive_documents',
            'view'
          )
        )
    )
  );

create or replace function public.education_guard_sensitive_document_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.education_documents%rowtype;
  required_action text;
  is_sensitive boolean;
begin
  if tg_op = 'DELETE' then
    document_row := old;
    required_action := 'delete';
    is_sensitive := old.category = 'medical';
  elsif tg_op = 'INSERT' then
    document_row := new;
    required_action := 'create';
    is_sensitive := new.category = 'medical';
  else
    document_row := new;
    required_action := 'edit';
    is_sensitive := old.category = 'medical' or new.category = 'medical';
  end if;

  if is_sensitive then
    if auth.uid() is null or not public.education_can_access_branch(
      document_row.org_id,
      document_row.branch_id,
      'education_sensitive_documents',
      required_action
    ) then
      raise exception 'Sensitive document access is required for this action.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists education_sensitive_document_access_guard
  on public.education_documents;
create trigger education_sensitive_document_access_guard
  before insert or update or delete on public.education_documents
  for each row execute function public.education_guard_sensitive_document_access();

revoke all on function public.education_guard_sensitive_document_access()
  from public, anon, authenticated;

commit;
