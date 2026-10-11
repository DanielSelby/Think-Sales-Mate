begin;

with allocation_totals as (
  select
    allocation.org_id,
    allocation.sale_id,
    allocation.account_id,
    case
      when lower(trim(allocation.payment_method)) in ('momo', 'mo mo') then 'MoMo'
      when lower(trim(allocation.payment_method)) in ('mobile money', 'mobile_money') then 'Mobile Money'
      when lower(trim(allocation.payment_method)) = 'bank transfer' then 'Bank Transfer'
      when lower(trim(allocation.payment_method)) = 'card' then 'Card'
    end as payment_method,
    sum(allocation.amount)::numeric(12, 2) as allocated_amount,
    sale.sale_number,
    coalesce(nullif(trim(sale.customer_name), ''), 'Walk-in Customer') as counterparty_name,
    sale.sale_date,
    sale.sold_by
  from public.sale_payment_allocations as allocation
  join public.sales as sale
    on sale.id = allocation.sale_id
   and sale.org_id = allocation.org_id
  join public.bank_accounts as account
    on account.id = allocation.account_id
   and account.org_id = allocation.org_id
  where allocation.account_id is not null
    and allocation.amount > 0
    and lower(trim(allocation.payment_method)) in (
      'momo', 'mo mo', 'mobile money', 'mobile_money',
      'bank transfer', 'card'
    )
    and (
      lower(trim(allocation.payment_method)) not in ('momo', 'mo mo', 'mobile money', 'mobile_money')
      or account.account_type = 'mobile_money'
    )
  group by
    allocation.org_id,
    allocation.sale_id,
    allocation.account_id,
    case
      when lower(trim(allocation.payment_method)) in ('momo', 'mo mo') then 'MoMo'
      when lower(trim(allocation.payment_method)) in ('mobile money', 'mobile_money') then 'Mobile Money'
      when lower(trim(allocation.payment_method)) = 'bank transfer' then 'Bank Transfer'
      when lower(trim(allocation.payment_method)) = 'card' then 'Card'
    end,
    sale.sale_number,
    sale.customer_name,
    sale.sale_date,
    sale.sold_by
), missing_deposits as (
  select
    allocation_totals.*,
    greatest(
      allocation_totals.allocated_amount - coalesce(sum(existing.amount), 0),
      0
    )::numeric(12, 2) as missing_amount
  from allocation_totals
  left join public.bank_transactions as existing
    on existing.org_id = allocation_totals.org_id
   and existing.account_id = allocation_totals.account_id
   and existing.type = 'deposit'
   and lower(coalesce(existing.description, '')) =
     lower(allocation_totals.payment_method || ' payment for sale #' || allocation_totals.sale_number::text)
  group by
    allocation_totals.org_id,
    allocation_totals.sale_id,
    allocation_totals.account_id,
    allocation_totals.payment_method,
    allocation_totals.allocated_amount,
    allocation_totals.sale_number,
    allocation_totals.counterparty_name,
    allocation_totals.sale_date,
    allocation_totals.sold_by
)
insert into public.bank_transactions (
  org_id,
  account_id,
  type,
  amount,
  description,
  counterparty_name,
  transaction_category,
  transaction_date,
  recorded_by
)
select
  org_id,
  account_id,
  'deposit',
  missing_amount,
  payment_method || ' payment for sale #' || sale_number::text,
  counterparty_name,
  'income',
  sale_date,
  sold_by
from missing_deposits
where missing_amount > 0;

commit;
