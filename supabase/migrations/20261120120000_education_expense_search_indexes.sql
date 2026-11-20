create extension if not exists pg_trgm with schema extensions;

create index if not exists education_expenses_description_search_idx
  on public.education_expenses using gin (description gin_trgm_ops);

create index if not exists education_expenses_vendor_search_idx
  on public.education_expenses using gin (vendor gin_trgm_ops)
  where vendor is not null;

create index if not exists education_expenses_reference_search_idx
  on public.education_expenses using gin (reference gin_trgm_ops)
  where reference is not null;
