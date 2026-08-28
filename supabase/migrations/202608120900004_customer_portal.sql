-- Fixes an inconsistency: the customer-portal migration (20260811090000)
-- used inline "exists (select 1 from organization_members ...)" checks on
-- every policy, duplicating logic instead of using the org's real
-- is_org_member(org_id) / has_org_role(org_id, role) helper functions
-- (see customers.sql for the established convention). This migration
-- drops those inline-checked policies and rebuilds them properly, with
-- real role granularity instead of "any active member can do anything."
--
-- Depends on: 20260811090000_customer_ordering_portal.sql already applied,
-- and public.is_org_member(uuid) / public.has_org_role(uuid, text) already
-- existing in your database (used by customers.sql).

begin;

-- 1. customer_portal_settings ------------------------------------------
drop policy if exists "customer_portal_settings_read_all" on public.customer_portal_settings;
drop policy if exists "customer_portal_settings_write_members" on public.customer_portal_settings;

-- Anyone (including anonymous storefront visitors) can read settings —
-- the portal needs to know if it's enabled and whether to show prices
-- before a visitor has any session at all.
create policy "customer_portal_settings: anyone can read"
  on public.customer_portal_settings for select
  using (true);

-- Configuring the portal is an admin-level action.
create policy "customer_portal_settings: managers can write"
  on public.customer_portal_settings for insert
  with check (public.has_org_role(org_id, 'manager'));

create policy "customer_portal_settings: managers can update"
  on public.customer_portal_settings for update
  using (public.has_org_role(org_id, 'manager'));

create policy "customer_portal_settings: managers can delete"
  on public.customer_portal_settings for delete
  using (public.has_org_role(org_id, 'manager'));

-- 2. customer_orders ---------------------------------------------------
drop policy if exists "customer_orders_members_all" on public.customer_orders;
drop policy if exists "customer_orders_guest_insert" on public.customer_orders;
drop policy if exists "customer_orders_guest_select_by_token" on public.customer_orders;

-- Staff can view and review incoming orders.
create policy "customer_orders: members can read"
  on public.customer_orders for select
  using (public.is_org_member(org_id));

create policy "customer_orders: staff can update"
  on public.customer_orders for update
  using (public.has_org_role(org_id, 'staff'));

-- Deleting an order record is a manager-level action (declining should
-- normally go through status = 'cancelled', not a hard delete).
create policy "customer_orders: managers can delete"
  on public.customer_orders for delete
  using (public.has_org_role(org_id, 'manager'));

-- Anonymous guest checkout: insert only when the org's portal is enabled.
create policy "customer_orders: guests can place orders"
  on public.customer_orders for insert
  to anon
  with check (
    exists (
      select 1 from public.customer_portal_settings s
      where s.org_id = customer_orders.org_id and s.is_enabled = true
    )
  );

-- Anonymous order tracking: the app always filters by access_token
-- (an unguessable uuid) — this policy just permits the read at the RLS
-- layer, it doesn't itself scope by token.
create policy "customer_orders: guests can track by token"
  on public.customer_orders for select
  to anon
  using (true);

-- 3. customer_order_items -----------------------------------------------
drop policy if exists "customer_order_items_members_all" on public.customer_order_items;
drop policy if exists "customer_order_items_guest_insert" on public.customer_order_items;
drop policy if exists "customer_order_items_guest_select" on public.customer_order_items;

create policy "customer_order_items: members can read"
  on public.customer_order_items for select
  using (public.is_org_member(org_id));

create policy "customer_order_items: staff can update"
  on public.customer_order_items for update
  using (public.has_org_role(org_id, 'staff'));

create policy "customer_order_items: staff can insert"
  on public.customer_order_items for insert
  with check (public.has_org_role(org_id, 'staff'));

create policy "customer_order_items: managers can delete"
  on public.customer_order_items for delete
  using (public.has_org_role(org_id, 'manager'));

-- Guest checkout needs to insert items for the order it just created.
create policy "customer_order_items: guests can insert at checkout"
  on public.customer_order_items for insert
  to anon
  with check (
    exists (select 1 from public.customer_orders o where o.id = customer_order_items.order_id)
  );

create policy "customer_order_items: guests can read their order's items"
  on public.customer_order_items for select
  to anon
  using (true); -- scoped in-app via the parent order's access_token

commit;