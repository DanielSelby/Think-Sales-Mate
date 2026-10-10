begin;

create or replace function public.get_bank_account_trend_changes(
  p_org_id uuid,
  p_month_start date,
  p_year_start date,
  p_as_of date
)
returns table (
  account_id uuid,
  month_change numeric,
  year_change numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.has_org_role(p_org_id, 'manager') then
    raise exception 'You do not have permission to view bank account trends.';
  end if;

  return query
  select
    bt.account_id,
    coalesce(sum(case
      when bt.transaction_date >= p_month_start
      then case when bt.type = 'deposit' then bt.amount else -bt.amount end
      else 0
    end), 0)::numeric as month_change,
    coalesce(sum(case
      when bt.transaction_date >= p_year_start
      then case when bt.type = 'deposit' then bt.amount else -bt.amount end
      else 0
    end), 0)::numeric as year_change
  from public.bank_transactions as bt
  where bt.org_id = p_org_id
    and bt.transaction_date >= p_year_start
    and bt.transaction_date <= p_as_of
  group by bt.account_id;
end;
$$;

revoke all on function public.get_bank_account_trend_changes(uuid, date, date, date) from public;
grant execute on function public.get_bank_account_trend_changes(uuid, date, date, date) to authenticated;

commit;
