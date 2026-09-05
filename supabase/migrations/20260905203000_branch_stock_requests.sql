-- Branch stock requests are an approval layer in front of stock_transfers.
-- Approval creates the existing stock transfer; requests never move inventory.

create type public.stock_request_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'completed'
);

create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_number integer not null,
  requested_by uuid not null references auth.users(id),
  requesting_location_id uuid not null references public.business_locations(id),
  source_location_id uuid not null references public.business_locations(id),
  status public.stock_request_status not null default 'draft',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  expected_delivery_date date,
  reference text,
  notes text,
  rejection_reason text,
  transfer_id uuid references public.stock_transfers(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, request_number),
  check (requesting_location_id <> source_location_id)
);

create table public.stock_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.stock_requests(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  reason text,
  created_at timestamptz not null default now()
);

create table public.stock_request_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.stock_requests(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  approver_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  comment text,
  created_at timestamptz not null default now()
);

create table public.stock_request_timeline (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.stock_requests(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event text not null,
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.next_stock_request_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(request_number), 0) + 1 into new.request_number
  from public.stock_requests where org_id = new.org_id;
  return new;
end;
$$;

create trigger set_stock_request_number
before insert on public.stock_requests
for each row execute procedure public.next_stock_request_number();

alter table public.stock_requests enable row level security;
alter table public.stock_request_items enable row level security;
alter table public.stock_request_approvals enable row level security;
alter table public.stock_request_timeline enable row level security;

create policy "stock_requests: members can read" on public.stock_requests
  for select using (public.is_org_member(org_id));
create policy "stock_requests: members can create" on public.stock_requests
  for insert with check (public.is_org_member(org_id) and requested_by = auth.uid());
create policy "stock_requests: managers can update" on public.stock_requests
  for update using (public.has_org_role(org_id, 'manager'));

create policy "stock_request_items: members can read" on public.stock_request_items
  for select using (public.is_org_member(org_id));
create policy "stock_request_items: members can create" on public.stock_request_items
  for insert with check (public.is_org_member(org_id));

create policy "stock_request_approvals: members can read" on public.stock_request_approvals
  for select using (public.is_org_member(org_id));
create policy "stock_request_approvals: managers can create" on public.stock_request_approvals
  for insert with check (public.has_org_role(org_id, 'manager') and approver_id = auth.uid());

create policy "stock_request_timeline: members can read" on public.stock_request_timeline
  for select using (public.is_org_member(org_id));
create policy "stock_request_timeline: members can create" on public.stock_request_timeline
  for insert with check (public.is_org_member(org_id));

create index idx_stock_requests_org on public.stock_requests(org_id, created_at desc);
create index idx_stock_requests_status on public.stock_requests(org_id, status);
create index idx_stock_request_items_request on public.stock_request_items(request_id);
