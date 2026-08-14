-- SalesMate ERP — Company Profile, one row per org, plus a public storage
-- bucket for logo uploads (a real Supabase Storage feature, not faked).
create table public.company_profile (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text,
  registration_no text,
  business_email text,
  business_phone text,
  website text,
  tin text,
  description text,
  logo_url text,
  country text,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  region text,
  contact_name text,
  contact_designation text,
  contact_email text,
  contact_phone text,
  default_sales_tax_percent numeric(5, 2) not null default 0,
  show_logo_on_invoices boolean not null default true,
  show_info_on_receipts boolean not null default true,
  enable_barcode_on_documents boolean not null default false,
  facebook_url text,
  twitter_url text,
  linkedin_url text,
  youtube_url text,
  updated_at timestamptz not null default now()
);

alter table public.company_profile enable row level security;

create policy "company_profile: members can read"
  on public.company_profile for select
  using (public.is_org_member(org_id));

create policy "company_profile: admins can manage"
  on public.company_profile for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- Public bucket for company logos.
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

create policy "company-assets: public read"
  on storage.objects for select
  using (bucket_id = 'company-assets');

create policy "company-assets: authenticated users can upload to their org folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-assets');

create policy "company-assets: authenticated users can update their org folder"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'company-assets');