-- document_status tracks the pre-sale workflow stage (Draft / Quotation /
-- Proforma / Final) — separate from `status` (completed/returned/cancelled),
-- which tracks post-sale lifecycle. Only a "final" document represents a
-- real, stock-affecting sale; draft/quotation/proforma rows are saved but
-- never touch inventory until finalized.

begin;

alter table public.sales
  add column if not exists document_status text not null default 'final'
    check (document_status in ('draft', 'quotation', 'proforma', 'final'));

create index if not exists sales_org_document_status_idx on public.sales (org_id, document_status);

commit;


-- SalesMate ERP — Sales: document lifecycle status (draft / quotation /
-- proforma / final). The Sales module code already fully implements this
-- workflow — a sale only reserves stock once it becomes "final" — but this
-- column was never added, so every document_status reference throughout
-- app/(dashboard)/sales/actions.ts and page.tsx currently fails to
-- type-check against the live schema. Additive only; every existing row
-- predates this feature and was, by definition, already a completed sale,
-- so it backfills as 'final'.

create type public.sale_document_status as enum ('draft', 'quotation', 'proforma', 'final');

alter table public.sales
  add column document_status public.sale_document_status not null default 'final';

create index idx_sales_document_status on public.sales(org_id, document_status);