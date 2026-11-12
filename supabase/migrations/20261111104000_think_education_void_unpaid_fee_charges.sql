begin;

create or replace function public.education_void_unpaid_fee_charge(
  p_org_id uuid,
  p_charge_id uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  charge_row public.education_fee_charges%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason between 3 and 500 characters is required to void a fee charge.'
      using errcode = '22023';
  end if;

  select * into charge_row
  from public.education_fee_charges
  where org_id = p_org_id and id = p_charge_id
  for update;
  if not found then
    raise exception 'The student fee charge was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, charge_row.branch_id, 'education_finance', 'edit'
  ) then
    raise exception 'You are not authorized to void fee charges at this campus.'
      using errcode = '42501';
  end if;

  if charge_row.status <> 'open' then
    raise exception 'Only open fee charges can be voided.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.education_fee_payments payment
    where payment.org_id = p_org_id and payment.charge_id = p_charge_id
  ) then
    raise exception 'A fee charge with recorded payments cannot be voided.'
      using errcode = '22023';
  end if;

  update public.education_fee_charges
  set status = 'void'
  where org_id = p_org_id and id = p_charge_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'charge_voided', 'education_fee_charge', p_charge_id,
    jsonb_build_object(
      'branch_id', charge_row.branch_id,
      'student_id', charge_row.student_id,
      'academic_year_id', charge_row.academic_year_id,
      'amount', charge_row.amount,
      'reason', btrim(p_reason)
    )
  );
  return true;
end;
$$;

revoke all on function public.education_void_unpaid_fee_charge(uuid, uuid, text) from public, anon;
grant execute on function public.education_void_unpaid_fee_charge(uuid, uuid, text) to authenticated;

commit;
