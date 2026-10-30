begin;

create table if not exists public.restaurant_pos_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete cascade
);

create index if not exists restaurant_pos_drafts_owner_updated_idx
  on public.restaurant_pos_drafts(org_id, created_by, updated_at desc);

alter table public.restaurant_pos_drafts enable row level security;
revoke all on public.restaurant_pos_drafts from public, anon, authenticated;
grant all on public.restaurant_pos_drafts to service_role;

commit;
