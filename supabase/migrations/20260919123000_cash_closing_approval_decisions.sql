alter table public.cash_closing_audit
  drop constraint if exists cash_closing_audit_action_check;

alter table public.cash_closing_audit
  add constraint cash_closing_audit_action_check
  check (action in (
    'created','approved','rejected','explanation_requested','exported','printed',
    'reopen_requested','reopen_approved','reopened','reopen_rejected'
  ));
