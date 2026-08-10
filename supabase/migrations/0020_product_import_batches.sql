-- SalesMate ERP — lightweight import history for the Bulk Import Products
-- wizard. Only the batch summary is persisted (not per-row error detail —
-- that's regenerated client-side from the validation pass and downloaded
-- directly, no need to store it server-side).
create table public.product_import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.product_import_batches enable row level security;

create policy "product_import_batches: members can read"
  on public.product_import_batches for select
  using (public.is_org_member(org_id));

create policy "product_import_batches: managers can create"
  on public.product_import_batches for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create index idx_product_import_batches_org on public.product_import_batches(org_id, created_at desc);