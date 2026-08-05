-- SalesMate ERP — Banking module (v1): accounts + transactions.
-- Account balances are sensitive financial data, so this module is gated
-- to 'manager' role and above for both read and write, same as HRM.

create type public.bank_account_type as enum ('cash', 'checking', 'savings', 'mobile_money', 'other');
create type public.bank_transaction_type as enum ('deposit', 'withdrawal');

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  account_type public.bank_account_type not null default 'cash',
  opening_balance numeric(12, 2) not null default 0,
  current_balance numeric(12, 2) not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;

create policy "bank_accounts: managers can read"
  on public.bank_accounts for select
  using (public.has_org_role(org_id, 'manager'));

create policy "bank_accounts: managers can create"
  on public.bank_accounts for insert
  with check (public.has_org_role(org_id, 'manager') and created_by = auth.uid());

create policy "bank_accounts: managers can update"
  on public.bank_accounts for update
  using (public.has_org_role(org_id, 'manager'));

create policy "bank_accounts: managers can delete"
  on public.bank_accounts for delete
  using (public.has_org_role(org_id, 'manager'));

create index idx_bank_accounts_org on public.bank_accounts(org_id);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.bank_accounts(id) on delete cascade,
  type public.bank_transaction_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  transaction_date date not null default current_date,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.bank_transactions enable row level security;

create policy "bank_transactions: managers can read"
  on public.bank_transactions for select
  using (public.is_org_member(org_id) and public.has_org_role(org_id, 'manager'));

create policy "bank_transactions: managers can record"
  on public.bank_transactions for insert
  with check (public.has_org_role(org_id, 'manager') and recorded_by = auth.uid());

create index idx_bank_transactions_account on public.bank_transactions(account_id, transaction_date desc);

-- Maintain current_balance automatically, and block a withdrawal that
-- would overdraw the account — same pattern as the Inventory stock guard.
create function public.apply_bank_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  balance numeric(12, 2);
  account_name text;
begin
  select current_balance, name into balance, account_name
  from public.bank_accounts
  where id = new.account_id
  for update;

  if balance is null then
    raise exception 'Account not found.';
  end if;

  if new.type = 'withdrawal' and balance < new.amount then
    raise exception 'Insufficient funds in "%": % available, % requested.',
      account_name, balance, new.amount;
  end if;

  update public.bank_accounts
  set current_balance = current_balance + case when new.type = 'deposit' then new.amount else -new.amount end
  where id = new.account_id;

  return new;
end;
$$;

create trigger apply_bank_transaction_trigger
  before insert on public.bank_transactions
  for each row execute procedure public.apply_bank_transaction();