begin;

create table if not exists public.education_fee_charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 160),
  amount numeric(12, 2) not null check (amount > 0),
  due_on date,
  status text not null default 'open' check (status in ('open', 'void')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict
);

create index if not exists education_fee_charges_branch_year_idx
  on public.education_fee_charges (org_id, branch_id, academic_year_id, created_at desc);
create index if not exists education_fee_charges_student_idx
  on public.education_fee_charges (org_id, student_id, created_at desc);

create table if not exists public.education_fee_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  charge_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text check (reference is null or char_length(reference) <= 120),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, charge_id)
    references public.education_fee_charges(org_id, id) on delete restrict
);

create index if not exists education_fee_payments_charge_idx
  on public.education_fee_payments (org_id, charge_id, created_at);

create or replace function public.education_validate_fee_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.education_students student
    where student.org_id = new.org_id
      and student.branch_id = new.branch_id
      and student.id = new.student_id
      and student.status = 'active'
  ) then
    raise exception 'Fee charges can only be created for active students at the selected campus.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_academic_years academic_year
    where academic_year.org_id = new.org_id
      and academic_year.id = new.academic_year_id
      and academic_year.status in ('planned', 'active')
  ) then
    raise exception 'Fee charges require a planned or active academic year.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger education_fee_charge_validate
  before insert on public.education_fee_charges
  for each row execute function public.education_validate_fee_charge();
revoke all on function public.education_validate_fee_charge() from public, anon, authenticated;

create or replace function public.education_audit_fee_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.org_id, auth.uid(), 'charge_created', 'education_fee_charge', new.id,
    jsonb_build_object(
      'branch_id', new.branch_id,
      'student_id', new.student_id,
      'academic_year_id', new.academic_year_id,
      'description', new.description,
      'amount', new.amount,
      'due_on', new.due_on
    )
  );
  return new;
end;
$$;

create trigger education_fee_charge_audit
  after insert on public.education_fee_charges
  for each row execute function public.education_audit_fee_charge();
revoke all on function public.education_audit_fee_charge() from public, anon, authenticated;

alter table public.education_fee_charges enable row level security;
alter table public.education_fee_payments enable row level security;

create policy "education fee charges read"
  on public.education_fee_charges for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_finance', 'view'));
create policy "education fee charges create"
  on public.education_fee_charges for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_finance', 'create'));

create policy "education fee payments read"
  on public.education_fee_payments for select
  using (
    exists (
      select 1
      from public.education_fee_charges charge
      where charge.org_id = education_fee_payments.org_id
        and charge.id = education_fee_payments.charge_id
        and public.education_can_access_branch(
          charge.org_id, charge.branch_id, 'education_finance', 'view'
        )
    )
  );

create or replace function public.education_record_fee_payment(
  p_org_id uuid,
  p_charge_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  charge_row public.education_fee_charges%rowtype;
  paid_total numeric(12, 2);
  payment_id uuid;
begin
  select * into charge_row
  from public.education_fee_charges
  where org_id = p_org_id and id = p_charge_id
  for update;
  if not found then
    raise exception 'The student fee charge was not found.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, charge_row.branch_id, 'education_finance', 'create'
  ) then
    raise exception 'You are not authorized to record payments at this campus.'
      using errcode = '42501';
  end if;
  if charge_row.status <> 'open'
    or p_amount is null
    or p_amount <= 0
    or p_amount > 9999999999.99
    or p_amount <> round(p_amount, 2)
    or p_payment_method is null
    or p_payment_method not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')
    or char_length(coalesce(p_reference, '')) > 120 then
    raise exception 'The payment details are invalid.'
      using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into paid_total
  from public.education_fee_payments
  where org_id = p_org_id and charge_id = p_charge_id;
  if paid_total + p_amount > charge_row.amount then
    raise exception 'The payment exceeds the outstanding balance.'
      using errcode = '22023';
  end if;

  insert into public.education_fee_payments (
    org_id, charge_id, amount, payment_method, reference, recorded_by
  ) values (
    p_org_id, p_charge_id, p_amount, p_payment_method, nullif(btrim(p_reference), ''), auth.uid()
  ) returning id into payment_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'payment_recorded', 'education_fee_charge', p_charge_id,
    jsonb_build_object(
      'payment_id', payment_id,
      'amount', p_amount,
      'payment_method', p_payment_method,
      'reference', nullif(btrim(p_reference), '')
    )
  );
  return payment_id;
end;
$$;

revoke all on function public.education_record_fee_payment(uuid, uuid, numeric, text, text)
  from public, anon;
grant execute on function public.education_record_fee_payment(uuid, uuid, numeric, text, text)
  to authenticated;

grant select on public.education_fee_charges to authenticated;
grant insert (org_id, branch_id, student_id, academic_year_id, description, amount, due_on)
  on public.education_fee_charges to authenticated;
revoke update, delete on public.education_fee_charges from authenticated;
grant select on public.education_fee_payments to authenticated;
revoke insert, update, delete on public.education_fee_payments from authenticated;

revoke all on public.education_fee_charges from anon;
revoke all on public.education_fee_payments from anon;

commit;
