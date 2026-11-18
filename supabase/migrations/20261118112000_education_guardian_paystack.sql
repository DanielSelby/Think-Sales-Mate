begin;

alter table public.education_fee_payments
  drop constraint if exists education_fee_payments_payment_method_check,
  add constraint education_fee_payments_payment_method_check
    check (payment_method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other', 'paystack'));

create unique index if not exists education_fee_payments_paystack_reference_unique_idx
  on public.education_fee_payments (reference)
  where payment_method = 'paystack' and reference is not null;

create table if not exists public.education_guardian_fee_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^EDU-[A-F0-9]{32}$'),
  org_id uuid not null,
  charge_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payer_email text not null check (char_length(payer_email) between 3 and 254),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  initialization_started_at timestamptz,
  authorization_url text,
  payment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, charge_id)
    references public.education_fee_charges(org_id, id) on delete restrict,
  foreign key (org_id, guardian_id)
    references public.education_guardians(org_id, id) on delete restrict,
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete restrict,
  foreign key (org_id, payment_id)
    references public.education_fee_payments(org_id, id) on delete restrict
);

create unique index if not exists education_guardian_fee_payment_one_pending_charge_idx
  on public.education_guardian_fee_payment_attempts (org_id, charge_id)
  where status = 'pending';
create index if not exists education_guardian_fee_payment_attempts_user_idx
  on public.education_guardian_fee_payment_attempts (user_id, created_at desc);

alter table public.education_guardian_fee_payment_attempts enable row level security;
revoke all on public.education_guardian_fee_payment_attempts from public, anon, authenticated;
grant select, insert, update on public.education_guardian_fee_payment_attempts to service_role;

