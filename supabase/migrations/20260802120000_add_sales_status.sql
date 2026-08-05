-- Adds real sales-status tracking so "Returned" / "Cancelled" reflect actual
-- business events instead of being inferred from payment amounts.
--
-- Run with: supabase migration up   (or paste into the SQL editor)
-- Then regenerate types: npm run db:types

begin;

-- 1. Status enum -------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type sale_status as enum ('completed', 'returned', 'cancelled');
  end if;
end $$;

-- 2. Columns on `sales` -------------------------------------------------
alter table public.sales
  add column if not exists status sale_status not null default 'completed',
  add column if not exists refunded_amount numeric(12, 2) not null default 0,
  add column if not exists status_note text,
  add column if not exists status_changed_by uuid references public.profiles (id),
  add column if not exists status_changed_at timestamptz not null default now();

alter table public.sales
  add constraint sales_refunded_amount_check
    check (refunded_amount >= 0 and refunded_amount <= total);

-- A cancelled sale should read as fully refunded/void for reporting;
-- a plain "returned" sale may be a partial return, tracked via refunded_amount.
create index if not exists sales_org_status_idx on public.sales (org_id, status);

-- 3. Keep status_changed_at honest on update -----------------------------
create or replace function public.touch_sale_status_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sales_status_changed_at on public.sales;
create trigger sales_status_changed_at
  before update on public.sales
  for each row
  execute function public.touch_sale_status_changed_at();

-- 4. Audit log on status change ------------------------------------------
create or replace function public.log_sale_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      new.org_id,
      new.status_changed_by,
      'sale.status_changed',
      'sales',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'note', new.status_note)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sales_status_change_audit on public.sales;
create trigger sales_status_change_audit
  after update on public.sales
  for each row
  execute function public.log_sale_status_change();

commit;