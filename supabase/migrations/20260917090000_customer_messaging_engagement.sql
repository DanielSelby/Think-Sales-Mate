begin;

create table if not exists public.customer_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  campaign_type text not null default 'General Announcement',
  audience text not null default 'All Customers',
  channel text not null default 'WhatsApp',
  template_id uuid references public.communication_templates(id) on delete set null,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Approved','Scheduled','Sent','Rejected','Cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  audience text not null default 'All Customers',
  channel text not null default 'WhatsApp',
  template_id uuid references public.communication_templates(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'Scheduled' check (status in ('Draft','Scheduled','Sent','Cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_message_approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.customer_message_campaigns(id) on delete cascade,
  action text not null check (action in ('Submitted','Approved','Rejected','Scheduled','Sent')),
  comment text,
  acted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_message_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  whatsapp boolean not null default true,
  sms boolean not null default true,
  email boolean not null default true,
  portal_notification boolean not null default true,
  preferred_channel text not null default 'WhatsApp',
  updated_at timestamptz not null default now(),
  unique (org_id, customer_id)
);

alter table public.customer_message_campaigns enable row level security;
alter table public.customer_scheduled_messages enable row level security;
alter table public.customer_message_approvals enable row level security;
alter table public.customer_message_preferences enable row level security;

create policy "customer message campaigns members" on public.customer_message_campaigns for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "customer scheduled messages members" on public.customer_scheduled_messages for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "customer message approvals members" on public.customer_message_approvals for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "customer message preferences members" on public.customer_message_preferences for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create index if not exists customer_message_campaigns_org_status_idx on public.customer_message_campaigns(org_id, status, created_at desc);
create index if not exists customer_scheduled_messages_org_date_idx on public.customer_scheduled_messages(org_id, scheduled_at);
create index if not exists customer_message_approvals_campaign_idx on public.customer_message_approvals(campaign_id, created_at desc);

commit;
