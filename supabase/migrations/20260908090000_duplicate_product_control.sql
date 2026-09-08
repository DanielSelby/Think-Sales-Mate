begin;

create table if not exists public.product_duplicate_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  control_mode text not null default 'block_exact_similar'
    check (control_mode in ('allow', 'warn', 'block_exact', 'block_exact_similar')),
  similarity_threshold integer not null default 85 check (similarity_threshold between 70 and 100),
  barcode_validation text not null default 'warn'
    check (barcode_validation in ('allow', 'warn', 'block')),
  updated_at timestamptz not null default now()
);

alter table public.product_duplicate_settings enable row level security;
create policy "product duplicate settings members read"
  on public.product_duplicate_settings for select using (public.is_org_member(org_id));
create policy "product duplicate settings managers write"
  on public.product_duplicate_settings for all
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

create index if not exists products_org_normalized_name_idx
  on public.products (org_id, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')));

commit;
