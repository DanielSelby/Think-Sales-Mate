-- POS "Hold Sale" and "Save as Draft" park a cart before it becomes a real
-- sale — no stock movement, no commitment, so this deliberately isn't
-- modeled as a `sales` row (that table represents a completed/returned/
-- cancelled transaction, not a pre-commitment cart). Cart contents are
-- stored as jsonb since this is a temporary object, not a permanent
-- transactional record with its own line-item table.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'held_sale_kind') then
    create type held_sale_kind as enum ('hold', 'draft');
  end if;
end $$;

create table if not exists public.held_sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  location_id uuid references public.business_locations (id),
  kind held_sale_kind not null default 'hold',
  customer_id uuid references public.customers (id),
  customer_name text,
  customer_phone text,
  order_note text,
  items jsonb not null default '[]',
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists held_sales_org_kind_idx on public.held_sales (org_id, kind);

alter table public.held_sales enable row level security;

create policy "held_sales_all" on public.held_sales
  for all using (
    exists (select 1 from public.organization_members m
      where m.org_id = held_sales.org_id and m.user_id = auth.uid() and m.status = 'active')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.org_id = held_sales.org_id and m.user_id = auth.uid() and m.status = 'active')
  );

commit;