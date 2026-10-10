begin;

update public.bank_statement_transactions
set matched = false
where matched and matched_transaction_id is null;

update public.bank_statement_transactions
set matched = true
where matched_transaction_id is not null
  and not matched;

with duplicate_matches as (
  select id, row_number() over (
    partition by matched_transaction_id
    order by created_at, id
  ) as duplicate_number
  from public.bank_statement_transactions
  where matched_transaction_id is not null
)
update public.bank_statement_transactions as statement
set matched = false,
    matched_transaction_id = null
from duplicate_matches
where statement.id = duplicate_matches.id
  and duplicate_matches.duplicate_number > 1;

create unique index if not exists idx_bank_statement_transactions_unique_book_match
  on public.bank_statement_transactions(matched_transaction_id)
  where matched_transaction_id is not null;

commit;
