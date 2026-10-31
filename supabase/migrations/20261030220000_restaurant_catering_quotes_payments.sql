begin;

create table if not exists public.restaurant_catering_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  version integer not null check (version > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text not null check (length(btrim(description)) between 1 and 5000),
  total numeric(12,2) not null check (total > 0),
  deposit_due numeric(12,2) not null default 0 check (deposit_due >= 0),
  expires_on date,
  status text not null default 'issued'
    check (status in ('issued', 'accepted', 'rejected', 'superseded')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, event_id, id),
  unique (org_id, event_id, version),
  foreign key (org_id, event_id)
    references public.restaurant_catering_events(org_id, id) on delete cascade,
  check (deposit_due <= total)
);

create unique index if not exists restaurant_catering_quotes_one_issued_idx
  on public.restaurant_catering_quotes(org_id, event_id)
  where status = 'issued';

create index if not exists restaurant_catering_quotes_event_created_idx
  on public.restaurant_catering_quotes(org_id, event_id, created_at desc);

create table if not exists public.restaurant_catering_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  quote_id uuid not null,
  request_key uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null
    check (payment_method in ('cash', 'card', 'bank_transfer', 'mobile_money', 'other')),
  reference text check (reference is null or length(reference) <= 120),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, request_key),
  foreign key (org_id, event_id, quote_id)
    references public.restaurant_catering_quotes(org_id, event_id, id) on delete restrict
);

create index if not exists restaurant_catering_payments_quote_paid_idx
  on public.restaurant_catering_payments(org_id, quote_id, paid_at desc);

alter table public.restaurant_catering_quotes enable row level security;
alter table public.restaurant_catering_payments enable row level security;

drop policy if exists "Restaurant catering quotes: members read assigned events"
  on public.restaurant_catering_quotes;
create policy "Restaurant catering quotes: members read assigned events"
  on public.restaurant_catering_quotes for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.restaurant_catering_events event
      where event.org_id = restaurant_catering_quotes.org_id
        and event.id = restaurant_catering_quotes.event_id
        and public.can_access_org_location(restaurant_catering_quotes.org_id, event.location_id)
    )
  );

drop policy if exists "Restaurant catering payments: members read assigned events"
  on public.restaurant_catering_payments;
create policy "Restaurant catering payments: members read assigned events"
  on public.restaurant_catering_payments for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.restaurant_catering_events event
      where event.org_id = restaurant_catering_payments.org_id
        and event.id = restaurant_catering_payments.event_id
        and public.can_access_org_location(restaurant_catering_payments.org_id, event.location_id)
    )
  );

revoke all on public.restaurant_catering_quotes from public, anon, authenticated;
revoke all on public.restaurant_catering_payments from public, anon, authenticated;
grant select on public.restaurant_catering_quotes, public.restaurant_catering_payments to authenticated;
grant all on public.restaurant_catering_quotes, public.restaurant_catering_payments to service_role;

