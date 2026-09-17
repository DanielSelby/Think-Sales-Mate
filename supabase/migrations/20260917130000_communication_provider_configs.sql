begin;

create table if not exists public.communication_provider_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('whatsapp_cloud','twilio_whatsapp','meta_compatible_whatsapp','hubtel','arkesel','africas_talking','resend')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

alter table public.communication_provider_configs enable row level security;
create policy "communication provider configs members" on public.communication_provider_configs for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id) and created_by = auth.uid());

create index if not exists communication_provider_configs_org_idx
  on public.communication_provider_configs(org_id, provider);

commit;
