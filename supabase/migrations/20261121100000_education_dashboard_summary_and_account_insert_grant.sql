begin;

grant insert (id) on public.education_accounting_accounts to authenticated;

create index if not exists education_fee_charges_dashboard_summary_idx
  on public.education_fee_charges (org_id, branch_id, status, created_at)
  include (amount);

create or replace function public.education_get_dashboard_finance_summary(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_from timestamptz,
  p_to_exclusive timestamptz,
  p_include_fees boolean,
  p_include_expenses boolean
) returns table (
  branch_id uuid,
  paid_in_range numeric,
  billed_in_range numeric,
  paid_against_range_charges numeric,
  outstanding numeric,
  expenses numeric
)
language sql
stable
set search_path = public
as $$
  with requested_branches as (
    select distinct requested.branch_id
    from unnest(coalesce(p_branch_ids, '{}'::uuid[])) as requested(branch_id)
  ),
  fee_charges as (
    select charge.id, charge.branch_id, charge.amount, charge.status, charge.created_at
    from public.education_fee_charges charge
    join requested_branches requested on requested.branch_id = charge.branch_id
    where p_include_fees
      and charge.org_id = p_org_id
  ),
  payment_totals as (
    select
      payment.charge_id,
      sum(payment.amount)::numeric as amount,
      sum(payment.amount) filter (
        where payment.created_at >= p_from and payment.created_at < p_to_exclusive
      )::numeric as paid_in_range
    from public.education_fee_payments payment
    join fee_charges charge on charge.id = payment.charge_id
    where payment.org_id = p_org_id
    group by payment.charge_id
  ),
  fee_totals as (
    select
      charge.branch_id,
      coalesce(sum(payment.paid_in_range), 0)::numeric as paid_in_range,
      coalesce(sum(charge.amount) filter (
        where charge.status = 'open'
          and charge.created_at >= p_from and charge.created_at < p_to_exclusive
      ), 0)::numeric as billed_in_range,
      coalesce(sum(payment.amount) filter (
        where charge.status = 'open'
          and charge.created_at >= p_from and charge.created_at < p_to_exclusive
      ), 0)::numeric as paid_against_range_charges,
      coalesce(sum(greatest(0, charge.amount - coalesce(payment.amount, 0))) filter (
        where charge.status = 'open'
      ), 0)::numeric as outstanding
    from fee_charges charge
    left join payment_totals payment on payment.charge_id = charge.id
    group by charge.branch_id
  ),
  expense_totals as (
    select expense.branch_id, sum(expense.amount)::numeric as amount
    from public.education_expenses expense
    join requested_branches requested on requested.branch_id = expense.branch_id
    where p_include_expenses
      and expense.org_id = p_org_id
      and expense.status = 'approved'
      and expense.expense_date >= (p_from at time zone 'UTC')::date
      and expense.expense_date < (p_to_exclusive at time zone 'UTC')::date
    group by expense.branch_id
  )
  select
    requested.branch_id,
    coalesce(fees.paid_in_range, 0)::numeric,
    coalesce(fees.billed_in_range, 0)::numeric,
    coalesce(fees.paid_against_range_charges, 0)::numeric,
    coalesce(fees.outstanding, 0)::numeric,
    coalesce(expenses.amount, 0)::numeric
  from requested_branches requested
  left join fee_totals fees on fees.branch_id = requested.branch_id
  left join expense_totals expenses on expenses.branch_id = requested.branch_id;
$$;

revoke all on function public.education_get_dashboard_finance_summary(
  uuid, uuid[], timestamptz, timestamptz, boolean, boolean
) from public, anon;
grant execute on function public.education_get_dashboard_finance_summary(
  uuid, uuid[], timestamptz, timestamptz, boolean, boolean
) to authenticated;

commit;
