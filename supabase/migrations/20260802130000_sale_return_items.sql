-- Line-item return tracking + atomic stock adjustment, so marking a sale
-- "Returned" or "Cancelled" actually puts stock back (and restoring a sale
-- to "Completed" reverses that), instead of only flipping a status label.

begin;

-- 1. Per-line return records -------------------------------------------
create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  sale_id uuid not null references public.sales (id) on delete cascade,
  sale_item_id uuid not null references public.sale_items (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric not null check (quantity > 0),
  unit_cost numeric,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists sale_return_items_sale_id_idx on public.sale_return_items (sale_id);
create index if not exists sale_return_items_sale_item_id_idx on public.sale_return_items (sale_item_id);
create index if not exists sale_return_items_org_id_idx on public.sale_return_items (org_id);

alter table public.sale_return_items enable row level security;

-- Mirrors the org-membership pattern your other org-scoped tables use.
-- Verify this matches your actual policy helper/function name before
-- applying — adjust `is_org_member(org_id)` to whatever you use elsewhere
-- (e.g. a SECURITY DEFINER function or a join against organization_members).
create policy "sale_return_items_select" on public.sale_return_items
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sale_return_items.org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "sale_return_items_insert" on public.sale_return_items
  for insert with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sale_return_items.org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'manager', 'staff')
    )
  );

create policy "sale_return_items_delete" on public.sale_return_items
  for delete using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sale_return_items.org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'manager', 'staff')
    )
  );

-- 2. Atomic stock adjustment ---------------------------------------------
-- Avoids read-then-write races when several returns/restores touch the
-- same product concurrently.
create or replace function public.adjust_product_stock(p_product_id uuid, p_delta numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products
  set stock_quantity = stock_quantity + p_delta,
      updated_at = now()
  where id = p_product_id;
$$;

commit;