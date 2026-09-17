alter table public.currency_settings
  add column if not exists currency_code text,
  add column if not exists currency_symbol text,
  add column if not exists currency_name text,
  add column if not exists thousand_separator text not null default ',',
  add column if not exists decimal_separator text not null default '.',
  add column if not exists currency_position text not null default 'before'
    check (currency_position in ('before', 'after'));

update public.currency_settings
set
  currency_code = coalesce(currency_code, 'GHS'),
  currency_symbol = coalesce(currency_symbol, 'GH₵'),
  currency_name = coalesce(currency_name, 'Ghana Cedi')
where currency_code is null
   or currency_symbol is null
   or currency_name is null;

alter table public.currency_settings
  alter column currency_code set default 'GHS',
  alter column currency_symbol set default 'GH₵',
  alter column currency_name set default 'Ghana Cedi';