create or replace function public.education_guardian_paystack_create_attempt(
  p_user_id uuid,
  p_charge_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  charge_row public.education_fee_charges%rowtype;
  guardian_row public.education_guardians%rowtype;
  email_value text;
  currency_value text;
  paid_total numeric(12, 2);
  remaining numeric(12, 2);
  attempt_row public.education_guardian_fee_payment_attempts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create guardian fee payment attempts.';
  end if;
  if p_user_id is null or p_charge_id is null then
    raise exception 'A signed-in guardian and fee charge are required.' using errcode = '22023';
  end if;

  select lower(btrim(auth_user.email)) into email_value
  from auth.users auth_user
  where auth_user.id = p_user_id and auth_user.email_confirmed_at is not null;
  if email_value is null then
    raise exception 'A verified guardian email is required.' using errcode = '42501';
  end if;

  select * into charge_row
  from public.education_fee_charges
  where id = p_charge_id
  for update;
  if not found or charge_row.status <> 'open' then
    raise exception 'The outstanding fee charge was not found.' using errcode = 'P0002';
  end if;

  select guardian.* into guardian_row
  from public.education_guardians guardian
  join public.education_student_guardians relationship
    on relationship.org_id = guardian.org_id and relationship.guardian_id = guardian.id
  join public.education_students student
    on student.org_id = relationship.org_id
    and student.branch_id = relationship.branch_id
    and student.id = relationship.student_id
  join public.organizations organization on organization.id = guardian.org_id
  where guardian.org_id = charge_row.org_id
    and guardian.user_id = p_user_id
    and guardian.status = 'active'
    and relationship.student_id = charge_row.student_id
    and relationship.status = 'verified'
    and student.status = 'active'
    and organization.registration_status = 'approved'
    and public.has_product_access(guardian.org_id, 'think-education', false)
  limit 1;
  if not found then
    raise exception 'An active, verified guardian relationship is required for this fee.' using errcode = '42501';
  end if;

  select upper(organization.currency) into currency_value
  from public.organizations organization
  where organization.id = charge_row.org_id;
  if currency_value is null or currency_value !~ '^[A-Z]{3}$' then
    raise exception 'The school currency is not configured for online payment.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_accounting_fiscal_years fiscal
    join public.education_accounting_periods period
      on period.org_id = fiscal.org_id and period.fiscal_year_id = fiscal.id
    where fiscal.org_id = charge_row.org_id
      and fiscal.status = 'open' and period.status = 'open'
      and current_date between fiscal.starts_on and fiscal.ends_on
      and current_date between period.starts_on and period.ends_on
  ) then
    raise exception 'Online fee payments require an open accounting period for today.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_accounting_source_mappings mapping
    join public.education_accounting_accounts account
      on account.org_id = mapping.org_id and account.id = mapping.account_id
    where mapping.org_id = charge_row.org_id
      and mapping.branch_id = charge_row.branch_id
      and mapping.source_type = 'fee_receivable'
      and mapping.source_key = ''
      and account.is_active
      and (account.branch_id is null or account.branch_id = charge_row.branch_id)
  ) then
    raise exception 'Configure an active student receivable account before accepting online fee payments.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.education_accounting_source_mappings mapping
    join public.education_accounting_accounts account
      on account.org_id = mapping.org_id and account.id = mapping.account_id
    where mapping.org_id = charge_row.org_id
      and mapping.branch_id = charge_row.branch_id
      and mapping.source_type = 'payment_account'
      and mapping.source_key = 'card'
      and account.is_active
      and account.is_cash_account
      and (account.branch_id is null or account.branch_id = charge_row.branch_id)
  ) then
    raise exception 'Configure an active card payment account before accepting online fee payments.'
      using errcode = '23514';
  end if;

  update public.education_guardian_fee_payment_attempts
  set status = 'expired', updated_at = now()
  where org_id = charge_row.org_id
    and charge_id = charge_row.id
    and status = 'pending'
    and expires_at <= now();

  select * into attempt_row
  from public.education_guardian_fee_payment_attempts
  where org_id = charge_row.org_id
    and charge_id = charge_row.id
    and status = 'pending'
  for update;
  if found then
    return jsonb_build_object(
      'id', attempt_row.id, 'reference', attempt_row.reference, 'status', attempt_row.status,
      'amount', attempt_row.amount, 'currency', attempt_row.currency, 'payer_email', attempt_row.payer_email,
      'expires_at', attempt_row.expires_at, 'authorization_url', attempt_row.authorization_url
    );
  end if;

  select coalesce(sum(payment.amount), 0) into paid_total
  from public.education_fee_payments payment
  where payment.org_id = charge_row.org_id and payment.charge_id = charge_row.id;
  remaining := round(charge_row.amount - paid_total, 2);
  if remaining <= 0 then
    raise exception 'This fee charge has no outstanding balance.' using errcode = '22023';
  end if;

  insert into public.education_guardian_fee_payment_attempts (
    reference, org_id, charge_id, student_id, guardian_id, user_id,
    amount, currency, payer_email
  ) values (
    'EDU-' || upper(replace(gen_random_uuid()::text, '-', '')),
    charge_row.org_id, charge_row.id, charge_row.student_id, guardian_row.id, p_user_id,
    remaining, currency_value, email_value
  )
  returning * into attempt_row;

  return jsonb_build_object(
    'id', attempt_row.id, 'reference', attempt_row.reference, 'status', attempt_row.status,
    'amount', attempt_row.amount, 'currency', attempt_row.currency, 'payer_email', attempt_row.payer_email,
    'expires_at', attempt_row.expires_at, 'authorization_url', attempt_row.authorization_url
  );
end;
$$;

