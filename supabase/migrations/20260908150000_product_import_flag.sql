alter table public.products
  add column if not exists is_imported boolean not null default false;
