-- Adds Purchases as a real module: suppliers, purchases, and purchase line
-- items, with draft/ordered/partial-receiving/received status tracking.
-- Receiving a purchase (fully or partially) increments product stock via
-- the same adjust_product_stock() function used by sale returns.

begin;

-- 1. Enums -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_status') then
    create type purchase_status as enum ('draft', 'ordered', 'partially_received', 'received', 'cancelled');
  end if;
end $$;

-- 2. Suppliers ---------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  contact_person text,
  phone text,
  email text,
  payment_terms text,
  currency text not null default 'GHS',
  address text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists suppliers_org_id_idx on public.suppliers (org_id);

-- 3. Purchases -----------------------------------------------------------
create sequence if not exists public.purchase_number_seq;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  purchase_number integer not null default nextval('public.purchase_number_seq'),
  supplier_id uuid not null references public.suppliers (id),
  status purchase_status not null default 'draft',

  purchase_date date not null default current_date,
  expected_delivery_date date,
  reference text,
  shipping_method text,
  project_id uuid references public.projects (id),

  location_id uuid not null references public.business_locations (id),
  delivery_address text,
  delivery_notes text,

  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  shipping_cost numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,

  payment_method text,
  payment_account text,
  pay_from_account text,

  purchase_note text,
  internal_note text,

  received_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchases_org_id_idx on public.purchases (org_id);
create index if not exists purchases_org_status_idx on public.purchases (org_id, status);
create unique index if not exists purchases_org_number_idx on public.purchases (org_id, purchase_number);

-- 4. Purchase line items ---------------------------------------------------
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  product_id uuid not null references public.products (id),
  quantity numeric not null check (quantity > 0),
  quantity_received numeric not null default 0,
  unit text not null default 'pcs',
  unit_price numeric(12, 2) not null,
  discount_percent numeric(5, 2) not null default 0,
  tax_percent numeric(5, 2) not null default 0,
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_id_idx on public.purchase_items (product_id);

alter table public.purchase_items
  add constraint purchase_items_received_not_over
    check (quantity_received >= 0 and quantity_received <= quantity);

-- 5. updated_at bookkeeping ------------------------------------------------
create or replace function public.touch_purchase_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists purchases_touch_updated_at on public.purchases;
create trigger purchases_touch_updated_at
  before update on public.purchases
  for each row
  execute function public.touch_purchase_updated_at();

-- 6. RLS ---------------------------------------------------------------------
-- Mirrors the org-membership check used elsewhere (see sale_return_items
-- migration / getCurrentOrgContext) — adjust if your real policy helper
-- differs.
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "suppliers_all" on public.suppliers
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = suppliers.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = suppliers.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "purchases_all" on public.purchases
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = purchases.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = purchases.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "purchase_items_all" on public.purchase_items
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = purchase_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = purchase_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

commit;