create or replace function public.education_guardian_paystack_claim_initialization(
  p_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_row public.education_guardian_fee_payment_attempts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can initialize guardian fee payments.';
  end if;
  select * into attempt_row
  from public.education_guardian_fee_payment_attempts
  where reference = p_reference
  for update;
  if not found then
    raise exception 'The guardian fee payment attempt was not found.' using errcode = 'P0002';
  end if;
  if attempt_row.status <> 'pending' or attempt_row.expires_at <= now() then
    if attempt_row.status = 'pending' then
      update public.education_guardian_fee_payment_attempts
      set status = 'expired', updated_at = now()
      where id = attempt_row.id;
    end if;
    return jsonb_build_object('status', 'expired', 'should_initialize', false);
  end if;
  if attempt_row.authorization_url is not null then
    return jsonb_build_object(
      'status', attempt_row.status, 'should_initialize', false,
      'authorization_url', attempt_row.authorization_url
    );
  end if;
  if attempt_row.initialization_started_at > now() - interval '90 seconds' then
    return jsonb_build_object('status', attempt_row.status, 'should_initialize', false);
  end if;
  update public.education_guardian_fee_payment_attempts
  set initialization_started_at = now(), updated_at = now()
  where id = attempt_row.id;
  return jsonb_build_object('status', attempt_row.status, 'should_initialize', true);
end;
$$;

create or replace function public.education_guardian_paystack_release_initialization(
  p_reference text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can release guardian fee initialization.';
  end if;
  update public.education_guardian_fee_payment_attempts
  set initialization_started_at = null, updated_at = now()
  where reference = p_reference and status = 'pending' and authorization_url is null;
  return found;
end;
$$;

create or replace function public.education_guardian_paystack_save_checkout(
  p_reference text,
  p_authorization_url text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can save guardian fee checkout details.';
  end if;
  if p_authorization_url is null
    or char_length(p_authorization_url) > 2048
    or p_authorization_url !~ '^https://checkout[.]paystack[.]com/[^[:space:]#]+$' then
    raise exception 'The Paystack checkout URL is invalid.' using errcode = '22023';
  end if;
  update public.education_guardian_fee_payment_attempts
  set authorization_url = p_authorization_url, updated_at = now()
  where reference = p_reference
    and status = 'pending'
    and expires_at > now();
  return found;
end;
$$;

create or replace function public.education_guardian_paystack_get_attempt(
  p_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_row public.education_guardian_fee_payment_attempts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can load guardian fee payment attempts.';
  end if;
  select * into attempt_row
  from public.education_guardian_fee_payment_attempts
  where reference = p_reference;
  if not found then return null; end if;
  return jsonb_build_object(
    'reference', attempt_row.reference,
    'amount_minor', (attempt_row.amount * 100)::bigint,
    'currency', attempt_row.currency,
    'status', attempt_row.status,
    'expires_at', attempt_row.expires_at,
    'payment_id', attempt_row.payment_id
  );
end;
$$;

create or replace function public.education_guardian_paystack_mark_failed(
  p_reference text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can update guardian fee payment attempts.';
  end if;
  update public.education_guardian_fee_payment_attempts
  set status = case when expires_at <= now() then 'expired' else 'failed' end,
      updated_at = now()
  where reference = p_reference and status = 'pending';
  return found;
end;
$$;

create or replace function public.education_guardian_paystack_record_payment(
  p_reference text,
  p_amount_minor bigint,
  p_currency text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_row public.education_guardian_fee_payment_attempts%rowtype;
  charge_row public.education_fee_charges%rowtype;
  paid_total numeric(12, 2);
  created_payment_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record guardian fee payments.';
  end if;
  select * into attempt_row
  from public.education_guardian_fee_payment_attempts
  where reference = p_reference;
  if not found then
    raise exception 'The guardian fee payment reference was not found.' using errcode = 'P0002';
  end if;

  select * into charge_row
  from public.education_fee_charges
  where org_id = attempt_row.org_id and id = attempt_row.charge_id
  for update;
  if not found then
    raise exception 'The fee charge was not found.' using errcode = 'P0002';
  end if;
  select * into attempt_row
  from public.education_guardian_fee_payment_attempts
  where reference = p_reference
  for update;

  if p_amount_minor is null or p_amount_minor <> (attempt_row.amount * 100)::bigint
    or p_currency is distinct from attempt_row.currency then
    raise exception 'The Paystack payment does not match the reserved fee amount and currency.'
      using errcode = '22023';
  end if;
  if attempt_row.status = 'paid' then
    return attempt_row.payment_id;
  end if;
  if attempt_row.status not in ('pending', 'expired', 'failed') then
    raise exception 'This guardian fee payment attempt is no longer payable.' using errcode = '22023';
  end if;
  if charge_row.status <> 'open' then
    raise exception 'The fee charge is no longer open.' using errcode = '22023';
  end if;

  select coalesce(sum(payment.amount), 0) into paid_total
  from public.education_fee_payments payment
  where payment.org_id = charge_row.org_id and payment.charge_id = charge_row.id;
  if paid_total + attempt_row.amount > charge_row.amount then
    raise exception 'The verified payment would exceed the outstanding fee balance.'
      using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.sub', attempt_row.user_id::text, true);
  insert into public.education_fee_payments (
    org_id, charge_id, amount, payment_method, reference, recorded_by
  ) values (
    attempt_row.org_id, attempt_row.charge_id, attempt_row.amount, 'paystack',
    attempt_row.reference, attempt_row.user_id
  ) returning id into created_payment_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    attempt_row.org_id, attempt_row.user_id, 'payment_recorded', 'education_fee_charge',
    attempt_row.charge_id,
    jsonb_build_object(
      'payment_id', created_payment_id, 'amount', attempt_row.amount,
      'payment_method', 'paystack', 'reference', attempt_row.reference
    )
  );

  update public.education_guardian_fee_payment_attempts
  set status = 'paid', payment_id = created_payment_id, updated_at = now()
  where id = attempt_row.id and status in ('pending', 'expired', 'failed');
  if not found then
    raise exception 'The guardian fee payment attempt changed while being recorded.' using errcode = '40001';
  end if;
  return created_payment_id;
end;
$$;

create or replace function public.education_guardian_paystack_portal_fees()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with guardian_scope as (
    select guardian.org_id, guardian.id as guardian_id
    from public.education_guardians guardian
    join public.organizations organization on organization.id = guardian.org_id
    where guardian.user_id = auth.uid()
      and guardian.status = 'active'
      and organization.registration_status = 'approved'
      and public.has_product_access(guardian.org_id, 'think-education', false)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'organizationId', charge.org_id,
      'studentId', charge.student_id,
      'chargeId', charge.id,
      'description', charge.description,
      'dueOn', charge.due_on,
      'amount', charge.amount,
      'paid', coalesce(payment_totals.paid, 0),
      'balance', greatest(charge.amount - coalesce(payment_totals.paid, 0), 0),
      'paymentStatus', case
        when latest_attempt.status = 'pending' and latest_attempt.expires_at <= now() then 'expired'
        else latest_attempt.status
      end
    )
    order by charge.org_id, charge.student_id, charge.due_on nulls last, charge.created_at desc
  ), '[]'::jsonb)
  from guardian_scope guardian
  join public.education_student_guardians relationship
    on relationship.org_id = guardian.org_id and relationship.guardian_id = guardian.guardian_id
    and relationship.status = 'verified'
  join public.education_students student
    on student.org_id = relationship.org_id
    and student.branch_id = relationship.branch_id
    and student.id = relationship.student_id
    and student.status = 'active'
  join public.education_fee_charges charge
    on charge.org_id = student.org_id
    and charge.branch_id = student.branch_id
    and charge.student_id = student.id
    and charge.status = 'open'
  left join lateral (
    select sum(payment.amount) as paid
    from public.education_fee_payments payment
    where payment.org_id = charge.org_id and payment.charge_id = charge.id
  ) payment_totals on true
  left join lateral (
    select attempt.status, attempt.expires_at
    from public.education_guardian_fee_payment_attempts attempt
    where attempt.org_id = charge.org_id and attempt.charge_id = charge.id
    order by attempt.created_at desc, attempt.id desc
    limit 1
  ) latest_attempt on true
  where auth.uid() is not null
    and (
      charge.amount - coalesce(payment_totals.paid, 0) > 0
      or latest_attempt.status = 'paid'
    );
$$;

create or replace function public.education_accounting_post_source_event(
  p_org_id uuid,
  p_branch_id uuid,
  p_source_type text,
  p_source_record_id uuid,
  p_entry_date date,
  p_amount numeric,
  p_description text,
  p_reference text,
  p_payment_method text,
  p_expense_category text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  debit_account_id uuid;
  credit_account_id uuid;
  receivable_account_id uuid;
  income_account_id uuid;
  payable_account_id uuid;
  period_row public.education_accounting_periods%rowtype;
  fiscal_row public.education_accounting_fiscal_years%rowtype;
  journal_number_value bigint;
  journal_id uuid;
  permission_module text;
  permission_action text;
  debit_description text;
  credit_description text;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_source_type is null or p_source_record_id is null or p_entry_date is null
    or p_amount is null or p_amount <= 0 or p_amount > 999999999999.99
    or p_amount <> round(p_amount, 2)
    or p_source_type not in (
      'fee_charge', 'fee_payment', 'fee_charge_void', 'expense_approved', 'expense_paid'
    ) then
    raise exception 'Automated journal source details are invalid.' using errcode = '22023';
  end if;

  permission_module := case when p_source_type like 'expense_%' then 'education_expenses' else 'education_finance' end;
  permission_action := case
    when p_source_type in ('fee_charge', 'fee_payment') then 'create'
    when p_source_type in ('fee_charge_void', 'expense_paid') then 'edit'
    else 'approve'
  end;
  if not public.education_can_access_branch(p_org_id, p_branch_id, permission_module, permission_action)
    and not (coalesce(auth.role(), '') = 'service_role' and p_source_type = 'fee_payment') then
    raise exception 'The source transaction is not authorized for accounting posting.' using errcode = '42501';
  end if;

  select id into journal_id
  from public.education_accounting_journals
  where org_id = p_org_id and source_module = p_source_type and source_record_id = p_source_record_id;
  if found then return journal_id; end if;

  select fiscal.* into fiscal_row
  from public.education_accounting_fiscal_years fiscal
  join public.education_accounting_periods period
    on period.org_id = fiscal.org_id and period.fiscal_year_id = fiscal.id
  where fiscal.org_id = p_org_id and fiscal.status = 'open' and period.status = 'open'
    and p_entry_date between fiscal.starts_on and fiscal.ends_on
    and p_entry_date between period.starts_on and period.ends_on
  for share of fiscal, period;
  if not found then
    raise exception 'Automated journal posting requires an open fiscal period for the transaction date.'
      using errcode = '22023';
  end if;
  select * into period_row
  from public.education_accounting_periods
  where org_id = p_org_id and fiscal_year_id = fiscal_row.id
    and p_entry_date between starts_on and ends_on and status = 'open';
  if not found then
    raise exception 'No open accounting period covers the transaction date.' using errcode = '22023';
  end if;

  if p_source_type in ('fee_charge', 'fee_payment', 'fee_charge_void') then
    select account_id into receivable_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'fee_receivable' and source_key = '';
    if not found then
      raise exception 'Configure a student receivable account in Education Accounting Settings before recording fees.'
        using errcode = '23514';
    end if;
  end if;
  if p_source_type in ('fee_charge', 'fee_charge_void') then
    select account_id into income_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'fee_income' and source_key = '';
    if not found then
      raise exception 'Configure a fee income account in Education Accounting Settings before recording fees.'
        using errcode = '23514';
    end if;
  end if;
  if p_source_type in ('expense_approved', 'expense_paid') then
    select account_id into payable_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'expense_payable' and source_key = '';
    if not found then
      raise exception 'Configure an expense payable account in Education Accounting Settings before approving expenses.'
        using errcode = '23514';
    end if;
  end if;

  if p_source_type = 'fee_charge' then
    debit_account_id := receivable_account_id;
    credit_account_id := income_account_id;
    debit_description := 'Student fee receivable';
    credit_description := 'Student fee income';
  elsif p_source_type = 'fee_charge_void' then
    debit_account_id := income_account_id;
    credit_account_id := receivable_account_id;
    debit_description := 'Reversal of voided student fee income';
    credit_description := 'Reversal of voided student fee receivable';
  elsif p_source_type = 'fee_payment' then
    select account_id into debit_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'payment_account'
      and source_key = case when p_payment_method = 'paystack' then 'card' else p_payment_method end;
    if not found then
      raise exception 'Configure a card payment account in Education Accounting Settings before recording Paystack fee payments.'
        using errcode = '23514';
    end if;
    credit_account_id := receivable_account_id;
    debit_description := 'Fee payment received';
    credit_description := 'Student receivable settled';
  elsif p_source_type = 'expense_approved' then
    select account_id into debit_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'expense_category'
      and source_key = lower(btrim(coalesce(p_expense_category, '')));
    if not found then
      raise exception 'Map this expense category in Education Accounting Settings before approving the expense.'
        using errcode = '23514';
    end if;
    credit_account_id := payable_account_id;
    debit_description := 'Approved education expense';
    credit_description := 'Expense payable recognized';
  else
    select account_id into credit_account_id
    from public.education_accounting_source_mappings
    where org_id = p_org_id and branch_id = p_branch_id
      and source_type = 'payment_account' and source_key = p_payment_method;
    if not found then
      raise exception 'Configure an account for this payment method in Education Accounting Settings before paying the expense.'
        using errcode = '23514';
    end if;
    debit_account_id := payable_account_id;
    debit_description := 'Expense payable settled';
    credit_description := 'Expense payment';
  end if;

  if not exists (
    select 1 from public.education_accounting_accounts account
    where account.org_id = p_org_id and account.id = debit_account_id and account.is_active
      and (account.branch_id is null or account.branch_id = p_branch_id)
  ) or not exists (
    select 1 from public.education_accounting_accounts account
    where account.org_id = p_org_id and account.id = credit_account_id and account.is_active
      and (account.branch_id is null or account.branch_id = p_branch_id)
  ) then
    raise exception 'An automated journal mapping points to an inactive or unavailable account.'
      using errcode = '23514';
  end if;
  if p_source_type in ('fee_payment', 'expense_paid') and not exists (
    select 1 from public.education_accounting_accounts account
    where account.org_id = p_org_id
      and account.id = case when p_source_type = 'fee_payment' then debit_account_id else credit_account_id end
      and account.is_cash_account
  ) then
    raise exception 'Mapped payment accounts must remain marked as cash or bank accounts.' using errcode = '23514';
  end if;

  insert into public.education_accounting_journal_sequences as seq (org_id, last_number)
  values (p_org_id, 1)
  on conflict (org_id) do update
    set last_number = seq.last_number + 1, updated_at = now()
  returning last_number into journal_number_value;

  insert into public.education_accounting_journals (
    org_id, journal_number, branch_id, fiscal_year_id, period_id, entry_date,
    reference, description, source_module, source_record_id, status,
    total_debit, total_credit, created_by
  ) values (
    p_org_id, journal_number_value, p_branch_id, fiscal_row.id, period_row.id, p_entry_date,
    nullif(btrim(p_reference), ''), left(btrim(p_description), 300),
    p_source_type, p_source_record_id, 'draft', p_amount, p_amount, auth.uid()
  ) returning id into journal_id;

  insert into public.education_accounting_journal_lines (
    org_id, journal_id, line_number, account_id, description, debit, credit
  ) values
    (p_org_id, journal_id, 1, debit_account_id, debit_description, p_amount, 0),
    (p_org_id, journal_id, 2, credit_account_id, credit_description, 0, p_amount);

  update public.education_accounting_journals
  set status = 'posted', posted_by = auth.uid(), posted_at = now(), updated_at = now()
  where org_id = p_org_id and id = journal_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_source_journal_posted', 'education_accounting_journal', journal_id,
    jsonb_build_object(
      'source_type', p_source_type, 'source_record_id', p_source_record_id,
      'branch_id', p_branch_id, 'entry_date', p_entry_date,
      'amount', p_amount, 'journal_number', journal_number_value
    )
  );
  return journal_id;
end;
$$;

create or replace function public.education_accounting_auto_journal_fee_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  charge_row public.education_fee_charges%rowtype;
begin
  select * into charge_row
  from public.education_fee_charges
  where org_id = new.org_id and id = new.charge_id;
  if not found then
    raise exception 'The fee charge for this payment was not found.' using errcode = 'P0002';
  end if;
  perform public.education_accounting_post_source_event(
    new.org_id, charge_row.branch_id, 'fee_payment', new.id, new.created_at::date,
    new.amount, 'Fee payment · ' || charge_row.description, new.reference,
    new.payment_method, null
  );
  return new;
end;
$$;

revoke all on function public.education_accounting_post_source_event(uuid, uuid, text, uuid, date, numeric, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_create_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_claim_initialization(text) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_release_initialization(text) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_save_checkout(text, text) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_get_attempt(text) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_mark_failed(text) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_record_payment(text, bigint, text) from public, anon, authenticated;
revoke all on function public.education_guardian_paystack_portal_fees() from public, anon;
grant execute on function public.education_guardian_paystack_create_attempt(uuid, uuid) to service_role;
grant execute on function public.education_guardian_paystack_claim_initialization(text) to service_role;
grant execute on function public.education_guardian_paystack_release_initialization(text) to service_role;
grant execute on function public.education_guardian_paystack_save_checkout(text, text) to service_role;
grant execute on function public.education_guardian_paystack_get_attempt(text) to service_role;
grant execute on function public.education_guardian_paystack_mark_failed(text) to service_role;
grant execute on function public.education_guardian_paystack_record_payment(text, bigint, text) to service_role;
grant execute on function public.education_guardian_paystack_portal_fees() to authenticated;

commit;
