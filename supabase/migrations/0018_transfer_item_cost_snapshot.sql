-- SalesMate ERP — stock_transfer_items never stored the product's cost at
-- the time of transfer, so any "Transfer Value" report would silently use
-- *today's* price for old transfers instead of what it actually cost then.
-- This adds a real historical snapshot, backfilled best-effort from each
-- product's current cost_price for existing rows.
alter table public.stock_transfer_items
  add column unit_cost numeric(12, 2) not null default 0;

update public.stock_transfer_items sti
set unit_cost = coalesce(p.cost_price, p.unit_price, 0)
from public.products p
where p.id = sti.product_id;