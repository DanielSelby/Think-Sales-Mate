begin;

create or replace function public.education_get_fee_charges_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_academic_year_id uuid,
  p_limit integer,
  p_offset integer
) returns table (
  id uuid,
  branch_id uuid,
  student_id uuid,
  academic_year_id uuid,
  description text,
  amount numeric,
  due_on date,
  status text,
  created_at timestamptz,
  student_number text,
  first_name text,
  last_name text,
  paid numeric,
  payment_count integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered_charges as (
    select
      charge.id,
      charge.branch_id,
      charge.student_id,
      charge.academic_year_id,
      charge.description,
      charge.amount,
      charge.due_on,
      charge.status,
      charge.created_at,
      student.student_number,
      student.first_name,
      student.last_name
    from public.education_fee_charges charge
    left join public.education_students student
      on student.org_id = charge.org_id
      and student.id = charge.student_id
      and student.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and student.status = 'active'
    where charge.org_id = p_org_id
      and charge.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and (p_academic_year_id is null or charge.academic_year_id = p_academic_year_id)
  ),
  page_charges as (
    select
      filtered_charges.*,
      count(*) over ()::bigint as total_count
    from filtered_charges
    order by filtered_charges.created_at desc, filtered_charges.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  ),
  payment_totals as (
    select payment.charge_id,
      coalesce(sum(payment.amount), 0)::numeric as paid,
      count(payment.id)::integer as payment_count
    from public.education_fee_payments payment
    join page_charges charge on charge.id = payment.charge_id
    where payment.org_id = p_org_id
    group by payment.charge_id
  )
  select
    charge.id,
    charge.branch_id,
    charge.student_id,
    charge.academic_year_id,
    charge.description,
    charge.amount,
    charge.due_on,
    charge.status,
    charge.created_at,
    charge.student_number,
    charge.first_name,
    charge.last_name,
    coalesce(payment_totals.paid, 0)::numeric,
    coalesce(payment_totals.payment_count, 0)::integer,
    charge.total_count
  from page_charges charge
  left join payment_totals on payment_totals.charge_id = charge.id
  order by charge.created_at desc, charge.id desc;
$$;

revoke all on function public.education_get_fee_charges_page(
  uuid, uuid[], uuid, integer, integer
) from public, anon;
grant execute on function public.education_get_fee_charges_page(
  uuid, uuid[], uuid, integer, integer
) to authenticated;

commit;
