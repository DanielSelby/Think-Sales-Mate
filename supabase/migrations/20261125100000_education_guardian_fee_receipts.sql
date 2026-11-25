begin;

create or replace function public.education_get_guardian_fee_payment_receipts(
  p_student_ids uuid[] default null,
  p_payment_id uuid default null,
  p_limit_per_student integer default 20
)
returns table (
  payment_id uuid,
  org_id uuid,
  student_id uuid,
  student_name text,
  school_name text,
  currency_code text,
  fee_description text,
  amount numeric,
  payment_method text,
  reference text,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  returned_rows bigint;
begin
  if auth.uid() is null
    or p_limit_per_student is null
    or p_limit_per_student not between 1 and 30 then
    raise exception 'Payment history request is invalid.' using errcode = '22023';
  end if;

  if p_payment_id is not null then
    return query
    select
      payment.id,
      charge.org_id,
      student.id,
      concat_ws(' ', student.first_name, student.other_names, student.last_name),
      organization.name,
      upper(organization.currency),
      charge.description,
      payment.amount,
      payment.payment_method,
      payment.reference,
      payment.created_at
    from public.education_fee_payments payment
    join public.education_fee_charges charge
      on charge.org_id = payment.org_id
      and charge.id = payment.charge_id
    join public.education_students student
      on student.org_id = charge.org_id
      and student.id = charge.student_id
    join public.organizations organization
      on organization.id = charge.org_id
      and organization.registration_status = 'approved'
    where payment.id = p_payment_id
      and public.education_current_guardian_can_access_student(student.org_id, student.id);

    get diagnostics returned_rows = row_count;
    if returned_rows = 0 then
      raise exception 'Payment receipt is unavailable.' using errcode = '42501';
    end if;
    return;
  end if;

  if p_student_ids is null
    or cardinality(p_student_ids) not between 1 and 100
    or array_position(p_student_ids, null) is not null
    or cardinality(p_student_ids) <> (
      select count(distinct requested.id)
      from unnest(p_student_ids) as requested(id)
    ) then
    raise exception 'Payment history request is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_student_ids) as requested(id)
    left join public.education_students student on student.id = requested.id
    where student.id is null
      or not public.education_current_guardian_can_access_student(student.org_id, student.id)
  ) then
    raise exception 'One or more students are not linked to your verified guardian profile.' using errcode = '42501';
  end if;

  return query
  with requested_students as (
    select student.org_id, student.id
    from public.education_students student
    where student.id = any(p_student_ids)
  ),
  ranked_payments as (
    select
      payment.id as payment_id,
      charge.org_id,
      student.id as student_id,
      concat_ws(' ', student.first_name, student.other_names, student.last_name) as student_name,
      organization.name as school_name,
      upper(organization.currency) as currency_code,
      charge.description as fee_description,
      payment.amount,
      payment.payment_method,
      payment.reference,
      payment.created_at as paid_at,
      row_number() over (
        partition by student.id
        order by payment.created_at desc, payment.id desc
      ) as row_number
    from requested_students requested
    join public.education_fee_payments payment
      on payment.org_id = requested.org_id
    join public.education_fee_charges charge
      on charge.org_id = payment.org_id
      and charge.id = payment.charge_id
      and charge.student_id = requested.id
    join public.education_students student
      on student.org_id = charge.org_id
      and student.id = charge.student_id
    join public.organizations organization
      on organization.id = charge.org_id
      and organization.registration_status = 'approved'
    where payment.created_at >= now() - interval '365 days'
  )
  select
    ranked_payments.payment_id,
    ranked_payments.org_id,
    ranked_payments.student_id,
    ranked_payments.student_name,
    ranked_payments.school_name,
    ranked_payments.currency_code,
    ranked_payments.fee_description,
    ranked_payments.amount,
    ranked_payments.payment_method,
    ranked_payments.reference,
    ranked_payments.paid_at
  from ranked_payments
  where ranked_payments.row_number <= p_limit_per_student
  order by ranked_payments.student_id, ranked_payments.paid_at desc;
end;
$$;

revoke all on function public.education_get_guardian_fee_payment_receipts(uuid[], uuid, integer)
  from public, anon, authenticated;
grant execute on function public.education_get_guardian_fee_payment_receipts(uuid[], uuid, integer)
  to authenticated;

commit;
