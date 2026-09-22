begin;

create table if not exists public.bank_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  transaction_date date not null,
  reference text,
  description text,
  amount numeric(14, 2) not null check (amount > 0),
  type public.bank_transaction_type not null,
  matched boolean not null default false,
  matched_transaction_id uuid references public.bank_transactions(id) on delete set null,
  imported_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_statement_transactions_account
  on public.bank_statement_transactions(org_id, bank_account_id, transaction_date desc);

alter table public.bank_statement_transactions enable row level security;

create policy "bank_statement_transactions: members can read"
  on public.bank_statement_transactions for select
  using (public.is_org_member(org_id));

create policy "bank_statement_transactions: managers can manage"
  on public.bank_statement_transactions for all
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

commit;
