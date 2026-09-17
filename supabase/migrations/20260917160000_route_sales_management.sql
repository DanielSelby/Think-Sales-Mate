begin;

create table if not exists public.route_sales_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  territory text,
  branch_id uuid,
  assigned_rep_id uuid references public.profiles(id) on delete set null,
  vehicle text,
  route_days text[] not null default '{}',
  start_time time,
  end_time time,
  notes text,
  status text not null default 'Active' check (status in ('Active','Inactive','Completed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_sales_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  route_id uuid not null references public.route_sales_routes(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  visit_date date not null default current_date,
  sequence_no integer not null default 1,
  status text not null default 'Scheduled' check (status in ('Scheduled','In Progress','Completed','Missed')),
  latitude numeric,
  longitude numeric,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.route_sales_collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  route_id uuid references public.route_sales_routes(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id uuid,
  outstanding_amount numeric not null default 0,
  amount_collected numeric not null default 0,
  collection_date date not null default current_date,
  payment_method text not null default 'Cash',
  collector_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.route_sales_mobile_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  route_id uuid references public.route_sales_routes(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Converted')),
  total numeric not null default 0,
  price_level text not null default 'Retail',
  signature text,
  offline_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_sales_mobile_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.route_sales_mobile_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  discount numeric not null default 0
);

create index if not exists route_sales_routes_org_idx on public.route_sales_routes(org_id, status);
create index if not exists route_sales_visits_org_date_idx on public.route_sales_visits(org_id, visit_date, status);
create index if not exists route_sales_collections_org_date_idx on public.route_sales_collections(org_id, collection_date);
create index if not exists route_sales_mobile_orders_org_status_idx on public.route_sales_mobile_orders(org_id, status, created_at desc);

alter table public.route_sales_routes enable row level security;
alter table public.route_sales_visits enable row level security;
alter table public.route_sales_collections enable row level security;
alter table public.route_sales_mobile_orders enable row level security;
alter table public.route_sales_mobile_order_items enable row level security;

create policy "route sales routes members" on public.route_sales_routes for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "route sales visits members" on public.route_sales_visits for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "route sales collections members" on public.route_sales_collections for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "route sales mobile orders members" on public.route_sales_mobile_orders for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "route sales mobile order items members" on public.route_sales_mobile_order_items for all
  using (exists (select 1 from public.route_sales_mobile_orders o where o.id = order_id and public.is_org_member(o.org_id)))
  with check (exists (select 1 from public.route_sales_mobile_orders o where o.id = order_id and public.is_org_member(o.org_id)));

commit;
