-- Customer Ordering Portal & Order Tracker Enhancements Migration
-- Adds settings, order fields, timeline tracking, and notifications.

begin;

-- 1. customer_portal_settings extensions ------------------------------------
alter table public.customer_portal_settings
  add column if not exists allow_customer_location_selection boolean not null default true,
  add column if not exists allow_guest_orders boolean not null default true,
  add column if not exists require_customer_account boolean not null default false,
  add column if not exists auto_reserve_stock_on_approval boolean not null default true,
  add column if not exists send_email_notifications boolean not null default true,
  add column if not exists send_whatsapp_notifications boolean not null default false;

-- 2. customer_orders extensions ---------------------------------------------
alter table public.customer_orders
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('paid', 'partial', 'unpaid')),
  add column if not exists delivery_status text not null default 'not_shipped' check (delivery_status in ('not_shipped', 'picking', 'packing', 'in_delivery', 'delivered')),
  add column if not exists sales_person_id uuid references public.profiles (id),
  add column if not exists expected_delivery_date date,
  add column if not exists stock_reserved boolean not null default false,
  add column if not exists rejection_reason text;

-- 3. customer_order_timeline table -------------------------------------------
create table if not exists public.customer_order_timeline (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  actor_name text not null,
  actor_id uuid references public.profiles (id),
  status text not null default 'completed',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_order_timeline_order on public.customer_order_timeline (order_id, created_at asc);
create index if not exists idx_customer_order_timeline_org on public.customer_order_timeline (org_id);

alter table public.customer_order_timeline enable row level security;

create policy "timeline: members can read"
  on public.customer_order_timeline for select
  using (public.is_org_member(org_id));

create policy "timeline: staff can insert"
  on public.customer_order_timeline for insert
  with check (public.has_org_role(org_id, 'staff'));

create policy "timeline: guests can read by order"
  on public.customer_order_timeline for select
  to anon
  using (true);

create policy "timeline: guests can insert on order creation"
  on public.customer_order_timeline for insert
  to anon
  with check (
    exists (select 1 from public.customer_orders o where o.id = customer_order_timeline.order_id)
  );

-- 4. notifications table ----------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id),
  location_id uuid references public.business_locations (id),
  title text not null,
  message text not null,
  type text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'whatsapp')),
  entity_type text not null default 'customer_orders',
  entity_id uuid,
  recipient_contact text,
  is_read boolean not null default false,
  status text not null default 'delivered',
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_org on public.notifications (org_id, created_at desc);
create index if not exists idx_notifications_user on public.notifications (user_id, is_read);
create index if not exists idx_notifications_location on public.notifications (location_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: members can read"
  on public.notifications for select
  using (public.is_org_member(org_id));

create policy "notifications: staff can update"
  on public.notifications for update
  using (public.has_org_role(org_id, 'staff'));

create policy "notifications: members can insert"
  on public.notifications for insert
  with check (public.is_org_member(org_id));

create policy "notifications: anon can insert order notification"
  on public.notifications for insert
  to anon
  with check (true);

commit;
