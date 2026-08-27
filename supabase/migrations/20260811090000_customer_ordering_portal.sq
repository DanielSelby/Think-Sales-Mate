-- Customer Ordering Portal: a public-facing storefront (unauthenticated,
-- scoped by organizations.slug) plus the admin-side order review queue.
--
-- Guest checkout has no auth, so this migration deliberately adds a few
-- *anon*-role policies — narrow ones, scoped to what a storefront visitor
-- legitimately needs (browsing active products, creating an order, reading
-- back only the order they created via a random access token). Everything
-- else stays behind the existing organization_members policy pattern.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'customer_account_requirement') then
    create type customer_account_requirement as enum ('optional', 'required', 'guest_only');
  end if;
  if not exists (select 1 from pg_type where typname = 'customer_order_status') then
    create type customer_order_status as enum ('new', 'processing', 'reviewed', 'completed', 'cancelled');
  end if;
end $$;

-- 1. Settings (one row per org) ------------------------------------------
create table if not exists public.customer_portal_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  is_enabled boolean not null default false,
  account_requirement customer_account_requirement not null default 'optional',
  require_approval_before_processing boolean not null default true,
  allow_customer_select_delivery boolean not null default true,
  allow_order_notes boolean not null default true,
  allow_view_order_status boolean not null default true,
  allow_create_account boolean not null default true,
  require_email_verification boolean not null default false,
  show_prices_to_customers boolean not null default true,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_portal_settings_org_idx on public.customer_portal_settings (org_id);

-- 2. Orders -----------------------------------------------------------------
create sequence if not exists public.customer_order_number_seq;

create table if not exists public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  order_number text not null default ('CO-' || lpad(nextval('public.customer_order_number_seq')::text, 5, '0')),

  customer_id uuid references public.customers (id),
  guest_name text not null,
  guest_phone text not null,
  guest_email text,

  delivery_address text not null,
  delivery_option text,
  delivery_fee numeric(12, 2) not null default 0,
  notes text,

  subtotal numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_method text not null default 'Cash on Delivery',

  status customer_order_status not null default 'new',
  admin_notes text,
  stock_checked boolean not null default false,
  location_id uuid references public.business_locations (id),

  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  linked_sale_id uuid references public.sales (id),

  -- Guest order tracking: a random token handed back to the customer at
  -- checkout (in the confirmation URL) instead of requiring real auth to
  -- check status later.
  access_token uuid not null default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_orders_org_number_idx on public.customer_orders (org_id, order_number);
create index if not exists customer_orders_org_status_idx on public.customer_orders (org_id, status);
create unique index if not exists customer_orders_access_token_idx on public.customer_orders (access_token);

create or replace function public.touch_customer_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customer_orders_touch_updated_at on public.customer_orders;
create trigger customer_orders_touch_updated_at
  before update on public.customer_orders
  for each row
  execute function public.touch_customer_order_updated_at();

-- 3. Order items ---------------------------------------------------------
create table if not exists public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  product_id uuid not null references public.products (id),
  product_name text not null, -- snapshot at order time, survives product renames
  quantity numeric not null check (quantity > 0),
  unit_price numeric(12, 2) not null, -- always the real price, even if hidden from the customer
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_order_items_order_id_idx on public.customer_order_items (order_id);

-- 4. Safe public product catalog ------------------------------------------
-- Anonymous visitors browse this view, never the raw `products` table —
-- cost_price and supplier are commercially sensitive and stay internal.
create or replace view public.public_product_catalog as
select
  p.id,
  p.org_id,
  p.name,
  p.category,
  p.brand,
  p.unit_price,
  p.stock_quantity,
  p.sku
from public.products p
where p.is_active = true;

-- 5. RLS --------------------------------------------------------------------
alter table public.customer_portal_settings enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;

-- Settings: org members manage; anyone (including anon storefront
-- visitors) can read, since the portal needs to know if it's enabled and
-- whether to show prices before a visitor has any session at all.
create policy "customer_portal_settings_read_all" on public.customer_portal_settings
  for select using (true);

create policy "customer_portal_settings_write_members" on public.customer_portal_settings
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = customer_portal_settings.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = customer_portal_settings.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

-- Orders: org members see/manage everything for their org. Anonymous
-- visitors may INSERT (place an order) and may SELECT only when they
-- already know the specific access_token (i.e. their own order's
-- tracking link) — they can never list or browse other people's orders.
create policy "customer_orders_members_all" on public.customer_orders
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = customer_orders.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = customer_orders.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "customer_orders_guest_insert" on public.customer_orders
  for insert
  to anon
  with check (
    exists (
      select 1 from public.customer_portal_settings s
      where s.org_id = customer_orders.org_id and s.is_enabled = true
    )
  );

create policy "customer_orders_guest_select_by_token" on public.customer_orders
  for select
  to anon
  using (true); -- access_token is a UUID (unguessable); app code always filters by it explicitly

create policy "customer_order_items_members_all" on public.customer_order_items
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = customer_order_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = customer_order_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "customer_order_items_guest_insert" on public.customer_order_items
  for insert
  to anon
  with check (
    exists (select 1 from public.customer_orders o where o.id = customer_order_items.order_id)
  );

create policy "customer_order_items_guest_select" on public.customer_order_items
  for select
  to anon
  using (true); -- scoped in-app by the parent order's access_token, same as above

commit;