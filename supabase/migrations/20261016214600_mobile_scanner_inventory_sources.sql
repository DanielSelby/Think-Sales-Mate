alter table public.pos_mobile_scanner_sessions
  drop constraint if exists pos_mobile_scanner_sessions_source_module_check;

alter table public.pos_mobile_scanner_sessions
  add constraint pos_mobile_scanner_sessions_source_module_check
  check (source_module in ('pos', 'sales', 'inventory', 'transfers', 'stock_adjustment'));
