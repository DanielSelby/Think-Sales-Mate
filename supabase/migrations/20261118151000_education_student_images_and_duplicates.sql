begin;

alter table public.education_students
  add column if not exists photo_path text;

grant update (photo_path) on public.education_students to authenticated;

create or replace function public.education_guard_unique_student_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.student_number is null or btrim(new.student_number) = '' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.org_id = old.org_id
    and lower(btrim(new.student_number)) = lower(btrim(old.student_number)) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.org_id::text || ':' || lower(btrim(new.student_number)), 0)
  );

  if exists (
    select 1
    from public.education_students student
    where student.org_id = new.org_id
      and student.id is distinct from new.id
      and lower(btrim(student.student_number)) = lower(btrim(new.student_number))
  ) then
    raise exception 'A student with this number already exists in this organization.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists education_students_unique_number_guard on public.education_students;
create trigger education_students_unique_number_guard
  before insert or update of org_id, student_number on public.education_students
  for each row execute function public.education_guard_unique_student_number();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'education-student-images',
  'education-student-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.education_student_image_storage_can_access(
  folder_names text[],
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when target_action not in ('view', 'create', 'edit')
      or coalesce(array_length(folder_names, 1), 0) <> 2
      or folder_names[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or folder_names[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then false
    else exists (
      select 1
      from public.education_students student
      where student.org_id = folder_names[1]::uuid
        and student.id = folder_names[2]::uuid
        and public.education_can_access_branch(
          student.org_id, student.branch_id, 'education_students', target_action
        )
    )
  end;
$$;

revoke all on function public.education_student_image_storage_can_access(text[], text) from public, anon;
grant execute on function public.education_student_image_storage_can_access(text[], text) to authenticated;

drop policy if exists "education student images read" on storage.objects;
create policy "education student images read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'education-student-images'
    and public.education_student_image_storage_can_access(storage.foldername(name), 'view')
  );

drop policy if exists "education student images upload" on storage.objects;
create policy "education student images upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'education-student-images'
    and (
      public.education_student_image_storage_can_access(storage.foldername(name), 'create')
      or public.education_student_image_storage_can_access(storage.foldername(name), 'edit')
    )
  );

drop policy if exists "education student images delete" on storage.objects;
create policy "education student images delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'education-student-images'
    and public.education_student_image_storage_can_access(storage.foldername(name), 'edit')
  );

commit;
