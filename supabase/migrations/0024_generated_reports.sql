-- SalesMate ERP — logs every report a user actually exports/downloads, so
-- the Reports page's "Recent Reports" table shows real history instead of
-- fabricated rows.
create table public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  report_name text not null,
  report_type text not null,
  format text not null check (format in ('pdf', 'excel', 'csv')),
  generated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.generated_reports enable row level security;

create policy "generated_reports: members can read"
  on public.generated_reports for select
  using (public.is_org_member(org_id));

create policy "generated_reports: members can log their own exports"
  on public.generated_reports for insert
  with check (public.is_org_member(org_id) and generated_by = auth.uid());

create index idx_generated_reports_org on public.generated_reports(org_id, created_at desc);