begin;

create or replace function public.education_get_student_outstanding_balances(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_student_ids uuid[]
) returns table (
  student_id uuid,
  outstanding numeric
)
language sql
stable
set search_path = public
as $$
  with authorized_students as (
    select student.id, student.branch_id
    from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and student.id = any(coalesce(p_student_ids, '{}'::uuid[]))
      and public.education_can_access_branch(
        p_org_id, student.branch_id, 'education_students', 'view'
      )
  ),
  open_charges as (
    select charge.id, charge.student_id, charge.amount
    from public.education_fee_charges charge
    join authorized_students student
      on student.id = charge.student_id
    where charge.org_id = p_org_id
      and charge.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and charge.status = 'open'
  ),
  payment_totals as (
    select payment.charge_id, sum(payment.amount)::numeric as amount
    from public.education_fee_payments payment
    join open_charges charge on charge.id = payment.charge_id
    where payment.org_id = p_org_id
    group by payment.charge_id
  )
  select
    student.id,
    coalesce(sum(greatest(0, charge.amount - coalesce(payment.amount, 0))), 0)::numeric
  from authorized_students student
  left join open_charges charge on charge.student_id = student.id
  left join payment_totals payment on payment.charge_id = charge.id
  group by student.id;
$$;

revoke all on function public.education_get_student_outstanding_balances(
  uuid, uuid[], uuid[]
) from public, anon;
grant execute on function public.education_get_student_outstanding_balances(
  uuid, uuid[], uuid[]
) to authenticated;

create or replace function public.education_get_open_fee_charge_balances(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_limit integer
) returns table (
  id uuid,
  branch_id uuid,
  student_id uuid,
  description text,
  amount numeric,
  status text,
  created_at timestamptz,
  paid numeric,
  balance numeric
)
language sql
stable
set search_path = public
as $$
  with open_charges as (
    select charge.id, charge.branch_id, charge.student_id, charge.description,
      charge.amount, charge.status, charge.created_at
    from public.education_fee_charges charge
    where charge.org_id = p_org_id
      and charge.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and charge.status = 'open'
    order by charge.created_at desc, charge.id desc
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  ),
  payment_totals as (
    select payment.charge_id, sum(payment.amount)::numeric as amount
    from public.education_fee_payments payment
    join open_charges charge on charge.id = payment.charge_id
    where payment.org_id = p_org_id
    group by payment.charge_id
  )
  select
    charge.id,
    charge.branch_id,
    charge.student_id,
    charge.description,
    charge.amount,
    charge.status,
    charge.created_at,
    coalesce(payment.amount, 0)::numeric as paid,
    greatest(0, charge.amount - coalesce(payment.amount, 0))::numeric as balance
  from open_charges charge
  left join payment_totals payment on payment.charge_id = charge.id
  order by charge.created_at desc, charge.id desc;
$$;

revoke all on function public.education_get_open_fee_charge_balances(
  uuid, uuid[], integer
) from public, anon;
grant execute on function public.education_get_open_fee_charge_balances(
  uuid, uuid[], integer
) to authenticated;

commit;
