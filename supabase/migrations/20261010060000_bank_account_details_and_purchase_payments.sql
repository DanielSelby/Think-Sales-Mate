alter table public.bank_accounts
  add column if not exists account_number text,
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bank-account-logos', 'bank-account-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "bank account logos: public read" on storage.objects;
create policy "bank account logos: public read"
  on storage.objects for select
  using (bucket_id = 'bank-account-logos');

drop policy if exists "bank account logos: manager upload" on storage.objects;
create policy "bank account logos: manager upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bank-account-logos'
    and public.has_org_role((storage.foldername(name))[1]::uuid, 'manager')
  );

drop policy if exists "bank account logos: manager update" on storage.objects;
create policy "bank account logos: manager update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bank-account-logos'
    and public.has_org_role((storage.foldername(name))[1]::uuid, 'manager')
  )
  with check (
    bucket_id = 'bank-account-logos'
    and public.has_org_role((storage.foldername(name))[1]::uuid, 'manager')
  );

drop policy if exists "bank account logos: manager delete" on storage.objects;
create policy "bank account logos: manager delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bank-account-logos'
    and public.has_org_role((storage.foldername(name))[1]::uuid, 'manager')
  );

create or replace function public.record_purchase_bank_payment(
  p_purchase_id uuid,
  p_org_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_actor_id uuid
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  purchase_row public.purchases%rowtype;
  next_paid numeric(12, 2);
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then
    raise exception 'You must be signed in to record this payment.';
  end if;
  if not public.has_org_role(p_org_id, 'manager') then
    raise exception 'You do not have permission to pay supplier bills.';
  end if;
  if p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  select *
  into purchase_row
  from public.purchases
  where id = p_purchase_id
    and org_id = p_org_id
  for update;

  if not found then
    raise exception 'Purchase not found.';
  end if;
  if not exists (
    select 1
    from public.bank_accounts
    where id = p_bank_account_id
      and org_id = p_org_id
  ) then
    raise exception 'Choose a valid bank account for this organization.';
  end if;

  next_paid := purchase_row.paid_amount + p_amount;
  if next_paid > purchase_row.total then
    raise exception 'Payment exceeds the outstanding purchase balance.';
  end if;

  insert into public.bank_transactions (
    org_id,
    account_id,
    type,
    amount,
    description,
    transaction_date,
    recorded_by
  ) values (
    p_org_id,
    p_bank_account_id,
    'withdrawal',
    p_amount,
    'Supplier payment for purchase ' || p_purchase_id::text,
    current_date,
    p_actor_id
  );

  update public.purchases
  set paid_amount = next_paid
  where id = p_purchase_id
    and org_id = p_org_id;

  return next_paid;
end;
$$;

revoke all on function public.record_purchase_bank_payment(uuid, uuid, uuid, numeric, uuid) from public;
grant execute on function public.record_purchase_bank_payment(uuid, uuid, uuid, numeric, uuid) to authenticated;