create or replace function public.create_restaurant_catering_quote(
  p_org_id uuid,
  p_event_id uuid,
  p_currency text,
  p_description text,
  p_total numeric,
  p_deposit_due numeric,
  p_expires_on date,
  p_created_by uuid
)
returns table (quote_id uuid, quote_version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.restaurant_catering_events%rowtype;
  active_quote public.restaurant_catering_quotes%rowtype;
  next_version integer;
  created_quote public.restaurant_catering_quotes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create catering quotations.';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_total is null or p_total <= 0 or p_total * 100 <> trunc(p_total * 100)
    or p_deposit_due is null or p_deposit_due < 0
    or p_deposit_due * 100 <> trunc(p_deposit_due * 100)
    or p_deposit_due > p_total then
    raise exception 'Enter a valid quote total and deposit in the selected currency.';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 5000 then
    raise exception 'Quotation details are required and cannot exceed 5,000 characters.';
  end if;
  if p_expires_on is not null and p_expires_on < current_date then
    raise exception 'The quotation expiry date must be today or later.';
  end if;

  select * into target_event
  from public.restaurant_catering_events
  where org_id = p_org_id and id = p_event_id
  for update;
  if not found or target_event.status not in ('inquiry', 'quoted') then
    raise exception 'Only an open catering inquiry can be quoted.';
  end if;

  select * into active_quote
  from public.restaurant_catering_quotes
  where org_id = p_org_id and event_id = p_event_id and status = 'issued'
  for update;
  if found then
    if exists (
      select 1 from public.restaurant_catering_payments payment
      where payment.org_id = p_org_id and payment.quote_id = active_quote.id
    ) then
      raise exception 'A quotation with recorded payments cannot be revised.';
    end if;
    update public.restaurant_catering_quotes
    set status = 'superseded'
    where org_id = p_org_id and id = active_quote.id;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.restaurant_catering_quotes
  where org_id = p_org_id and event_id = p_event_id;

  insert into public.restaurant_catering_quotes (
    org_id, event_id, version, currency, description, total, deposit_due, expires_on, created_by
  ) values (
    p_org_id, p_event_id, next_version, p_currency, btrim(p_description), p_total, p_deposit_due, p_expires_on, p_created_by
  ) returning * into created_quote;

  update public.restaurant_catering_events
  set status = 'quoted', updated_by = p_created_by, updated_at = now()
  where org_id = p_org_id and id = p_event_id and status = 'inquiry';

  return query select created_quote.id, created_quote.version;
end;
$$;

revoke all on function public.create_restaurant_catering_quote(uuid, uuid, text, text, numeric, numeric, date, uuid)
  from public, anon, authenticated;
grant execute on function public.create_restaurant_catering_quote(uuid, uuid, text, text, numeric, numeric, date, uuid)
  to service_role;

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
    where event.org_id = p_org_id and event.id = p_event_id
      and event.status in ('completed', 'cancelled')
  ) then
    raise exception 'Payments cannot be added to a completed or cancelled catering event.';
  end if;

  select coalesce(sum(payment.amount), 0) into amount_received
  from public.restaurant_catering_payments payment
  where payment.org_id = p_org_id and payment.quote_id = p_quote_id;
  if amount_received + p_amount > target_quote.total then
    raise exception 'Payment exceeds the remaining catering quote balance.';
  end if;

  insert into public.restaurant_catering_payments (
    org_id, event_id, quote_id, request_key, amount, payment_method, reference, paid_at, recorded_by
  ) values (
    p_org_id, p_event_id, p_quote_id, p_request_key, p_amount, p_payment_method,
    nullif(btrim(p_reference), ''), p_paid_at, p_recorded_by
  ) returning * into inserted_payment;

  amount_received := amount_received + inserted_payment.amount;
  return query select inserted_payment.id, amount_received, target_quote.total - amount_received;
end;
$$;

revoke all on function public.record_restaurant_catering_payment(uuid, uuid, uuid, uuid, numeric, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.record_restaurant_catering_payment(uuid, uuid, uuid, uuid, numeric, text, text, timestamptz, uuid)
  to service_role;

create or replace function public.validate_restaurant_catering_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_quote public.restaurant_catering_quotes%rowtype;
  amount_received numeric(12,2);
begin
  if new.status = 'confirmed' and old.status = 'quoted' then
    select * into target_quote
    from public.restaurant_catering_quotes quote
    where quote.org_id = new.org_id and quote.event_id = new.id and quote.status = 'issued'
    order by quote.version desc
    limit 1
    for update;
    if not found then
      raise exception 'An issued catering quotation is required before confirming this event.';
    end if;
    select coalesce(sum(payment.amount), 0) into amount_received
    from public.restaurant_catering_payments payment
    where payment.org_id = new.org_id and payment.quote_id = target_quote.id;
    if amount_received < target_quote.deposit_due then
      raise exception 'Record the required deposit of % before confirming this catering event.',
        target_quote.deposit_due;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_catering_event_confirmation_check
  on public.restaurant_catering_events;
create trigger restaurant_catering_event_confirmation_check
  before update of status on public.restaurant_catering_events
  for each row execute function public.validate_restaurant_catering_confirmation();

revoke all on function public.validate_restaurant_catering_confirmation() from public, anon, authenticated;
grant execute on function public.validate_restaurant_catering_confirmation() to service_role;

commit;
