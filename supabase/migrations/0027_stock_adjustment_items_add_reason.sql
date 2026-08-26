-- SalesMate ERP — Stock Adjustment Items: per-line variance reason
-- (Damage/Defective, Theft/Loss, Counting Error, etc.). Kept as free
-- text, matching the existing `reason` column on stock_transfers, so the
-- fixed reason list stays a front-end concern rather than a DB enum.
-- Requires the existing stock_adjustment_items table. Additive only.
alter table public.stock_adjustment_items
  add column reason text;