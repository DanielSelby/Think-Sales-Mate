-- SalesMate ERP — auto-generated product SKUs.
-- Depends on 0002_inventory_sales.sql. Products created without a SKU (or
-- with an empty one) get a sequential "PRD-0001" style code per
-- organization, the same reliable pattern already used for sale_number
-- and invoice_number.

create function public.next_product_sku()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq integer;
begin
  if new.sku is not null and length(trim(new.sku)) > 0 then
    return new;
  end if;

  select count(*) + 1 into next_seq
  from public.products
  where org_id = new.org_id;

  new.sku := 'PRD-' || lpad(next_seq::text, 4, '0');

  return new;
end;
$$;

create trigger set_product_sku
  before insert on public.products
  for each row execute procedure public.next_product_sku();