begin;

alter table public.restaurant_ingredient_purchase_orders
  add column if not exists invoice_amount numeric(14,2)
    check (invoice_amount is null or invoice_amount > 0),
  add column if not exists invoice_reconciliation_notes text;

create table if not exists public.restaurant_ingredient_invoice_reconciliation_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null,
  invoice_reference text,
  due_date date,
  invoice_amount numeric(14,2),
  reconciliation_notes text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, purchase_order_id)
    references public.restaurant_ingredient_purchase_orders(org_id, id) on delete restrict
);

create index if not exists restaurant_ingredient_invoice_history_order_idx
  on public.restaurant_ingredient_invoice_reconciliation_history(org_id, purchase_order_id, created_at desc);

alter table public.restaurant_ingredient_invoice_reconciliation_history enable row level security;
revoke all on public.restaurant_ingredient_invoice_reconciliation_history from public, anon, authenticated;
grant all on public.restaurant_ingredient_invoice_reconciliation_history to service_role;

create or replace function public.reconcile_restaurant_ingredient_invoice(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_invoice_reference text,
  p_due_date date,
  p_invoice_amount numeric,
  p_reconciliation_notes text,
  p_recorded_by uuid
)
returns table (
  invoice_amount numeric,
  received_total numeric,
  posted_total numeric,
  paid_total numeric,
  variance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_order public.restaurant_ingredient_purchase_orders;
  invoice_reference_value text;
  notes_value text;
  received_total_value numeric(14,2);
  posted_total_value numeric(14,2);
  paid_total_value numeric(14,2);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can reconcile Restaurant ingredient invoices.';
  end if;
  if p_recorded_by is null
    or (p_invoice_amount is not null and
      (p_invoice_amount <= 0 or p_invoice_amount <> round(p_invoice_amount, 2))) then
    raise exception 'Enter a valid supplier invoice amount.';
  end if;
  invoice_reference_value := nullif(btrim(p_invoice_reference), '');
  notes_value := nullif(btrim(p_reconciliation_notes), '');
  if length(invoice_reference_value) > 80 or length(notes_value) > 1000 then
    raise exception 'Invoice reference or reconciliation notes exceed the allowed length.';
  end if;

  select * into purchase_order
  from public.restaurant_ingredient_purchase_orders po
  where po.org_id = p_org_id and po.id = p_purchase_order_id
  for update;
  if not found then
    raise exception 'Restaurant ingredient purchase order not found.';
  end if;

  select coalesce(sum(receipt.amount), 0)::numeric(14,2),
    coalesce(sum(receipt.amount) filter (where receipt.accounting_status = 'posted'), 0)::numeric(14,2)
  into received_total_value, posted_total_value
  from public.restaurant_ingredient_receipts receipt
  where receipt.org_id = p_org_id and receipt.purchase_order_id = p_purchase_order_id;
  select coalesce(sum(payment.amount), 0)::numeric(14,2)
  into paid_total_value
  from public.restaurant_ingredient_payments payment
  where payment.org_id = p_org_id and payment.purchase_order_id = p_purchase_order_id;

  if p_invoice_amount is not null and paid_total_value > p_invoice_amount then
    raise exception 'The invoice amount cannot be lower than supplier payments already recorded.';
  end if;

  update public.restaurant_ingredient_purchase_orders po
  set invoice_reference = invoice_reference_value,
    due_date = p_due_date,
    invoice_amount = p_invoice_amount,
    invoice_reconciliation_notes = notes_value,
    updated_at = now()
  where po.org_id = p_org_id and po.id = p_purchase_order_id;

  insert into public.restaurant_ingredient_invoice_reconciliation_history (
    org_id, purchase_order_id, invoice_reference, due_date, invoice_amount,
    reconciliation_notes, recorded_by
  ) values (
    p_org_id, p_purchase_order_id, invoice_reference_value, p_due_date, p_invoice_amount,
    notes_value, p_recorded_by
  );

  return query select p_invoice_amount, received_total_value, posted_total_value,
    paid_total_value,
    case when p_invoice_amount is null then null
      else p_invoice_amount - received_total_value end;
end;
$$;

revoke all on function public.reconcile_restaurant_ingredient_invoice(uuid, uuid, text, date, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_restaurant_ingredient_invoice(uuid, uuid, text, date, numeric, text, uuid) to service_role;

create or replace function public.guard_restaurant_ingredient_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  declared_invoice_total numeric(14,2);
  received_total numeric(14,2);
begin
  select po.invoice_amount into declared_invoice_total
  from public.restaurant_ingredient_purchase_orders po
  where po.org_id = new.org_id and po.id = new.purchase_order_id
  for update;
  if not found then
    raise exception 'Restaurant ingredient purchase order not found.';
  end if;

  if declared_invoice_total is not null then
    select coalesce(sum(receipt.amount), 0)::numeric(14,2)
    into received_total
    from public.restaurant_ingredient_receipts receipt
    where receipt.org_id = new.org_id
      and receipt.purchase_order_id = new.purchase_order_id;
    if declared_invoice_total <> received_total then
      raise exception 'Supplier invoice total does not match the value of received ingredients. Reconcile the invoice before recording payment.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists restaurant_ingredient_invoice_payment_guard
  on public.restaurant_ingredient_payments;
create trigger restaurant_ingredient_invoice_payment_guard
  before insert on public.restaurant_ingredient_payments
  for each row execute function public.guard_restaurant_ingredient_invoice_payment();

revoke all on function public.guard_restaurant_ingredient_invoice_payment() from public, anon, authenticated;
grant execute on function public.guard_restaurant_ingredient_invoice_payment() to service_role;

commit;
