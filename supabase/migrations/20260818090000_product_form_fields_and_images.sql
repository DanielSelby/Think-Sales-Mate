-- Extends products with the fields the redesigned Add Product page needs
-- (unit, category, brand, barcode, location_id already exist), plus a
-- public storage bucket for product images — same real pattern as
-- company-assets in 0024_company_profile.sql, not faked.

begin;

alter table public.products
  add column if not exists product_type text not null default 'standard' check (product_type in ('standard', 'service', 'digital')),
  add column if not exists hsn_code text,
  add column if not exists tax_rate numeric(5, 2),
  add column if not exists expiry_date date,
  add column if not exists warranty_months integer,
  add column if not exists wholesale_price numeric(12, 2),
  add column if not exists mrp numeric(12, 2),
  add column if not exists track_inventory boolean not null default true,
  add column if not exists allow_sale boolean not null default true,
  add column if not exists allow_purchase boolean not null default true,
  add column if not exists allow_negative_stock boolean not null default false,
  add column if not exists has_variants boolean not null default false,
  add column if not exists tags text[] not null default '{}',
  add column if not exists image_urls text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product-images: public read"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "product-images: authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

create policy "product-images: authenticated users can update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

create policy "product-images: authenticated users can delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');

commit;