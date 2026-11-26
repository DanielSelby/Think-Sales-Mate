begin;

alter table public.education_fee_payments
  drop constraint if exists education_fee_payments_amount_check,
  add constraint education_fee_payments_amount_check
    check (amount <> 0 and abs(amount) <= 9999999999.99);

alter table public.education_fee_payments
  add column if not exists reversal_of_payment_id uuid,
  add column if not exists reversal_reason text,
  add column if not exists reversed_by uuid,
  add column if not exists reversed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_fee_payments_reversal_fkey'
      and conrelid = 'public.education_fee_payments'::regclass
  ) then
    alter table public.education_fee_payments
      add constraint education_fee_payments_reversal_fkey
      foreign key (org_id, reversal_of_payment_id)
      references public.education_fee_payments(org_id, id) on delete restrict;
  end if;
end;
$$;

create index if not exists education_fee_payments_reversal_idx
  on public.education_fee_payments (org_id, charge_id, reversal_of_payment_id, created_at desc);

create table if not exists public.education_fee_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  charge_id uuid not null,
  correction_type text not null check (correction_type in ('payment_reverse', 'charge_amount_correct')),
  original_amount numeric(12, 2) not null,
  corrected_amount numeric(12, 2) not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  payment_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (org_id, charge_id)
    references public.education_fee_charges(org_id, id) on delete restrict,
  foreign key (org_id, payment_id)
    references public.education_fee_payments(org_id, id) on delete restrict
);

create index if not exists education_fee_corrections_charge_idx
  on public.education_fee_corrections (org_id, charge_id, created_at desc);

alter table public.education_fee_corrections enable row level security;
revoke all on public.education_fee_corrections from public, anon, authenticated;

create or replace function public.education_reverse_fee_payment(
  p_org_id uuid,
  p_payment_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.education_fee_payments%rowtype;
  charge public.education_fee_charges%rowtype;
  reversal_id uuid;
  correction_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_payment_id is null
    or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'Refund or reversal details are invalid.' using errcode = '22023';
  end if;

  select payment.* into payment
  from public.education_fee_payments payment
  where payment.org_id = p_org_id and payment.id = p_payment_id
  for update;
  if not found then
    raise exception 'The fee payment was not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.education_fee_payments reversal
    where reversal.org_id = p_org_id
      and reversal.reversal_of_payment_id = p_payment_id
  ) then
    raise exception 'This payment has already been reversed.' using errcode = '23505';
  end if;

  select charge.* into charge
  from public.education_fee_charges charge
  where charge.org_id = p_org_id and charge.id = payment.charge_id
  for update;
  if not found then
    raise exception 'The fee charge was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, charge.branch_id, 'education_finance', 'approve')
    or not public.education_can_access_branch(p_org_id, charge.branch_id, 'education_finance', 'edit') then
    raise exception 'Approval and edit access are required to reverse a fee payment.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.education_accounting_fiscal_years fiscal
    join public.education_accounting_periods period
      on period.org_id = fiscal.org_id
      and period.fiscal_year_id = fiscal.id
    where fiscal.org_id = p_org_id
      and fiscal.status = 'open'
      and period.status = 'open'
      and current_date between fiscal.starts_on and fiscal.ends_on
      and current_date between period.starts_on and period.ends_on
  ) then
    raise exception 'A reversal requires an open accounting period today.' using errcode = '22023';
  end if;

  insert into public.education_fee_payments (
    org_id, charge_id, amount, payment_method, reference,
    reversal_of_payment_id, reversal_reason, reversed_by, reversed_at, recorded_by
  ) values (
    p_org_id, payment.charge_id, -payment.amount, payment.payment_method,
    'REV:' || p_payment_id::text,
    p_payment_id, btrim(p_reason), auth.uid(), now(), auth.uid()
  ) returning id into reversal_id;

  insert into public.education_fee_corrections (
    org_id, charge_id, correction_type, original_amount, corrected_amount,
    reason, payment_id, created_by
  ) values (
    p_org_id, payment.charge_id, 'payment_reverse',
    payment.amount, payment.amount * -1, btrim(p_reason),
    p_payment_id, auth.uid()
  ) returning id into correction_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_fee_payment_reversed',
    'education_fee_payment', p_payment_id,
    jsonb_build_object(
      'branch_id', charge.branch_id, 'charge_id', payment.charge_id,
      'reversal_id', reversal_id, 'correction_id', correction_id,
      'amount', payment.amount, 'reason', btrim(p_reason)
    )
  );
  return reversal_id;
end;
$$;

revoke all on function public.education_reverse_fee_payment(uuid, uuid, text) from public, anon;
grant execute on function public.education_reverse_fee_payment(uuid, uuid, text) to authenticated;

commit;
