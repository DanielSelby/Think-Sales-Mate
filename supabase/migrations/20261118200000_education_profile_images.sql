begin;

grant update (home_address) on public.education_students to authenticated;

alter table public.education_staff
  add column if not exists photo_path text;

grant update (photo_path) on public.education_staff to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'education-staff-images',
  'education-staff-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.education_staff_image_storage_can_access(
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
      from public.education_staff staff
      where staff.org_id = folder_names[1]::uuid
        and staff.id = folder_names[2]::uuid
        and public.education_can_access_branch(
          staff.org_id, staff.branch_id, 'education_staff', target_action
        )
    )
  end;
$$;

revoke all on function public.education_staff_image_storage_can_access(text[], text) from public, anon;
grant execute on function public.education_staff_image_storage_can_access(text[], text) to authenticated;

drop policy if exists "education staff images read" on storage.objects;
create policy "education staff images read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'education-staff-images'
    and public.education_staff_image_storage_can_access(storage.foldername(name), 'view')
  );

drop policy if exists "education staff images upload" on storage.objects;
create policy "education staff images upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'education-staff-images'
    and (
      public.education_staff_image_storage_can_access(storage.foldername(name), 'create')
      or public.education_staff_image_storage_can_access(storage.foldername(name), 'edit')
    )
  );

drop policy if exists "education staff images delete" on storage.objects;
create policy "education staff images delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'education-staff-images'
    and public.education_staff_image_storage_can_access(storage.foldername(name), 'edit')
  );

commit;
