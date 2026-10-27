begin;

alter table public.restaurant_menu_items
  add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-menu-images',
  'restaurant-menu-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "restaurant-menu-images: public read" on storage.objects;
create policy "restaurant-menu-images: public read"
  on storage.objects for select
  using (bucket_id = 'restaurant-menu-images');

commit;
