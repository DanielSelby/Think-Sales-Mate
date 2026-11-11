begin;

create table if not exists public.platform_hub_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  link_url text check (link_url is null or char_length(link_url) <= 2048),
  product_slugs text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.platform_admins(id) on delete set null,
  updated_by uuid references public.platform_admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at)
);

create index if not exists platform_hub_announcements_published_idx
  on public.platform_hub_announcements (published_at desc)
  where status = 'published';

alter table publicgit.platform_hub_announcements enable row level security;
revoke all on public.platform_hub_announcements from anon, authenticated;
grant all on public.platform_hub_announcements to service_role;

commit;
