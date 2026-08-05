-- SalesMate ERP — Inventory + Sales module.
-- Depends on 0001_core_schema.sql (organizations, organization_members, RBAC helpers).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Products (Inventory)
-- ─────────────────────────────────────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);

alter table public.products enable row level security;

create policy "products: members can read"
  on public.products for select
  using (public.is_org_member(org_id));

create policy "products: managers can insert"
  on public.products for insert
  with check (public.has_org_role(org_id, 'manager'));

create policy "products: managers can update"
  on public.products for update
  using (public.has_org_role(org_id, 'manager'));

create policy "products: managers can delete"
  on public.products for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_products_org on public.products(org_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Sales + line items
--    A "sale" here is a completed, paid-in-full transaction (POS-style).
--    Invoicing / receivables belong to the Accounting module later.
-- ─────────────────────────────────────────────────────────────────────────
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sale_number integer not null,
  customer_name text,
  subtotal numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  sold_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, sale_number)
);

alter table public.sales enable row level security;

create policy "sales: members can read"
  on public.sales for select
  using (public.is_org_member(org_id));

create policy "sales: staff can record"
  on public.sales for insert
  with check (public.has_org_role(org_id, 'staff') and sold_by = auth.uid());

create index idx_sales_org_created on public.sales(org_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

alter table public.sale_items enable row level security;

create policy "sale_items: members can read"
  on public.sale_items for select
  using (public.is_org_member(org_id));

create policy "sale_items: staff can record"
  on public.sale_items for insert
  with check (public.has_org_role(org_id, 'staff'));

create index idx_sale_items_sale on public.sale_items(sale_id);
create index idx_sale_items_product on public.sale_items(product_id);

-- Auto-assign the next sale_number per organization (1, 2, 3, ...) so
-- receipts read like "Sale #0001" instead of exposing a raw uuid.
create function public.next_sale_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(sale_number), 0) + 1 into new.sale_number
  from public.sales
  where org_id = new.org_id;
  return new;
end;
$$;

create trigger set_sale_number
  before insert on public.sales
  for each row execute procedure public.next_sale_number();

-- Deduct stock the moment a sale_item is recorded. Raises a clear error
-- (caught and shown to the user by the app) rather than allowing a sale
-- to oversell what's on the shelf.
create function public.deduct_stock_on_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  available integer;
  product_name text;
begin
  select stock_quantity, name into available, product_name
  from public.products
  where id = new.product_id
  for update;

  if available is null then
    raise exception 'Product not found.';
  end if;

  if available < new.quantity then
    raise exception 'Not enough stock for "%": % available, % requested.',
      product_name, available, new.quantity;
  end if;

  update public.products
  set stock_quantity = stock_quantity - new.quantity,
      updated_at = now()
  where id = new.product_id;

  return new;
end;
$$;

create trigger deduct_stock_after_sale_item
  before insert on public.sale_items
  for each row execute procedure public.deduct_stock_on_sale();