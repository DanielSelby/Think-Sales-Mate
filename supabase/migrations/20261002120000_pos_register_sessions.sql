begin;

create table if not exists public.pos_register_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete restrict,
  cashier_id uuid not null references auth.users(id),
  cashier_name text,
  register_name text not null default 'POS-01',
  shift text,
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  notes text,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);

create unique index if not exists pos_register_sessions_one_open_per_cashier
  on public.pos_register_sessions(org_id, cashier_id)
  where status = 'open';
create index if not exists pos_register_sessions_cashier_status_idx
  on public.pos_register_sessions(org_id, cashier_id, status, opened_at desc);
create index if not exists pos_register_sessions_location_opened_idx
  on public.pos_register_sessions(org_id, location_id, opened_at desc);

alter table public.pos_register_sessions enable row level security;
create policy "POS register sessions: members read authorized branches"
  on public.pos_register_sessions for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
create policy "POS register sessions: staff open own session"
  on public.pos_register_sessions for insert
  with check (
    public.has_org_role(org_id, 'staff')
    and cashier_id = auth.uid()
    and public.can_access_org_location(org_id, location_id)
  );
drop policy if exists "POS register sessions: staff close own session" on public.pos_register_sessions;

create or replace function public.protect_pos_register_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed'
    or new.org_id is distinct from old.org_id
    or new.location_id is distinct from old.location_id
    or new.cashier_id is distinct from old.cashier_id
    or new.cashier_name is distinct from old.cashier_name
    or new.register_name is distinct from old.register_name
    or new.shift is distinct from old.shift
    or new.opening_cash is distinct from old.opening_cash
    or new.opened_at is distinct from old.opened_at
    or new.created_at is distinct from old.created_at
    or new.status <> 'closed'
    or new.closed_at is null
  then
    raise exception 'Register sessions may only be closed once by their cashier.';
  end if;
  return new;
end;
$$;

drop trigger if exists pos_register_sessions_protect on public.pos_register_sessions;
create trigger pos_register_sessions_protect
  before update on public.pos_register_sessions
  for each row execute function public.protect_pos_register_session();

alter table public.sales
  add column if not exists register_session_id uuid
  references public.pos_register_sessions(id) on delete set null;
alter table public.sales
  add column if not exists refund_payment_method text;
alter table public.sales
  add column if not exists refund_register_session_id uuid
  references public.pos_register_sessions(id) on delete set null;
create index if not exists sales_register_session_idx
  on public.sales(register_session_id)
  where register_session_id is not null;

alter table public.register_closures
  add column if not exists register_session_id uuid
    references public.pos_register_sessions(id) on delete set null,
  add column if not exists cash_in numeric(12,2) not null default 0,
  add column if not exists cash_out numeric(12,2) not null default 0;

