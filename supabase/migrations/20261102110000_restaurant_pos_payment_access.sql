begin;

create unique index if not exists bank_accounts_org_id_id_uidx
  on public.bank_accounts (org_id, id);

do $$
begin
  if exists (
    select 1
    from public.restaurant_order_payments payment
    join public.bank_accounts account on account.id = payment.bank_account_id
    where payment.bank_account_id is not null
      and payment.org_id <> account.org_id
  ) then
    raise exception 'Restaurant payments contain bank accounts owned by a different organization.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurant_order_payments_org_bank_account_fk'
      and conrelid = 'public.restaurant_order_payments'::regclass
  ) then
    alter table public.restaurant_order_payments
      add constraint restaurant_order_payments_org_bank_account_fk
      foreign key (org_id, bank_account_id)
      references public.bank_accounts (org_id, id)
      on delete restrict;
  end if;
end
$$;

create or replace function public.get_restaurant_pos_payment_accounts(p_org_id uuid)
returns table (
  id uuid,
  name text,
  account_type public.bank_account_type
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.has_org_permission(p_org_id, 'restaurant.operations.orders', 'create') then
    raise exception 'You do not have permission to view Restaurant POS payment accounts.';
  end if;

  return query
  select account.id, account.name, account.account_type
  from public.bank_accounts account
  where account.org_id = p_org_id
    and account.account_type in ('card', 'checking', 'savings', 'mobile_money', 'other')
  order by account.name;
end;
$$;

revoke all on function public.get_restaurant_pos_payment_accounts(uuid) from public, anon;
grant execute on function public.get_restaurant_pos_payment_accounts(uuid) to authenticated;

create or replace function public.refund_restaurant_payment(
  p_org_id uuid,
  p_order_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_tip_amount numeric,
  p_payment_method text,
  p_received_by uuid
)
returns public.restaurant_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.restaurant_orders;
  target_payment public.restaurant_order_payments;
  refunded_amount numeric(12,2);
  refunded_tip numeric(12,2);
  paid_total numeric(12,2);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can refund restaurant payments.';
  end if;
  if p_amount < 0 or p_tip_amount < 0 or p_amount <> round(p_amount, 2)
    or p_tip_amount <> round(p_tip_amount, 2) or p_amount + p_tip_amount <= 0
    or p_payment_method not in ('cash', 'card', 'mobile_money', 'other') then
    raise exception 'Enter a valid refund amount, tip refund, and method.';
  end if;

  select * into target_order
  from public.restaurant_orders
  where org_id = p_org_id and id = p_order_id
  for update;
  if not found then
    raise exception 'Restaurant order not found.';
  end if;

  select * into target_payment
  from public.restaurant_order_payments
  where org_id = p_org_id and order_id = p_order_id
    and id = p_payment_id and payment_type = 'payment'
  for update;
  if not found then
    raise exception 'Original restaurant payment not found.';
  end if;
  if target_payment.payment_provider = 'paystack' then
    raise exception 'Paystack payments must be refunded through the provider.';
  end if;
  if p_payment_method <> target_payment.payment_method then
    raise exception 'A refund must use the original payment method.';
  end if;

  select coalesce(sum(amount), 0), coalesce(sum(tip_amount), 0)
  into refunded_amount, refunded_tip
  from public.restaurant_order_payments
  where org_id = p_org_id and refund_of_payment_id = p_payment_id;
  if p_amount > target_payment.amount - refunded_amount
    or p_tip_amount > target_payment.tip_amount - refunded_tip then
    raise exception 'Refund exceeds the unrefunded amount of this payment.';
  end if;

  insert into public.restaurant_order_payments (
    org_id, order_id, bill_id, amount, tip_amount, payment_type,
    refund_of_payment_id, bank_account_id, payment_method, received_by
  ) values (
    p_org_id, p_order_id, target_payment.bill_id, p_amount, p_tip_amount,
    'refund', p_payment_id, target_payment.bank_account_id,
    target_payment.payment_method, p_received_by
  );

  select coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0)
  into paid_total
  from public.restaurant_order_payments
  where org_id = p_org_id and order_id = p_order_id;
  update public.restaurant_orders
  set payment_status = case
        when paid_total >= total then 'paid'
        when paid_total > 0 then 'partial'
        else 'unpaid'
      end,
      updated_at = now()
  where org_id = p_org_id and id = p_order_id
  returning * into target_order;
  return target_order;
end;
$$;

revoke all on function public.refund_restaurant_payment(
  uuid, uuid, uuid, numeric, numeric, text, uuid
) from public, anon, authenticated;
grant execute on function public.refund_restaurant_payment(
  uuid, uuid, uuid, numeric, numeric, text, uuid
) to service_role;

commit;
