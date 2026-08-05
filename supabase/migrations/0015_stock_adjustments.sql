-- SalesMate ERP — Stock adjustments (physical count corrections, damage
-- write-offs, error corrections, etc).
--
-- Unlike stock transfers, adjustments correct the one real stock number
-- this schema has (products.stock_quantity), so — same as a sale —
-- creating an adjustment is an immediate, final action: inserting its line
-- items applies the counted quantity to the product right away via a
-- trigger, mirroring how deduct_stock_on_sale already works for sales.

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  adjustment_number integer not null,
  reference_no text,
  adjustment_date date not null default current_date,
  location_id uuid references public.business_locations(id),
  reason text,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, adjustment_number)
);

alter table public.stock_adjustments enable row level security;

create policy "stock_adjustments: members can read"
  on public.stock_adjustments for select
  using (public.is_org_member(org_id));

create policy "stock_adjustments: managers can create"
  on public.stock_adjustments for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create index idx_stock_adjustments_org on public.stock_adjustments(org_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
create table public.stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.stock_adjustments(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id),
  system_stock integer not null,
  counted_stock integer not null check (counted_stock >= 0),
  unit_cost numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.stock_adjustment_items enable row level security;

create policy "stock_adjustment_items: members can read"
  on public.stock_adjustment_items for select
  using (public.is_org_member(org_id));

create policy "stock_adjustment_items: managers can create"
  on public.stock_adjustment_items for insert
  with check (public.has_org_role(org_id, 'manager'));

create index idx_stock_adjustment_items_adjustment on public.stock_adjustment_items(adjustment_id);
create index idx_stock_adjustment_items_product on public.stock_adjustment_items(product_id);

-- Auto-number, same pattern as sales/transfers.
create function public.next_adjustment_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(adjustment_number), 0) + 1 into new.adjustment_number
  from public.stock_adjustments
  where org_id = new.org_id;
  return new;
end;
$$;

create trigger set_adjustment_number
  before insert on public.stock_adjustments
  for each row execute procedure public.next_adjustment_number();

-- Apply the counted quantity to the product the moment a line is recorded.
create function public.apply_stock_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock_quantity = new.counted_stock,
      updated_at = now()
  where id = new.product_id
    and org_id = new.org_id;
  return new;
end;
$$;

create trigger apply_stock_adjustment_trigger
  after insert on public.stock_adjustment_items
  for each row execute procedure public.apply_stock_adjustment();