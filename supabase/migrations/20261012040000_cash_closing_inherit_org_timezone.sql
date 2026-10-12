begin;

alter table public.cash_closing_branch_schedules
  alter column time_zone drop not null,
  alter column time_zone drop default;

update public.cash_closing_branch_schedules
set time_zone = null
where time_zone = 'UTC'
  and updated_by is null;

commit;
