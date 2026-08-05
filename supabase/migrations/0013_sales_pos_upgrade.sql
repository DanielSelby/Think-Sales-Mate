-- SalesMate ERP — extends Sales for the full "New Sale" workflow:
-- linking a real customer record, a branch, per-line discount/tax, an
-- order-level reference, payment method, and amount paid.
--
-- Sales remain immediate, completed transactions (stock is deducted the
-- moment sale_items are inserted, same as before) — there is no separate
-- "draft" status in the database. The app's "Save as draft" action keeps
-- an in-progress sale in the browser only, and only calls into these
-- tables once the sale is actually confirmed.

alter table public.sales
  add column customer_id uuid references public.customers(id),
  add column location_id uuid references public.business_locations(id),
  add column reference text,
  add column sale_date date not null default current_date,
  add column discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  add column tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  add column shipping_amount numeric(12, 2) not null default 0 check (shipping_amount >= 0),
  add column payment_method text,
  add column amount_paid numeric(12, 2);

alter table public.sale_items
  add column discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  add column tax_percent numeric(5, 2) not null default 0 check (tax_percent >= 0);

create index idx_sales_customer on public.sales(customer_id);
create index idx_sales_location on public.sales(location_id);