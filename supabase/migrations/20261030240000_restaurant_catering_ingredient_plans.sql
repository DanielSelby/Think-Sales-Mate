begin;

create table if not exists public.restaurant_catering_menu_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  menu_item_id uuid not null,
  quantity integer not null check (quantity between 1 and 10000),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, event_id, menu_item_id),
  foreign key (org_id, event_id)
    references public.restaurant_catering_events(org_id, id) on delete cascade,
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete restrict
);

create index if not exists restaurant_catering_menu_items_event_idx
  on public.restaurant_catering_menu_items(org_id, event_id);

alter table public.restaurant_catering_menu_items enable row level security;

drop policy if exists "Restaurant catering menu plans: members read assigned locations"
  on public.restaurant_catering_menu_items;
create policy "Restaurant catering menu plans: members read assigned locations"
  on public.restaurant_catering_menu_items for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.restaurant_catering_events event
      where event.org_id = restaurant_catering_menu_items.org_id
        and event.id = restaurant_catering_menu_items.event_id
        and public.can_access_org_location(restaurant_catering_menu_items.org_id, event.location_id)
    )
  );

revoke all on public.restaurant_catering_menu_items from public, anon, authenticated;
grant select on public.restaurant_catering_menu_items to authenticated;
grant all on public.restaurant_catering_menu_items to service_role;

create or replace function public.replace_restaurant_catering_menu_plan(
  p_org_id uuid,
  p_event_id uuid,
  p_menu_items jsonb,
  p_updated_by uuid
)
returns setof public.restaurant_catering_menu_items
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_spec jsonb;
  menu_item_uuid uuid;
  item_quantity integer;
  seen_menu_items uuid[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can update catering menu plans.';
  end if;
  if p_updated_by is null then
    raise exception 'A user is required to update the catering menu plan.';
  end if;
  if coalesce(jsonb_typeof(p_menu_items), '') <> 'array' or jsonb_array_length(p_menu_items) > 100 then
    raise exception 'Provide a valid catering menu with no more than 100 items.';
  end if;
  if not exists (
    select 1 from public.restaurant_catering_events
    where org_id = p_org_id and id = p_event_id and status not in ('completed', 'cancelled')
  ) then
    raise exception 'Catering event not found or no longer editable.';
  end if;

  for menu_spec in select value from jsonb_array_elements(p_menu_items)
  loop
    if jsonb_typeof(menu_spec) <> 'object'
      or coalesce(menu_spec->>'menu_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(menu_spec->>'quantity', '') !~ '^(?:[1-9][0-9]{0,3}|10000)$' then
      raise exception 'Each catering menu item requires a valid item ID and quantity between 1 and 10,000.';
    end if;
    menu_item_uuid := (menu_spec->>'menu_item_id')::uuid;
    item_quantity := (menu_spec->>'quantity')::integer;
    if menu_item_uuid = any(seen_menu_items) then
      raise exception 'Each menu item may only appear once in the catering plan.';
    end if;
    if not exists (
      select 1 from public.restaurant_menu_items
      where org_id = p_org_id and id = menu_item_uuid and is_active
    ) then
      raise exception 'A selected restaurant menu item is unavailable.';
    end if;
    seen_menu_items := array_append(seen_menu_items, menu_item_uuid);
  end loop;

  delete from public.restaurant_catering_menu_items
  where org_id = p_org_id and event_id = p_event_id
    and not (menu_item_id = any(seen_menu_items));

  for menu_spec in select value from jsonb_array_elements(p_menu_items)
  loop
    menu_item_uuid := (menu_spec->>'menu_item_id')::uuid;
    item_quantity := (menu_spec->>'quantity')::integer;
    insert into public.restaurant_catering_menu_items (
      org_id, event_id, menu_item_id, quantity, updated_by
    ) values (
      p_org_id, p_event_id, menu_item_uuid, item_quantity, p_updated_by
    )
    on conflict (org_id, event_id, menu_item_id) do update
      set quantity = excluded.quantity,
          updated_by = excluded.updated_by,
          updated_at = now();
  end loop;

  return query
    select * from public.restaurant_catering_menu_items plan
    where plan.org_id = p_org_id and plan.event_id = p_event_id
    order by plan.created_at, plan.id;
end;
$$;

revoke all on function public.replace_restaurant_catering_menu_plan(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_restaurant_catering_menu_plan(uuid, uuid, jsonb, uuid)
  to service_role;

commit;
