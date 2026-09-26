begin;

drop policy if exists "branch scope: products" on public.products;
create policy "branch scope: products"
  on public.products as restrictive for all
  using (
    public.can_access_org_location(org_id, location_id)
    or exists (
      select 1
      from public.product_stock_levels stock
      where stock.org_id = products.org_id
        and stock.product_id = products.id
        and public.can_access_org_location(stock.org_id, stock.location_id)
    )
  )
  with check (public.can_access_org_location(org_id, location_id));

commit;
