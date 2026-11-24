begin;

create or replace function public.education_can_access_fee_report_branch(
  target_org_id uuid,
  target_branch_id uuid,
  target_module text,
  target_page text,
  target_tab text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with effective_permissions as (
    select
      member.role,
      case
        when product_permission.permissions_mode = 'custom'
          then product_permission.permissions
        when product_template.org_id is not null
          then product_template.permissions
        when organization_template.org_id is not null
          then organization_template.permissions
        else coalesce(member.access_permissions -> 'role_defaults_fallback', '{}'::jsonb)
      end as permissions
    from public.organization_members member
    left join public.organization_member_product_permissions product_permission
      on product_permission.org_id = member.org_id
      and product_permission.user_id = member.user_id
      and product_permission.product_slug = 'think-education'
    left join public.organization_product_role_templates product_template
      on product_template.org_id = member.org_id
      and product_template.product_slug = 'think-education'
      and product_template.role_key = coalesce(
        product_permission.role_key,
        member.access_permissions ->> 'role_key',
        member.role::text
      )
    left join public.organization_role_templates organization_template
      on organization_template.org_id = member.org_id
      and organization_template.role_key = coalesce(
        product_permission.role_key,
        member.access_permissions ->> 'role_key',
        member.role::text
      )
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and target_module in ('education_finance', 'education_students', 'education_academics')
  )
  select public.education_user_has_branch_scope(target_org_id, target_branch_id)
    and public.has_product_access(target_org_id, 'think-education', target_action <> 'view')
    and exists (
      select 1
      from effective_permissions permission
      where (
        permission.role = 'owner'
        or public.is_org_product_admin(target_org_id)
        or exists (
          select 1
          from public.organization_product_access_assignments assignment
          where assignment.org_id = target_org_id
            and assignment.user_id = auth.uid()
            and assignment.product_slug = 'think-education'
            and assignment.is_active
        )
      )
      and (
        permission.role = 'owner'
        or public.is_org_product_admin(target_org_id)
        or case
          when permission.permissions ? (target_module || '.' || target_page || '.' || target_tab)
            then coalesce(
              permission.permissions -> (target_module || '.' || target_page || '.' || target_tab),
              '[]'::jsonb
            ) ? target_action
          else coalesce(permission.permissions -> target_module, '[]'::jsonb) ? target_action
        end
      )
    );
$$;

revoke all on function public.education_can_access_fee_report_branch(
  uuid, uuid, text, text, text, text
) from public, anon;
grant execute on function public.education_can_access_fee_report_branch(
  uuid, uuid, text, text, text, text
) to authenticated;

create or replace function public.education_get_fee_aging_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_academic_year_id uuid,
  p_as_of_date date,
  p_limit integer,
  p_offset integer
) returns table (
  student_id uuid,
  branch_id uuid,
  outstanding_charges bigint,
  balance numeric,
  not_due numeric,
  days_1_to_30 numeric,
  days_31_to_60 numeric,
  days_61_to_90 numeric,
  over_90 numeric,
  total_count bigint,
  total_balance numeric,
  total_not_due numeric,
  total_days_1_to_30 numeric,
  total_days_31_to_60 numeric,
  total_days_61_to_90 numeric,
  total_over_90 numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with authorized_charges as (
    select charge.id, charge.branch_id, charge.student_id, charge.amount, charge.due_on
    from public.education_fee_charges charge
    where charge.org_id = p_org_id
      and charge.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and charge.status = 'open'
      and (p_academic_year_id is null or charge.academic_year_id = p_academic_year_id)
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_finance', 'finance', 'charges', 'view'
      )
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_finance', 'finance', 'payments', 'view'
      )
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_students', 'students', 'list', 'view'
      )
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_academics', 'academics', 'calendar', 'view'
      )
  ),
  paid_by_charge as (
    select payment.charge_id, sum(payment.amount)::numeric as amount
    from public.education_fee_payments payment
    join authorized_charges charge on charge.id = payment.charge_id
    where payment.org_id = p_org_id
    group by payment.charge_id
  ),
  charge_balances as (
    select
      charge.branch_id,
      charge.student_id,
      greatest(0, charge.amount - coalesce(paid.amount, 0))::numeric as balance,
      case
        when charge.due_on is null or p_as_of_date <= charge.due_on then 'not_due'
        when p_as_of_date - charge.due_on > 90 then 'over_90'
        when p_as_of_date - charge.due_on > 60 then 'days_61_90'
        when p_as_of_date - charge.due_on > 30 then 'days_31_60'
        else 'days_1_30'
      end as age_bucket
    from authorized_charges charge
    left join paid_by_charge paid on paid.charge_id = charge.id
  ),
  accounts as (
    select
      charge.student_id,
      charge.branch_id,
      count(*) filter (where charge.balance > 0)::bigint as outstanding_charges,
      coalesce(sum(charge.balance) filter (where charge.balance > 0), 0)::numeric as balance,
      coalesce(sum(charge.balance) filter (where charge.balance > 0 and charge.age_bucket = 'not_due'), 0)::numeric as not_due,
      coalesce(sum(charge.balance) filter (where charge.balance > 0 and charge.age_bucket = 'days_1_30'), 0)::numeric as days_1_to_30,
      coalesce(sum(charge.balance) filter (where charge.balance > 0 and charge.age_bucket = 'days_31_60'), 0)::numeric as days_31_to_60,
      coalesce(sum(charge.balance) filter (where charge.balance > 0 and charge.age_bucket = 'days_61_90'), 0)::numeric as days_61_to_90,
      coalesce(sum(charge.balance) filter (where charge.balance > 0 and charge.age_bucket = 'over_90'), 0)::numeric as over_90
    from charge_balances charge
    group by charge.student_id, charge.branch_id
    having coalesce(sum(charge.balance), 0) > 0
  ),
  page_accounts as (
    select
      account.*,
      student.last_name,
      student.first_name
    from accounts account
    join public.education_students student
      on student.org_id = p_org_id
      and student.branch_id = account.branch_id
      and student.id = account.student_id
    order by account.balance desc, student.last_name, student.first_name, account.student_id
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  ),
  totals as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(account.balance), 0)::numeric as total_balance,
      coalesce(sum(account.not_due), 0)::numeric as total_not_due,
      coalesce(sum(account.days_1_to_30), 0)::numeric as total_days_1_to_30,
      coalesce(sum(account.days_31_to_60), 0)::numeric as total_days_31_to_60,
      coalesce(sum(account.days_61_to_90), 0)::numeric as total_days_61_to_90,
      coalesce(sum(account.over_90), 0)::numeric as total_over_90
    from accounts account
  )
  select
    page.student_id,
    page.branch_id,
    page.outstanding_charges,
    page.balance,
    page.not_due,
    page.days_1_to_30,
    page.days_31_to_60,
    page.days_61_to_90,
    page.over_90,
    totals.total_count,
    totals.total_balance,
    totals.total_not_due,
    totals.total_days_1_to_30,
    totals.total_days_31_to_60,
    totals.total_days_61_to_90,
    totals.total_over_90
  from totals
  left join page_accounts page on true;
