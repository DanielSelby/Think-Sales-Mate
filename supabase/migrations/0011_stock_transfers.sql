-- SalesMate ERP — Stock transfers between business locations.
-- Depends on 0002_inventory_sales.sql (products) and 0010_locations.sql
-- (business_locations).
--
-- Note: products.stock_quantity is tracked org-wide, not per-location —
-- this module logs the movement of goods between branches (what moved,
-- from where, to where, and its status) without maintaining a separate
-- per-location quantity. Completing a transfer does not change
-- products.stock_quantity, since the stock never leaves the org.

create type public.transfer_status as enum ('pending', 'in_transit', 'completed', 'cancelled');

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Stock transfers (header)
-- ─────────────────────────────────────────────────────────────────────────
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  transfer_number integer not null,
  from_location_id uuid not null references public.business_locations(id),
  to_location_id uuid not null references public.business_locations(id),
  status public.transfer_status not null default 'pending',
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id, transfer_number),
  check (from_location_id <> to_location_id)
);

alter table public.stock_transfers enable row level security;

create policy "stock_transfers: members can read"
  on public.stock_transfers for select
  using (public.is_org_member(org_id));

create policy "stock_transfers: managers can create"
  on public.stock_transfers for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create policy "stock_transfers: managers can update status"
  on public.stock_transfers for update
  using (public.has_org_role(org_id, 'manager'));

create index idx_stock_transfers_org on public.stock_transfers(org_id, created_at desc);
create index idx_stock_transfers_from on public.stock_transfers(from_location_id);
create index idx_stock_transfers_to on public.stock_transfers(to_location_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Stock transfer line items
-- ─────────────────────────────────────────────────────────────────────────
create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

alter table public.stock_transfer_items enable row level security;

create policy "stock_transfer_items: members can read"
  on public.stock_transfer_items for select
  using (public.is_org_member(org_id));

create policy "stock_transfer_items: managers can create"
  on public.stock_transfer_items for insert
  with check (public.has_org_role(org_id, 'manager'));

create index idx_stock_transfer_items_transfer on public.stock_transfer_items(transfer_id);
create index idx_stock_transfer_items_product on public.stock_transfer_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Auto-assign the next transfer_number per organization, same pattern
--    as next_sale_number.
-- ─────────────────────────────────────────────────────────────────────────
create function public.next_transfer_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(transfer_number), 0) + 1 into new.transfer_number
  from public.stock_transfers
  where org_id = new.org_id;
  return new;
end;
$$;

create trigger set_transfer_number
  before insert on public.stock_transfers
  for each row execute procedure public.next_transfer_number();