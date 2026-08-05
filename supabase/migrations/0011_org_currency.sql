-- SalesMate ERP — per-organization default currency.
-- Depends on 0001_core_schema.sql. Every money display in the app reads
-- this via getCurrentOrgContext() and lib/currency.ts's formatMoney().

alter table public.organizations
  add column currency text not null default 'USD';