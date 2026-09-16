create table if not exists public.platform_support_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_type text not null check (contact_type in ('support_team', 'emergency', 'technical', 'sales_subscription')),
  name text not null,
  position text,
  department text,
  specialty text,
  role text,
  phone text,
  whatsapp text,
  email text,
  availability_status text not null default 'available',
  assigned_region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('CP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  organization_id uuid not null,
  organization_name text not null,
  submitted_by text not null,
  submitter_email text,
  category text not null,
  subject text not null,
  description text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('new', 'open', 'assigned', 'in_progress', 'awaiting_customer', 'resolved', 'closed')),
  assigned_to uuid references public.platform_admins(id),
  first_response_at timestamptz,
  resolved_at timestamptz,
  first_response_due timestamptz not null,
  resolution_due timestamptz not null,
  escalation_level integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.platform_complaints(id) on delete cascade,
  author_name text not null,
  author_email text,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_complaint_activity (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.platform_complaints(id) on delete cascade,
  action text not null,
  actor_name text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_complaints_status on public.platform_complaints(status, created_at desc);
create index if not exists idx_platform_complaints_organization on public.platform_complaints(organization_id, created_at desc);
create index if not exists idx_platform_complaint_messages_ticket on public.platform_complaint_messages(complaint_id, created_at);
create index if not exists idx_platform_complaint_activity_ticket on public.platform_complaint_activity(complaint_id, created_at desc);

alter table public.platform_support_contacts enable row level security;
alter table public.platform_complaints enable row level security;
alter table public.platform_complaint_messages enable row level security;
alter table public.platform_complaint_activity enable row level security;

create policy "platform admins manage support contacts" on public.platform_support_contacts for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage complaints" on public.platform_complaints for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage complaint messages" on public.platform_complaint_messages for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage complaint activity" on public.platform_complaint_activity for all using (public.is_platform_admin()) with check (public.is_platform_admin());
