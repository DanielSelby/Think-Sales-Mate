-- Purchase Returns: returning received goods back to a supplier against an
-- original purchase order. Separate workflow from sale returns — this
-- removes stock (goods leaving to the supplier) rather than adding it back.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_return_status') then
    create type purchase_return_status as enum ('draft', 'submitted', 'approved', 'rejected');
  end if;
end $$;

create sequence if not exists public.purchase_return_number_seq;

create table if not exists public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  return_number integer not null default nextval('public.purchase_return_number_seq'),
  purchase_id uuid not null references public.purchases (id),
  supplier_id uuid not null references public.suppliers (id),
  location_id uuid not null references public.business_locations (id),
  status purchase_return_status not null default 'draft',

  return_date date not null default current_date,
  return_reason text,
  invoice_number text,
  reference text,
  notes text,
  internal_notes text,

  payment_status text,
  refund_method text,
  payment_account text,
  refund_status text not null default 'Pending',

  restocking_fee numeric(12, 2) not null default 0,
  tax_adjustment numeric(12, 2) not null default 0,
  total_return_value numeric(12, 2) not null default 0,
  refund_amount numeric(12, 2) not null default 0,

  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_returns_org_id_idx on public.purchase_returns (org_id);
create index if not exists purchase_returns_purchase_id_idx on public.purchase_returns (purchase_id);
create index if not exists purchase_returns_supplier_id_idx on public.purchase_returns (supplier_id);
create unique index if not exists purchase_returns_org_number_idx on public.purchase_returns (org_id, return_number);

create table if not exists public.purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.purchase_returns (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  purchase_item_id uuid not null references public.purchase_items (id),
  product_id uuid not null references public.products (id),
  batch_serial text,
  purchased_qty numeric not null,
  return_qty numeric not null check (return_qty > 0),
  unit_cost numeric(12, 2) not null default 0,
  return_value numeric(12, 2) not null default 0,
  return_reason text,
  condition text,
  created_at timestamptz not null default now()
);

create index if not exists purchase_return_items_return_id_idx on public.purchase_return_items (return_id);
create index if not exists purchase_return_items_purchase_item_id_idx on public.purchase_return_items (purchase_item_id);

create or replace function public.touch_purchase_return_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists purchase_returns_touch_updated_at on public.purchase_returns;
create trigger purchase_returns_touch_updated_at
  before update on public.purchase_returns
  for each row
  execute function public.touch_purchase_return_updated_at();

alter table public.purchase_returns enable row level security;
alter table public.purchase_return_items enable row level security;

create policy "purchase_returns_all" on public.purchase_returns
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = purchase_returns.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = purchase_returns.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

create policy "purchase_return_items_all" on public.purchase_return_items
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = purchase_return_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = purchase_return_items.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

commit;