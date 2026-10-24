begin;

alter table public.customer_portal_settings
  add column if not exists branch_storefronts_enabled boolean not null default false;

commit;
