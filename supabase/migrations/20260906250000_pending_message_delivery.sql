begin;

alter table public.communication_message_history
  drop constraint if exists communication_message_history_status_check;

alter table public.communication_message_history
  add constraint communication_message_history_status_check
  check (status in ('Pending', 'Sent', 'Delivered', 'Read', 'Failed', 'Cancelled'));

commit;
