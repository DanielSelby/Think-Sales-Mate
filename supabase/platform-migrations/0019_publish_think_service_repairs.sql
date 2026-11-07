update public.platform_products
set is_published = true,
    updated_at = now()
where slug = 'think-service-repairs';

do $$
begin
  if not exists (
    select 1
    from public.platform_products
    where slug = 'think-service-repairs'
  ) then
    raise exception 'Think Service & Repairs must be registered before it can be published.';
  end if;
end;
$$;
