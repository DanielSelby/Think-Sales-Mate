-- SalesMate ERP — assigns each team member to a branch, for the User
-- Management console's "Branch" column/filter and "Users by Branch" chart.
alter table public.organization_members
  add column location_id uuid references public.business_locations(id);

create index idx_org_members_location on public.organization_members(location_id);