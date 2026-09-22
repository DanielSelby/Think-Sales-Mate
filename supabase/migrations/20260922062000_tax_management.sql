begin;

create table if not exists public.accounting_tax_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  rate numeric(8, 4) not null check (rate >= 0),
  is_compound boolean not null default false,
  applies_to text not null default 'both' check (applies_to in ('sales', 'purchases', 'both')),
  is_active boolean not null default true,
  description text not null default '',
  unique(org_id, code)
);

create table if not exists public.accounting_tax_filings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period text not null,
  gross_sales numeric(14, 2) not null default 0,
  exempt_sales numeric(14, 2) not null default 0,
  taxable_sales numeric(14, 2) not null default 0,
  standard_vat numeric(14, 2) not null default 0,
  nhil numeric(14, 2) not null default 0,
  get_fund numeric(14, 2) not null default 0,
  covid_levy numeric(14, 2) not null default 0,
  total_output_tax numeric(14, 2) not null default 0,
  input_tax_deductions numeric(14, 2) not null default 0,
  withholding_tax_credited numeric(14, 2) not null default 0,
  net_tax_payable numeric(14, 2) not null default 0,
  filed_by uuid references auth.users(id),
  filed_at timestamptz not null default now()
);

alter table public.accounting_tax_rates enable row level security;
alter table public.accounting_tax_filings enable row level security;
create policy "accounting_tax_rates: members can read" on public.accounting_tax_rates for select using (public.is_org_member(org_id));
create policy "accounting_tax_rates: managers can manage" on public.accounting_tax_rates for all using (public.has_org_role(org_id, 'manager')) with check (public.has_org_role(org_id, 'manager'));
create policy "accounting_tax_filings: members can read" on public.accounting_tax_filings for select using (public.is_org_member(org_id));
create policy "accounting_tax_filings: managers can manage" on public.accounting_tax_filings for all using (public.has_org_role(org_id, 'manager')) with check (public.has_org_role(org_id, 'manager'));

commit;
