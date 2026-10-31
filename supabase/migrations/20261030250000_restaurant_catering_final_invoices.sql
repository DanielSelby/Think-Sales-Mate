begin;

alter table public.invoices
  add column amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  add column source_catering_event_id uuid,
  add column source_catering_quote_id uuid;

update public.invoices
set amount_paid = amount
where status = 'paid';

alter table public.invoices
  add constraint invoices_amount_paid_lte_amount check (amount_paid <= amount),
  add constraint invoices_org_id_id_key unique (org_id, id),
  add constraint invoices_catering_source_fk
    foreign key (org_id, source_catering_event_id, source_catering_quote_id)
    references public.restaurant_catering_quotes(org_id, event_id, id)
    on delete restrict,
  add constraint invoices_catering_source_complete_check
    check (
      (source_catering_event_id is null and source_catering_quote_id is null)
      or (source_catering_event_id is not null and source_catering_quote_id is not null)
    );

create unique index invoices_one_catering_final_per_event_idx
  on public.invoices(org_id, source_catering_event_id)
  where source_catering_event_id is not null;

alter table public.restaurant_catering_payments
  add column invoice_id uuid,
  add constraint restaurant_catering_payment_invoice_fk
    foreign key (org_id, invoice_id) references public.invoices(org_id, id)
    on delete restrict;

create index restaurant_catering_payments_invoice_paid_idx
  on public.restaurant_catering_payments(org_id, invoice_id, paid_at desc)
  where invoice_id is not null;

