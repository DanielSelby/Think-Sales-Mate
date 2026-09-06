begin;

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'Custom Templates',
  template_code text not null,
  subject text,
  content text not null,
  channel text not null default 'In-App Notification',
  branch_scope text not null default 'all',
  status text not null default 'Draft' check (status in ('Draft','Pending Approval','Approved','Rejected','Archived')),
  version integer not null default 1,
  rejection_reason text,
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, template_code)
);

create table if not exists public.communication_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.communication_templates(id) on delete cascade,
  version integer not null,
  name text not null,
  subject text,
  content text not null,
  changed_by uuid not null references public.profiles(id),
  changes text,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists public.communication_automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event text not null,
  template_id uuid references public.communication_templates(id) on delete set null,
  channel text not null default 'In-App Notification',
  branch_scope text not null default 'all',
  enabled boolean not null default false,
  send_mode text not null default 'immediate' check (send_mode in ('immediate','delayed','scheduled')),
  delay_minutes integer,
  schedule_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, event)
);

create table if not exists public.communication_message_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.communication_templates(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  event text,
  channel text not null,
  recipient text,
  rendered_subject text,
  rendered_content text not null,
  status text not null default 'Sent' check (status in ('Sent','Delivered','Read','Failed','Cancelled')),
  sent_by uuid references public.profiles(id),
  branch_scope text,
  created_at timestamptz not null default now()
);

alter table public.communication_templates enable row level security;
alter table public.communication_template_versions enable row level security;
alter table public.communication_automations enable row level security;
alter table public.communication_message_history enable row level security;

create policy "communication templates members" on public.communication_templates for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "communication template versions members" on public.communication_template_versions for all
  using (exists (select 1 from public.communication_templates t where t.id = template_id and public.is_org_member(t.org_id)))
  with check (changed_by = auth.uid());
create policy "communication automations members" on public.communication_automations for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "communication message history members" on public.communication_message_history for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create index if not exists communication_templates_org_status_idx on public.communication_templates(org_id, status);
create index if not exists communication_message_history_org_created_idx on public.communication_message_history(org_id, created_at desc);

commit;
