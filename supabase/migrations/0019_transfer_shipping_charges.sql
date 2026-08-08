-- SalesMate ERP — optional shipping/freight charges on a stock transfer,
-- shown as its own column separate from the goods' value.
alter table public.stock_transfers
  add column shipping_charges numeric(12, 2) not null default 0 check (shipping_charges >= 0);