$$;

revoke all on function public.education_get_fee_aging_page(
  uuid, uuid[], uuid, date, integer, integer
) from public, anon;
grant execute on function public.education_get_fee_aging_page(
  uuid, uuid[], uuid, date, integer, integer
) to authenticated;

create or replace function public.education_get_fee_collections_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_from timestamptz,
  p_to_exclusive timestamptz,
  p_payment_method text,
  p_limit integer,
  p_offset integer
) returns table (
  payment_id uuid,
  charge_id uuid,
  amount numeric,
  payment_method text,
  reference text,
  created_at timestamptz,
  branch_id uuid,
  student_id uuid,
  academic_year_id uuid,
  description text,
  charge_amount numeric,
  charge_status text,
  student_number text,
  first_name text,
  last_name text,
  total_count bigint,
  total_collected numeric,
  totals_by_method jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with authorized_payments as (
    select
      payment.id,
      payment.charge_id,
      payment.amount,
      payment.payment_method,
      payment.reference,
      payment.created_at,
      charge.branch_id,
      charge.student_id,
      charge.academic_year_id,
      charge.description,
      charge.amount as charge_amount,
      charge.status as charge_status,
      student.student_number,
      student.first_name,
      student.last_name
    from public.education_fee_payments payment
    join public.education_fee_charges charge
      on charge.org_id = payment.org_id
      and charge.id = payment.charge_id
    left join public.education_students student
      on student.org_id = charge.org_id
      and student.branch_id = charge.branch_id
      and student.id = charge.student_id
    where payment.org_id = p_org_id
      and charge.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and payment.created_at >= p_from
      and payment.created_at < p_to_exclusive
      and (nullif(p_payment_method, '') is null or payment.payment_method = p_payment_method)
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_finance', 'finance', 'payments', 'view'
      )
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_students', 'students', 'list', 'view'
      )
      and public.education_can_access_fee_report_branch(
        p_org_id, charge.branch_id, 'education_academics', 'academics', 'calendar', 'view'
      )
  ),
  totals as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(payment.amount), 0)::numeric as total_collected,
      coalesce(
        (
          select jsonb_object_agg(method.payment_method, method.amount)
          from (
            select authorized.payment_method, sum(authorized.amount)::numeric as amount
            from authorized_payments authorized
            group by authorized.payment_method
          ) method
        ),
        '{}'::jsonb
      ) as totals_by_method
    from authorized_payments payment
  ),
  page_payments as (
    select *
    from authorized_payments
    order by created_at desc, id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    page.id,
    page.charge_id,
    page.amount,
    page.payment_method,
    page.reference,
    page.created_at,
    page.branch_id,
    page.student_id,
    page.academic_year_id,
    page.description,
    page.charge_amount,
    page.charge_status,
    page.student_number,
    page.first_name,
    page.last_name,
    totals.total_count,
    totals.total_collected,
    totals.totals_by_method
  from totals
  left join page_payments page on true;
$$;

revoke all on function public.education_get_fee_collections_page(
  uuid, uuid[], timestamptz, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.education_get_fee_collections_page(
  uuid, uuid[], timestamptz, timestamptz, text, integer, integer
) to authenticated;

commit;
