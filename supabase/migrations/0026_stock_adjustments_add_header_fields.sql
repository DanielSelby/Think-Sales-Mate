-- SalesMate ERP — Stock Adjustments: header fields needed by the full
-- Stock Taking & Adjustment workspace (status, count type, who counted
-- it, and which accounting category the variance should post against).
-- Requires the existing stock_adjustments table. Additive only; existing
-- rows are backfilled as already-finalized counts, since the
-- draft/in-progress concept didn't exist before this.

create type public.adjustment_status as enum ('draft', 'in_progress', 'completed');
create type public.stock_count_type as enum ('stock_taking', 'adjustment_only');

alter table public.stock_adjustments
  add column status public.adjustment_status not null default 'completed',
  add column count_type public.stock_count_type not null default 'stock_taking',
  add column responsible_person_id uuid references auth.users(id) on delete set null,
  add column adjustment_account text;

create index idx_stock_adjustments_status on public.stock_adjustments(org_id, status);