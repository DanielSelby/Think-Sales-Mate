begin;

do $$
declare
  restaurant_table text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication does not exist.';
  end if;

  foreach restaurant_table in array array[
    'restaurant_menu_categories',
    'restaurant_menu_items',
    'restaurant_tables',
    'restaurant_orders',
    'restaurant_order_items',
    'restaurant_order_payments'
  ]
  loop
    if to_regclass(format('public.%I', restaurant_table)) is null then
      raise exception 'Required table public.% is missing. Apply the Restaurant Management migration first.', restaurant_table;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = restaurant_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', restaurant_table);
    end if;
  end loop;
end
$$;

commit;
