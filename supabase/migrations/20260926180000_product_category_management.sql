begin;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code varchar(30) not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  icon text,
  color text,
  parent_id uuid,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_parent_fk
    foreign key (parent_id) references public.product_categories(id) on delete set null,
  constraint product_categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create unique index if not exists product_categories_org_name_idx
  on public.product_categories (org_id, lower(btrim(name)));
create unique index if not exists product_categories_org_code_idx
  on public.product_categories (org_id, upper(btrim(code)));
create index if not exists product_categories_org_status_order_idx
  on public.product_categories (org_id, status, display_order, name);

alter table public.products
  add column if not exists product_category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_product_category_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_product_category_id_fkey
      foreign key (product_category_id)
      references public.product_categories(id)
      on delete set null;
  end if;
end $$;

create index if not exists products_org_product_category_id_idx
  on public.products (org_id, product_category_id);

with category_names as (
  select org_id, btrim(category) as name
  from public.products
  where category is not null and btrim(category) <> ''
  group by org_id, btrim(category)
), numbered as (
  select org_id, name,
    row_number() over (partition by org_id order by lower(name), name) as ordinal
  from category_names
)
insert into public.product_categories (org_id, name, code, status)
select org_id, name, 'CAT-' || lpad(ordinal::text, 3, '0'), 'active'
from numbered
on conflict do nothing;

update public.products p
set product_category_id = c.id
from public.product_categories c
where p.org_id = c.org_id
  and p.product_category_id is null
  and lower(btrim(p.category)) = lower(btrim(c.name));

create or replace function public.sync_product_category_text()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_category public.product_categories%rowtype;
begin
  if new.product_category_id is not null
     and (tg_op = 'INSERT' or new.product_category_id is distinct from old.product_category_id) then
    select * into resolved_category
    from public.product_categories
    where id = new.product_category_id and org_id = new.org_id;
    if not found then
      raise exception 'Product category does not belong to this organization.';
    end if;
    new.category := resolved_category.name;
  elsif tg_op = 'INSERT' or new.category is distinct from old.category then
    if new.category is null then
      new.product_category_id := null;
    else
      select * into resolved_category
      from public.product_categories
      where org_id = new.org_id and lower(btrim(name)) = lower(btrim(new.category))
      limit 1;
      if found then
        new.product_category_id := resolved_category.id;
        new.category := resolved_category.name;
      else
        new.product_category_id := null;
      end if;
    end if;
  elsif new.product_category_id is null then
    new.category := null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_product_category_text on public.products;
create trigger products_sync_product_category_text
  before insert or update of category, product_category_id on public.products
  for each row execute function public.sync_product_category_text();

create or replace function public.sync_product_category_rename()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.products
    set category = new.name
    where org_id = new.org_id and product_category_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists product_categories_sync_rename on public.product_categories;
create trigger product_categories_sync_rename
  after update of name on public.product_categories
  for each row execute function public.sync_product_category_rename();

alter table public.product_categories enable row level security;

drop policy if exists "product_categories: members can read" on public.product_categories;
create policy "product_categories: members can read"
  on public.product_categories for select
  using (public.is_org_member(org_id));

commit;
