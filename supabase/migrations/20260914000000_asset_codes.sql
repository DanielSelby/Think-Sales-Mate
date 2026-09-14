-- Give every operational asset a stable, organization-scoped code.
alter table public.assets add column if not exists asset_code text;

with numbered_assets as (
  select id,
    'AST-' || lpad(row_number() over (partition by org_id order by created_at, id)::text, 6, '0') as generated_code
  from public.assets
)
update public.assets
set asset_code = numbered_assets.generated_code
from numbered_assets
where public.assets.id = numbered_assets.id
  and public.assets.asset_code is null;

alter table public.assets alter column asset_code set not null;
create unique index if not exists idx_assets_org_asset_code on public.assets(org_id, asset_code);

create or replace function public.assign_asset_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.asset_code is null or btrim(new.asset_code) = '' then
    loop
      candidate := 'AST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (
        select 1 from public.assets
        where org_id = new.org_id and asset_code = candidate
      );
    end loop;
    new.asset_code := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists assets_assign_code on public.assets;
create trigger assets_assign_code
before insert on public.assets
for each row execute function public.assign_asset_code();
