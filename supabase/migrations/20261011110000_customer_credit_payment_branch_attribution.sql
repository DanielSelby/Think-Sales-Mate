begin;

alter table public.customer_credit_payments
  add column if not exists invoice_location_id uuid
  references public.business_locations(id) on delete set null;

update public.customer_credit_payments as payment
set invoice_location_id = sale.location_id
from public.sales as sale
where payment.org_id = sale.org_id
  and payment.invoice_id = 'SALE-' || sale.sale_number::text
  and payment.invoice_location_id is null;

create index if not exists customer_credit_payments_invoice_location_idx
  on public.customer_credit_payments(org_id, invoice_location_id, payment_date desc);

drop policy if exists "customer credit payments branch access" on public.customer_credit_payments;
create policy "customer credit payments branch access"
  on public.customer_credit_payments as restrictive for select
  using (
    public.can_access_org_location(org_id, invoice_location_id)
    or public.can_access_org_location(org_id, location_id)
  );

drop policy if exists "customer credit payments branch create" on public.customer_credit_payments;
create policy "customer credit payments branch create"
  on public.customer_credit_payments as restrictive for insert
  with check (
    public.can_access_org_location(org_id, invoice_location_id)
    and public.can_access_org_location(org_id, location_id)
  );

create or replace function public.validate_customer_credit_payment_branches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_location_id uuid;
begin
  if new.invoice_id ~* '^SALE-[0-9]+$' then
    select location_id into source_location_id
    from public.sales
    where org_id = new.org_id
      and sale_number::text = substring(new.invoice_id from 6);
    if not found then
      raise exception 'The source sale for this customer payment could not be found.';
    end if;
    if new.invoice_location_id is not null
       and new.invoice_location_id is distinct from source_location_id then
      raise exception 'Invoice branch does not match the source sale.';
    end if;
    new.invoice_location_id := source_location_id;
  elsif new.invoice_location_id is not null then
    raise exception 'Invoice branch may only be set for a verified sales invoice.';
  end if;

  if new.location_id is not null and not exists (
    select 1 from public.business_locations
    where id = new.location_id
      and org_id = new.org_id
      and (auth.uid() is null or public.can_access_org_location(new.org_id, new.location_id))
  ) then
    raise exception 'The receiving branch is not available to this user.';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_credit_payment_branch_guard on public.customer_credit_payments;
create trigger customer_credit_payment_branch_guard
  before insert or update of org_id, invoice_id, location_id, invoice_location_id
  on public.customer_credit_payments
  for each row execute function public.validate_customer_credit_payment_branches();

drop function if exists public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid
);

create or replace function public.record_customer_credit_payment_with_bank_transaction(
  p_org_id uuid,
  p_customer_id uuid,
  p_invoice_id text,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_location_id uuid,
  p_recorded_by uuid,
  p_notes text,
  p_bank_account_id uuid,
  p_invoice_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
  sale_customer_id uuid;
  sale_location_id uuid;
begin
  if auth.uid() is distinct from p_recorded_by
     or not public.is_org_member(p_org_id) then
    raise exception 'You are not authorized to record this customer payment.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid payment amount.';
  end if;

  if p_invoice_id ~* '^SALE-[0-9]+$' then
    select location_id, customer_id
    into sale_location_id, sale_customer_id
    from public.sales
    where org_id = p_org_id
      and sale_number::text = substring(p_invoice_id from 6);

    if not found then
      raise exception 'The invoice could not be found.';
    end if;
    if sale_location_id is distinct from p_invoice_location_id then
      raise exception 'Invoice branch does not match the source sale.';
    end if;
    if sale_customer_id is not null and p_customer_id is distinct from sale_customer_id then
      raise exception 'The invoice does not belong to the selected customer.';
    end if;
    if sale_location_id is not null
       and not public.can_access_org_location(p_org_id, sale_location_id) then
      raise exception 'You cannot record payments for this invoice branch.';
    end if;
  elsif p_invoice_location_id is not null then
    raise exception 'Invoice branch may only be set for a verified sales invoice.';
  end if;

  if not public.can_access_org_location(p_org_id, p_location_id)
     or (p_location_id is not null and not exists (
      select 1 from public.business_locations
      where id = p_location_id and org_id = p_org_id
    )) then
    raise exception 'You cannot record this payment at the selected branch.';
  end if;

  if p_bank_account_id is not null
     and not public.has_org_role(p_org_id, 'manager') then
    raise exception 'Bank-account payments require banking manager access.';
  end if;

  if p_bank_account_id is not null and not exists (
    select 1
    from public.bank_accounts
    where id = p_bank_account_id
      and org_id = p_org_id
  ) then
    raise exception 'The selected deposit account is not available in this organization.';
  end if;

  if p_customer_id is not null then
    select name into customer_name
    from public.customers
    where id = p_customer_id
      and org_id = p_org_id;
    if customer_name is null then
      raise exception 'The selected customer is not available in this organization.';
    end if;
  end if;

  insert into public.customer_credit_payments (
    org_id, customer_id, invoice_id, amount, payment_method, payment_date,
    location_id, invoice_location_id, recorded_by, notes
  ) values (
    p_org_id, p_customer_id, p_invoice_id, p_amount, p_payment_method, p_payment_date,
    p_location_id, p_invoice_location_id, p_recorded_by, p_notes
  );

  if p_bank_account_id is not null then
    insert into public.bank_transactions (
      org_id, account_id, type, amount, description, counterparty_name,
      transaction_category, transaction_date, recorded_by
    ) values (
      p_org_id, p_bank_account_id, 'deposit', p_amount,
      'Debt payment for invoice ' || p_invoice_id, customer_name,
      'debt_payment', p_payment_date, p_recorded_by
    );
  end if;
end;
$$;

revoke all on function public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid, uuid
) from public;
grant execute on function public.record_customer_credit_payment_with_bank_transaction(
  uuid, uuid, text, numeric, text, date, uuid, uuid, text, uuid, uuid
) to authenticated;

commit;
