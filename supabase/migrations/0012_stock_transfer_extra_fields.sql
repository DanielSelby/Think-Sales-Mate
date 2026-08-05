-- SalesMate ERP — extra Stock Transfer fields to support the full
-- transfer wizard (reference number, reason, and a user-editable
-- transfer date separate from created_at).
alter table public.stock_transfers
  add column reference_no text,
  add column reason text,
  add column transfer_date date not null default current_date;