create or replace function public.issue_restaurant_catering_final_invoice(
  p_org_id uuid,
  p_event_id uuid,
  p_due_date date,
  p_created_by uuid
)
returns table (
  invoice_id uuid,
  invoice_number integer,
  amount numeric,
  amount_paid numeric,
  balance_due numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.restaurant_catering_events%rowtype;
  target_quote public.restaurant_catering_quotes%rowtype;
  existing_invoice public.invoices%rowtype;
  total_paid numeric(12,2);
  last_payment_at timestamptz;
  inserted_invoice public.invoices%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can issue catering final invoices.';
  end if;
  if p_created_by is null or p_due_date is null or p_due_date < current_date then
    raise exception 'Enter a valid invoice due date.';
  end if;

  select * into target_event
  from public.restaurant_catering_events
  where org_id = p_org_id and id = p_event_id
  for update;
  if not found or target_event.status <> 'completed' then
    raise exception 'A final invoice can only be issued after the event is completed.';
  end if;

  select * into target_quote
  from public.restaurant_catering_quotes
  where org_id = p_org_id and event_id = p_event_id and status in ('issued', 'accepted')
  order by version desc
  limit 1
  for update;
  if not found then
    raise exception 'An active catering quotation is required to issue the final invoice.';
  end if;

  select * into existing_invoice
  from public.invoices
  where org_id = p_org_id and source_catering_event_id = p_event_id
  for update;
  if found then
    if existing_invoice.source_catering_quote_id <> target_quote.id then
      raise exception 'A final invoice already exists for a different catering quotation.';
    end if;
    return query select existing_invoice.id, existing_invoice.invoice_number,
      existing_invoice.amount, existing_invoice.amount_paid,
      existing_invoice.amount - existing_invoice.amount_paid;
    return;
  end if;

  select coalesce(sum(payment.amount), 0)::numeric(12,2), max(payment.paid_at)
  into total_paid, last_payment_at
  from public.restaurant_catering_payments payment
  where payment.org_id = p_org_id and payment.event_id = p_event_id
    and payment.quote_id = target_quote.id;

  if total_paid > target_quote.total then
    raise exception 'Recorded catering payments exceed the quotation total.';
  end if;

  insert into public.invoices (
    org_id, customer_name, amount, amount_paid, status, due_date, paid_at, created_by,
    source_catering_event_id, source_catering_quote_id
  ) values (
    p_org_id,
    coalesce(nullif(btrim(target_event.customer_organization), ''), target_event.customer_name),
    target_quote.total,
    total_paid,
    case when total_paid = target_quote.total then 'paid'::public.invoice_status
      when p_due_date < current_date then 'overdue'::public.invoice_status
      else 'sent'::public.invoice_status end,
    p_due_date,
    case when total_paid = target_quote.total then last_payment_at else null end,
    p_created_by,
    p_event_id,
    target_quote.id
  ) returning * into inserted_invoice;

  update public.restaurant_catering_payments
  set invoice_id = inserted_invoice.id
  where org_id = p_org_id and event_id = p_event_id
    and quote_id = target_quote.id and invoice_id is null;

  return query select inserted_invoice.id, inserted_invoice.invoice_number,
    inserted_invoice.amount, inserted_invoice.amount_paid,
    inserted_invoice.amount - inserted_invoice.amount_paid;
end;
$$;

revoke all on function public.issue_restaurant_catering_final_invoice(uuid, uuid, date, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_restaurant_catering_final_invoice(uuid, uuid, date, uuid)
  to service_role;

create or replace function public.sync_restaurant_catering_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invoice public.invoices%rowtype;
  total_paid numeric(12,2);
  last_payment_at timestamptz;
begin
  if tg_op = 'UPDATE' and old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
    raise exception 'A catering payment cannot be moved between invoices.';
  end if;
  if new.invoice_id is null then
    return new;
  end if;

  select * into target_invoice
  from public.invoices
  where org_id = new.org_id and id = new.invoice_id
  for update;
  if not found
    or target_invoice.source_catering_event_id <> new.event_id
    or target_invoice.source_catering_quote_id <> new.quote_id
    or target_invoice.status = 'void' then
    raise exception 'The catering payment does not match an active final invoice.';
  end if;

  select coalesce(sum(payment.amount), 0)::numeric(12,2), max(payment.paid_at)
  into total_paid, last_payment_at
  from public.restaurant_catering_payments payment
  where payment.org_id = new.org_id and payment.invoice_id = new.invoice_id;
  if total_paid > target_invoice.amount then
    raise exception 'Catering payments exceed the final invoice balance.';
  end if;

  update public.invoices
  set amount_paid = total_paid,
    status = case when total_paid = target_invoice.amount then 'paid'::public.invoice_status
      when due_date < current_date then 'overdue'::public.invoice_status
      else 'sent'::public.invoice_status end,
    paid_at = case when total_paid = target_invoice.amount then last_payment_at else null end
  where org_id = new.org_id and id = new.invoice_id;

  return new;
end;
$$;

drop trigger if exists restaurant_catering_invoice_payment_sync
  on public.restaurant_catering_payments;
create trigger restaurant_catering_invoice_payment_sync
  after insert or update of invoice_id on public.restaurant_catering_payments
  for each row execute function public.sync_restaurant_catering_invoice_payment();

revoke all on function public.sync_restaurant_catering_invoice_payment() from public, anon, authenticated;
grant execute on function public.sync_restaurant_catering_invoice_payment() to service_role;

create or replace function public.record_restaurant_catering_payment(
  p_org_id uuid,
  p_event_id uuid,
  p_quote_id uuid,
  p_request_key uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text,
  p_paid_at timestamptz,
  p_recorded_by uuid
)
returns table (payment_id uuid, total_paid numeric, balance_due numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_quote public.restaurant_catering_quotes%rowtype;
  existing_payment public.restaurant_catering_payments%rowtype;
  inserted_payment public.restaurant_catering_payments%rowtype;
  target_invoice public.invoices%rowtype;
  amount_received numeric(12,2);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record catering payments.';
  end if;
  if p_request_key is null
    or p_amount is null or p_amount <= 0 or p_amount * 100 <> trunc(p_amount * 100)
    or p_payment_method not in ('cash', 'card', 'bank_transfer', 'mobile_money', 'other')
    or length(coalesce(p_reference, '')) > 120
    or p_paid_at is null or p_paid_at > now() + interval '5 minutes' then
    raise exception 'Enter a valid catering payment amount, method, reference, and date.';
  end if;

  select * into existing_payment
  from public.restaurant_catering_payments
  where org_id = p_org_id and request_key = p_request_key;
  if found then
    if existing_payment.event_id <> p_event_id
      or existing_payment.quote_id <> p_quote_id
      or existing_payment.amount <> p_amount
      or existing_payment.payment_method <> p_payment_method then
      raise exception 'This payment request key has already been used for different payment details.';
    end if;
    select coalesce(sum(payment.amount), 0) into amount_received
    from public.restaurant_catering_payments payment
    where payment.org_id = p_org_id and payment.quote_id = p_quote_id;
    return query select existing_payment.id, amount_received, greatest(0, (
      select quote.total - amount_received from public.restaurant_catering_quotes quote
      where quote.org_id = p_org_id and quote.id = p_quote_id
    ));
    return;
  end if;

  select * into target_quote
  from public.restaurant_catering_quotes
  where org_id = p_org_id and event_id = p_event_id and id = p_quote_id
  for update;
  if not found or target_quote.status not in ('issued', 'accepted') then
    raise exception 'An active catering quotation is required before recording payments.';
  end if;
  if exists (
    select 1 from public.restaurant_catering_events event
    where event.org_id = p_org_id and event.id = p_event_id and event.status = 'cancelled'
  ) then
    raise exception 'Payments cannot be added to a cancelled catering event.';
  end if;

  select * into target_invoice
  from public.invoices
  where org_id = p_org_id
    and source_catering_event_id = p_event_id
    and source_catering_quote_id = p_quote_id
  for update;
  if found and target_invoice.status = 'void' then
    raise exception 'Payments cannot be added to a voided final invoice.';
  end if;

  select coalesce(sum(payment.amount), 0) into amount_received
  from public.restaurant_catering_payments payment
  where payment.org_id = p_org_id and payment.quote_id = p_quote_id;
  if amount_received + p_amount > target_quote.total then
    raise exception 'Payment exceeds the remaining catering quote balance.';
  end if;

  insert into public.restaurant_catering_payments (
    org_id, event_id, quote_id, request_key, amount, payment_method, reference,
    paid_at, recorded_by, invoice_id
  ) values (
    p_org_id, p_event_id, p_quote_id, p_request_key, p_amount, p_payment_method,
    nullif(btrim(p_reference), ''), p_paid_at, p_recorded_by, target_invoice.id
  ) returning * into inserted_payment;

  amount_received := amount_received + inserted_payment.amount;
  return query select inserted_payment.id, amount_received, target_quote.total - amount_received;
end;
$$;

revoke all on function public.record_restaurant_catering_payment(uuid, uuid, uuid, uuid, numeric, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.record_restaurant_catering_payment(uuid, uuid, uuid, uuid, numeric, text, text, timestamptz, uuid)
  to service_role;

commit;
