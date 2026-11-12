begin;

create table if not exists public.education_inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  sku text not null check (char_length(btrim(sku)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  unit text not null check (char_length(btrim(unit)) between 1 and 24),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict
);

create unique index if not exists education_inventory_items_sku_idx
  on public.education_inventory_items (org_id, branch_id, lower(btrim(sku)));
create index if not exists education_inventory_items_catalog_idx
  on public.education_inventory_items (org_id, branch_id, status, name);

create table if not exists public.education_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  item_id uuid not null,
  movement_type text not null check (movement_type in ('opening', 'receipt', 'issue', 'adjustment')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, branch_id, item_id)
    references public.education_inventory_items(org_id, branch_id, id) on delete restrict
);

create index if not exists education_inventory_movements_item_idx
  on public.education_inventory_movements (org_id, branch_id, item_id, created_at desc);

create table if not exists public.education_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  asset_tag text not null check (char_length(btrim(asset_tag)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  serial_number text check (serial_number is null or char_length(btrim(serial_number)) <= 100),
  purchase_date date,
  condition text not null default 'good' check (condition in ('new', 'good', 'fair', 'poor')),
  status text not null default 'available' check (status in ('available', 'assigned', 'maintenance', 'retired')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict
);

create unique index if not exists education_assets_asset_tag_idx
  on public.education_assets (org_id, branch_id, lower(btrim(asset_tag)));
create unique index if not exists education_assets_serial_number_idx
  on public.education_assets (org_id, branch_id, lower(btrim(serial_number)))
  where serial_number is not null;
create index if not exists education_assets_status_idx
  on public.education_assets (org_id, branch_id, status, name);

create table if not exists public.education_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  asset_id uuid not null,
  student_id uuid,
  staff_id uuid,
  assigned_on date not null default current_date,
  returned_on date,
  assigned_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  returned_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((student_id is not null) <> (staff_id is not null)),
  check ((returned_on is null and returned_by is null) or (returned_on is not null and returned_by is not null)),
  foreign key (org_id, branch_id, asset_id)
    references public.education_assets(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict
);

create unique index if not exists education_assets_one_active_assignment_idx
  on public.education_asset_assignments (org_id, asset_id)
  where returned_on is null;
create index if not exists education_asset_assignments_history_idx
  on public.education_asset_assignments (org_id, branch_id, asset_id, assigned_on desc);

alter table public.education_inventory_items enable row level security;
alter table public.education_inventory_movements enable row level security;
alter table public.education_assets enable row level security;
alter table public.education_asset_assignments enable row level security;

create policy "education inventory items read"
  on public.education_inventory_items for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_inventory_assets', 'view'));

create policy "education inventory movements read"
  on public.education_inventory_movements for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_inventory_assets', 'view'));

create policy "education assets read"
  on public.education_assets for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_inventory_assets', 'view'));

create policy "education asset assignments read"
  on public.education_asset_assignments for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_inventory_assets', 'view'));

create or replace function public.education_inventory_create_item(
  p_org_id uuid,
  p_branch_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_unit text,
  p_initial_quantity integer,
  p_reorder_level integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_id uuid;
begin
  if auth.uid() is null
    or p_sku is null or char_length(btrim(p_sku)) not between 1 and 40
    or p_name is null or char_length(btrim(p_name)) not between 1 and 160
    or p_category is null or char_length(btrim(p_category)) not between 1 and 80
    or p_unit is null or char_length(btrim(p_unit)) not between 1 and 24
    or p_initial_quantity is null or p_initial_quantity < 0
    or p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Inventory item details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_inventory_assets', 'create') then
    raise exception 'You are not authorized to create inventory items at this campus.' using errcode = '42501';
  end if;

  insert into public.education_inventory_items (
    org_id, branch_id, sku, name, category, unit, quantity_on_hand, reorder_level, created_by
  ) values (
    p_org_id, p_branch_id, upper(btrim(p_sku)), btrim(p_name), btrim(p_category), btrim(p_unit),
    p_initial_quantity, p_reorder_level, auth.uid()
  ) returning id into item_id;

  if p_initial_quantity > 0 then
    insert into public.education_inventory_movements (
      org_id, branch_id, item_id, movement_type, quantity_change, quantity_after, reason, created_by
    ) values (
      p_org_id, p_branch_id, item_id, 'opening', p_initial_quantity, p_initial_quantity, 'Opening balance', auth.uid()
    );
  end if;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_inventory_item_created', 'education_inventory_item', item_id,
    jsonb_build_object('branch_id', p_branch_id, 'sku', upper(btrim(p_sku)), 'initial_quantity', p_initial_quantity)
  );
  return item_id;
end;
$$;

create or replace function public.education_inventory_adjust_stock(
  p_org_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row public.education_inventory_items%rowtype;
  next_quantity bigint;
  movement_id uuid;
begin
  if auth.uid() is null
    or p_movement_type is null or p_movement_type not in ('receipt', 'issue', 'adjustment')
    or p_quantity is null or p_quantity = 0
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 300
    or (p_movement_type = 'receipt' and p_quantity < 0)
    or (p_movement_type = 'issue' and p_quantity > 0) then
    raise exception 'Stock movement details are invalid.' using errcode = '22023';
  end if;
  select * into item_row
  from public.education_inventory_items
  where org_id = p_org_id and id = p_item_id
  for update;
  if not found then
    raise exception 'The inventory item was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, item_row.branch_id, 'education_inventory_assets', 'edit') then
    raise exception 'You are not authorized to adjust inventory at this campus.' using errcode = '42501';
  end if;
  if item_row.status <> 'active' then
    raise exception 'Archived inventory items cannot be adjusted.' using errcode = '22023';
  end if;
  next_quantity := item_row.quantity_on_hand::bigint + p_quantity::bigint;
  if next_quantity < 0 or next_quantity > 2147483647 then
    raise exception 'The stock change would result in an invalid on-hand quantity.' using errcode = '22023';
  end if;

  update public.education_inventory_items
  set quantity_on_hand = next_quantity, updated_at = now()
  where org_id = p_org_id and id = p_item_id;
  insert into public.education_inventory_movements (
    org_id, branch_id, item_id, movement_type, quantity_change, quantity_after, reason, created_by
  ) values (
    p_org_id, item_row.branch_id, p_item_id, p_movement_type, p_quantity, next_quantity, btrim(p_reason), auth.uid()
  ) returning id into movement_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_inventory_stock_changed', 'education_inventory_item', p_item_id,
    jsonb_build_object('branch_id', item_row.branch_id, 'movement_id', movement_id, 'movement_type', p_movement_type, 'quantity_change', p_quantity, 'quantity_after', next_quantity, 'reason', btrim(p_reason))
  );
  return movement_id;
end;
$$;

create or replace function public.education_assets_create_asset(
  p_org_id uuid,
  p_branch_id uuid,
  p_asset_tag text,
  p_name text,
  p_category text,
  p_serial_number text,
  p_purchase_date date,
  p_condition text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  asset_id uuid;
begin
  if auth.uid() is null
    or p_asset_tag is null or char_length(btrim(p_asset_tag)) not between 1 and 40
    or p_name is null or char_length(btrim(p_name)) not between 1 and 160
    or p_category is null or char_length(btrim(p_category)) not between 1 and 80
    or char_length(coalesce(p_serial_number, '')) > 100
    or (p_purchase_date is not null and p_purchase_date > current_date)
    or p_condition is null or p_condition not in ('new', 'good', 'fair', 'poor') then
    raise exception 'Asset details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_inventory_assets', 'create') then
    raise exception 'You are not authorized to register assets at this campus.' using errcode = '42501';
  end if;

  insert into public.education_assets (
    org_id, branch_id, asset_tag, name, category, serial_number, purchase_date, condition, created_by
  ) values (
    p_org_id, p_branch_id, upper(btrim(p_asset_tag)), btrim(p_name), btrim(p_category),
    nullif(btrim(p_serial_number), ''), p_purchase_date, p_condition, auth.uid()
  ) returning id into asset_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_asset_registered', 'education_asset', asset_id,
    jsonb_build_object('branch_id', p_branch_id, 'asset_tag', upper(btrim(p_asset_tag)), 'category', btrim(p_category))
  );
  return asset_id;
end;
$$;

create or replace function public.education_assets_assign_asset(
  p_org_id uuid,
  p_asset_id uuid,
  p_assignee_type text,
  p_assignee_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  asset_row public.education_assets%rowtype;
  assignment_id uuid;
begin
  if auth.uid() is null or p_assignee_type is null
    or p_assignee_type not in ('student', 'staff') or p_assignee_id is null then
    raise exception 'Select a valid student or staff member for the asset assignment.' using errcode = '22023';
  end if;
  select * into asset_row
  from public.education_assets
  where org_id = p_org_id and id = p_asset_id
  for update;
  if not found then
    raise exception 'The asset was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, asset_row.branch_id, 'education_inventory_assets', 'edit') then
    raise exception 'You are not authorized to assign this asset.' using errcode = '42501';
  end if;
  if (p_assignee_type = 'student'
      and not public.education_can_access_branch(p_org_id, asset_row.branch_id, 'education_students', 'view'))
    or (p_assignee_type = 'staff'
      and not public.education_can_access_branch(p_org_id, asset_row.branch_id, 'education_staff', 'view')) then
    raise exception 'You are not authorized to view the selected assignee at this campus.' using errcode = '42501';
  end if;
  if asset_row.status <> 'available' then
    raise exception 'Only available assets can be assigned.' using errcode = '22023';
  end if;
  if p_assignee_type = 'student' then
    perform 1 from public.education_students
    where org_id = p_org_id and branch_id = asset_row.branch_id
      and id = p_assignee_id and status = 'active'
    for update;
  else
    perform 1 from public.education_staff
    where org_id = p_org_id and branch_id = asset_row.branch_id
      and id = p_assignee_id and status = 'active'
    for update;
  end if;
  if not found then
    raise exception 'The active student or staff member was not found at this campus.' using errcode = 'P0002';
  end if;

  insert into public.education_asset_assignments (
    org_id, branch_id, asset_id, student_id, staff_id, assigned_by
  ) values (
    p_org_id, asset_row.branch_id, p_asset_id,
    case when p_assignee_type = 'student' then p_assignee_id else null end,
    case when p_assignee_type = 'staff' then p_assignee_id else null end,
    auth.uid()
  ) returning id into assignment_id;
  update public.education_assets
  set status = 'assigned', updated_at = now()
  where org_id = p_org_id and id = p_asset_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_asset_assigned', 'education_asset_assignment', assignment_id,
    jsonb_build_object('branch_id', asset_row.branch_id, 'asset_id', p_asset_id, 'assignee_type', p_assignee_type, 'assignee_id', p_assignee_id)
  );
  return assignment_id;
end;
$$;

create or replace function public.education_assets_return_asset(
  p_org_id uuid,
  p_assignment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.education_asset_assignments%rowtype;
  asset_row public.education_assets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to return an asset.' using errcode = '42501';
  end if;
  select * into assignment_row
  from public.education_asset_assignments
  where org_id = p_org_id and id = p_assignment_id
  for update;
  if not found then
    raise exception 'The asset assignment was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, assignment_row.branch_id, 'education_inventory_assets', 'edit') then
    raise exception 'You are not authorized to return this asset.' using errcode = '42501';
  end if;
  if assignment_row.returned_on is not null then
    raise exception 'This asset assignment has already ended.' using errcode = '22023';
  end if;

  select * into asset_row
  from public.education_assets
  where org_id = p_org_id and id = assignment_row.asset_id
  for update;
  if not found then
    raise exception 'The assigned asset was not found.' using errcode = 'P0002';
  end if;
  update public.education_asset_assignments
  set returned_on = current_date, returned_by = auth.uid()
  where org_id = p_org_id and id = p_assignment_id;
  update public.education_assets
  set status = 'available', updated_at = now()
  where org_id = p_org_id and id = assignment_row.asset_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_asset_returned', 'education_asset_assignment', p_assignment_id,
    jsonb_build_object('branch_id', assignment_row.branch_id, 'asset_id', assignment_row.asset_id, 'returned_on', current_date)
  );
  return true;
end;
$$;

create or replace function public.education_assets_set_status(
  p_org_id uuid,
  p_asset_id uuid,
  p_status text,
  p_condition text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  asset_row public.education_assets%rowtype;
begin
  if auth.uid() is null
    or p_status is null or p_status not in ('available', 'maintenance', 'retired')
    or p_condition is null or p_condition not in ('new', 'good', 'fair', 'poor') then
    raise exception 'Asset status or condition is invalid.' using errcode = '22023';
  end if;
  select * into asset_row
  from public.education_assets
  where org_id = p_org_id and id = p_asset_id
  for update;
  if not found then
    raise exception 'The asset was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, asset_row.branch_id, 'education_inventory_assets', 'edit') then
    raise exception 'You are not authorized to update this asset.' using errcode = '42501';
  end if;
  if asset_row.status = 'assigned' or asset_row.status = 'retired'
    or (p_status = 'available' and asset_row.status <> 'maintenance') then
    raise exception 'Return the asset before changing its status.' using errcode = '22023';
  end if;

  update public.education_assets
  set status = p_status, condition = p_condition, updated_at = now()
  where org_id = p_org_id and id = p_asset_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_asset_status_changed', 'education_asset', p_asset_id,
    jsonb_build_object('branch_id', asset_row.branch_id, 'previous_status', asset_row.status, 'status', p_status, 'previous_condition', asset_row.condition, 'condition', p_condition)
  );
  return true;
end;
$$;

revoke all on function public.education_inventory_create_item(uuid, uuid, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.education_inventory_create_item(uuid, uuid, text, text, text, text, integer, integer) to authenticated;
revoke all on function public.education_inventory_adjust_stock(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.education_inventory_adjust_stock(uuid, uuid, text, integer, text) to authenticated;
revoke all on function public.education_assets_create_asset(uuid, uuid, text, text, text, text, date, text) from public, anon;
grant execute on function public.education_assets_create_asset(uuid, uuid, text, text, text, text, date, text) to authenticated;
revoke all on function public.education_assets_assign_asset(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.education_assets_assign_asset(uuid, uuid, text, uuid) to authenticated;
revoke all on function public.education_assets_return_asset(uuid, uuid) from public, anon;
grant execute on function public.education_assets_return_asset(uuid, uuid) to authenticated;
revoke all on function public.education_assets_set_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.education_assets_set_status(uuid, uuid, text, text) to authenticated;

grant select on public.education_inventory_items, public.education_inventory_movements,
  public.education_assets, public.education_asset_assignments to authenticated;
revoke insert, update, delete on public.education_inventory_items, public.education_inventory_movements,
  public.education_assets, public.education_asset_assignments from authenticated;
revoke all on public.education_inventory_items, public.education_inventory_movements,
  public.education_assets, public.education_asset_assignments from anon;

commit;