create or replace function public.prevent_register_closure_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text, 0));

  if exists (
    select 1
    from public.register_closures existing
    where existing.org_id = new.org_id
      and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (existing.register_session_id is null) = (new.register_session_id is null)
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
      message = 'Register closure period overlaps an existing session closure';
  end if;
  return new;
end;
$$;

alter table public.cash_closings
  add column if not exists pos_cash_in numeric(12,2) not null default 0,
  add column if not exists pos_cash_out numeric(12,2) not null default 0,
  add column if not exists pos_register_session_count integer not null default 0;

create table if not exists public.pos_cash_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete restrict,
  register_session_id uuid not null references public.pos_register_sessions(id) on delete restrict,
  movement_type text not null check (movement_type in ('cash_in','cash_out','paid_out')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  reference text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.pos_cash_movements enable row level security;
create policy "POS cash movements: members read authorized branches"
  on public.pos_cash_movements for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
create policy "POS cash movements: staff record in authorized branches"
  on public.pos_cash_movements for insert
  with check (
    public.has_org_role(org_id, 'staff')
    and created_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
    and exists (
      select 1 from public.pos_register_sessions s
      where s.id = register_session_id
        and s.org_id = pos_cash_movements.org_id
        and s.location_id = pos_cash_movements.location_id
        and s.cashier_id = auth.uid()
        and s.status = 'open'
    )
  );
create index if not exists pos_cash_movements_session_idx
  on public.pos_cash_movements(register_session_id, created_at desc);

create or replace function public.validate_pos_register_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_session public.pos_register_sessions%rowtype;
begin
  select * into v_session
  from public.pos_register_sessions
  where id = new.register_session_id
  for update;

  if not found
    or v_session.status <> 'open'
    or v_session.org_id <> new.org_id
    or v_session.location_id <> new.location_id
    or v_session.cashier_id <> new.sold_by
  then
    raise exception 'POS sale requires the cashier''s open register session at this branch.';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_require_open_pos_register on public.sales;
create trigger sales_require_open_pos_register
  before insert or update of register_session_id, org_id, location_id, sold_by on public.sales
  for each row
  when (new.register_session_id is not null)
  execute function public.validate_pos_register_write();

create or replace function public.validate_pos_cash_movement_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_session public.pos_register_sessions%rowtype;
begin
  select * into v_session
  from public.pos_register_sessions
  where id = new.register_session_id
  for update;

  if not found
    or v_session.status <> 'open'
    or v_session.org_id <> new.org_id
    or v_session.location_id <> new.location_id
    or v_session.cashier_id <> new.created_by
  then
    raise exception 'Cash movement requires the creator''s open register session at this branch.';
  end if;
  return new;
end;
$$;

drop trigger if exists pos_cash_movements_require_open_session on public.pos_cash_movements;
create trigger pos_cash_movements_require_open_session
  before insert on public.pos_cash_movements
  for each row execute function public.validate_pos_cash_movement_session();

create or replace function public.close_pos_register_session(
  p_session_id uuid,
  p_org_id uuid,
  p_cashier_id uuid,
  p_closure jsonb,
  p_denominations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.pos_register_sessions%rowtype;
  v_closure_id uuid;
  v_line jsonb;
  v_sales_count integer;
  v_sales_total numeric(12,2);
  v_cash_in numeric(12,2);
  v_cash_out numeric(12,2);
begin
  select * into v_session
  from public.pos_register_sessions
  where id = p_session_id and org_id = p_org_id and cashier_id = p_cashier_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'Open register session not found.';
  end if;

  if (p_closure->>'location_id')::uuid is distinct from v_session.location_id
    or (p_closure->>'closed_by')::uuid is distinct from v_session.cashier_id
    or (p_closure->>'register_session_id')::uuid is distinct from v_session.id then
    raise exception 'Closure does not match the register session.';
  end if;

  select count(*)::integer, coalesce(sum(total), 0)
  into v_sales_count, v_sales_total
  from public.sales
  where org_id = v_session.org_id and register_session_id = v_session.id;

  select
    coalesce(sum(amount) filter (where movement_type = 'cash_in'), 0),
    coalesce(sum(amount) filter (where movement_type <> 'cash_in'), 0)
  into v_cash_in, v_cash_out
  from public.pos_cash_movements
  where org_id = v_session.org_id and register_session_id = v_session.id;

  if v_sales_count <> (p_closure->>'sales_count')::integer
    or abs(v_sales_total - (p_closure->>'sales_total')::numeric) > 0.01
    or abs(v_cash_in - (p_closure->>'cash_in')::numeric) > 0.01
    or abs(v_cash_out - (p_closure->>'cash_out')::numeric) > 0.01 then
    raise exception 'Register activity changed while closing. Refresh the summary and recount cash.';
  end if;

  insert into public.register_closures (
    org_id, location_id, scope, cashier_id, cashier_name,
    period_start, period_end, sales_count, sales_total, cash_total,
    card_total, momo_total, other_total, expenses_total, cash_in, cash_out,
    net_total, actual_cash, opening_cash, register_session_id, variance,
    variance_reason, status, approved_by, approved_at, closed_by
  ) values (
    p_org_id, v_session.location_id, 'individual', v_session.cashier_id, v_session.cashier_name,
    (p_closure->>'period_start')::timestamptz, (p_closure->>'period_end')::timestamptz,
    (p_closure->>'sales_count')::integer, (p_closure->>'sales_total')::numeric,
    (p_closure->>'cash_total')::numeric, (p_closure->>'card_total')::numeric,
    (p_closure->>'momo_total')::numeric, (p_closure->>'other_total')::numeric,
    (p_closure->>'expenses_total')::numeric, (p_closure->>'cash_in')::numeric,
    (p_closure->>'cash_out')::numeric, (p_closure->>'net_total')::numeric,
    (p_closure->>'actual_cash')::numeric, v_session.opening_cash, v_session.id,
    (p_closure->>'variance')::numeric, nullif(p_closure->>'variance_reason', ''),
    (p_closure->>'status'), nullif(p_closure->>'approved_by', '')::uuid,
    nullif(p_closure->>'approved_at', '')::timestamptz, v_session.cashier_id
  ) returning id into v_closure_id;

  if jsonb_typeof(coalesce(p_denominations, '[]'::jsonb)) <> 'array' then
    raise exception 'Denominations must be an array.';
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(p_denominations, '[]'::jsonb))
  loop
    insert into public.register_closure_lines (closure_id, org_id, denomination, quantity)
    values (
      v_closure_id, p_org_id,
      (v_line->>'denomination')::numeric,
      (v_line->>'quantity')::integer
    );
  end loop;

  update public.pos_register_sessions
  set status = 'closed', closed_at = now()
  where id = v_session.id and status = 'open';

  if not found then
    raise exception 'Register session was already closed.';
  end if;

  return v_closure_id;
end;
$$;

revoke all on function public.close_pos_register_session(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.close_pos_register_session(uuid, uuid, uuid, jsonb, jsonb) to service_role;

create or replace function public.record_pos_sale_refund(
  p_sale_id uuid,
  p_org_id uuid,
  p_actor_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_session_id uuid,
  p_location_id uuid,
  p_return_lines jsonb,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_session public.pos_register_sessions%rowtype;
  v_movement_id uuid;
  v_line jsonb;
  v_sale_item_quantity integer;
  v_already_returned integer;
  v_return_quantity integer;
  v_sale_item_id uuid;
  v_product_id uuid;
begin
  if p_amount < 0
    or (p_amount > 0 and p_payment_method is null)
    or (p_payment_method is not null and p_payment_method not in ('Cash', 'Card', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Other')) then
    raise exception 'Enter a valid refund amount and payment method.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and org_id = p_org_id
  for update;
  if not found then raise exception 'Sale not found.'; end if;
  if p_amount > v_sale.total then raise exception 'Refund amount cannot exceed the sale total.'; end if;
  if p_location_id is null then raise exception 'A branch is required to process a return.'; end if;
  if v_sale.location_id is not null and v_sale.location_id <> p_location_id then
    raise exception 'Return branch must match the sale branch.';
  end if;
  if not exists (
    select 1 from public.business_locations l
    where l.id = p_location_id and l.org_id = p_org_id
  ) then
    raise exception 'Return branch is not part of this organization.';
  end if;
  if jsonb_typeof(coalesce(p_return_lines, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_return_lines, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one item to return.';
  end if;

  for v_line in select value from jsonb_array_elements(p_return_lines)
  loop
    v_sale_item_id := (v_line->>'saleItemId')::uuid;
    v_product_id := (v_line->>'productId')::uuid;
    v_return_quantity := (v_line->>'quantity')::integer;
    if v_return_quantity <= 0 then raise exception 'Return quantities must be positive.'; end if;

    select si.quantity,
      coalesce((select sum(ri.quantity)::integer
        from public.sale_return_items ri
        where ri.sale_id = p_sale_id and ri.sale_item_id = si.id), 0)
    into v_sale_item_quantity, v_already_returned
    from public.sale_items si
    where si.id = v_sale_item_id
      and si.sale_id = p_sale_id
      and si.product_id = v_product_id;

    if not found or v_return_quantity > v_sale_item_quantity - v_already_returned then
      raise exception 'Return quantities exceed the remaining quantity for a sale line.';
    end if;

    insert into public.sale_return_items (
      org_id, sale_id, sale_item_id, product_id, quantity, location_id, created_by
    ) values (
      p_org_id, p_sale_id, v_sale_item_id, v_product_id, v_return_quantity, p_location_id, p_actor_id
    );

    perform public.adjust_product_stock_at_location(v_product_id, p_location_id, p_org_id, v_return_quantity);
  end loop;

  if lower(p_payment_method) = 'cash' and p_amount > 0 then
    select * into v_session
    from public.pos_register_sessions
    where id = p_session_id
      and org_id = p_org_id
      and location_id = p_location_id
      and cashier_id = p_actor_id
    for update;
    if not found or v_session.status <> 'open' then
      raise exception 'A cash refund requires your open register session at the sale branch.';
    end if;

    insert into public.pos_cash_movements (
      org_id, location_id, register_session_id, movement_type, amount, reason, reference, created_by
    ) values (
      p_org_id, p_location_id, v_session.id, 'cash_out', p_amount,
      coalesce(nullif(p_note, ''), 'Cash refund for sale ' || v_sale.sale_number::text),
      'SALE-' || v_sale.sale_number::text, p_actor_id
    ) returning id into v_movement_id;
  end if;

  update public.sales
  set status = 'returned',
      refunded_amount = p_amount,
      refund_payment_method = p_payment_method,
      refund_register_session_id = case when lower(p_payment_method) = 'cash' and p_amount > 0 then p_session_id else null end,
      status_note = nullif(p_note, ''),
      status_changed_by = p_actor_id,
      status_changed_at = now()
  where id = p_sale_id and org_id = p_org_id;

  return v_movement_id;
end;
$$;

revoke all on function public.record_pos_sale_refund(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_pos_sale_refund(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb, text) to service_role;

commit;
