begin;

-- A closure is a half-open period. Empty, reversed, and overlapping periods
-- would make subsequent Z-reports double-count transactions.
alter table public.register_closures
  add constraint register_closures_period_valid
    check (period_end > period_start);

create index if not exists register_closures_overlap_idx
  on public.register_closures (org_id, period_start, period_end);

create or replace function public.prevent_register_closure_overlap()
returns trigger
language plpgsql
as $$
begin
  -- Serialize closure checks per organization so two concurrent requests
  -- cannot both pass the overlap query before either row is committed.
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text, 0));

  if exists (
    select 1
    from public.register_closures existing
    where existing.org_id = new.org_id
      and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and existing.period_start < new.period_end
      and existing.period_end > new.period_start
      and (
        existing.location_id is null
        or new.location_id is null
        or existing.location_id = new.location_id
      )
      and (
        existing.scope = 'all'
        or new.scope = 'all'
        or existing.cashier_id = new.cashier_id
      )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Register closure period overlaps an existing closure';
  end if;
  return new;
end;
$$;

drop trigger if exists register_closures_prevent_overlap on public.register_closures;
create trigger register_closures_prevent_overlap
  before insert or update of org_id, location_id, scope, cashier_id, period_start, period_end
  on public.register_closures
  for each row
  execute function public.prevent_register_closure_overlap();

commit;
