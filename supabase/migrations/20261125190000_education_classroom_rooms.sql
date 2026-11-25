begin;

alter table public.education_classes
  add column if not exists room text;

alter table public.education_classes
  add constraint education_classes_room_length
    check (room is null or char_length(room) <= 80);

with single_room_per_class as (
  select
    classroom.org_id,
    classroom.id as class_id,
    min(btrim(timetable.room)) as room
  from public.education_classes classroom
  join public.education_timetable_entries timetable
    on timetable.org_id = classroom.org_id
    and timetable.class_id = classroom.id
    and timetable.academic_year_id = classroom.academic_year_id
  where timetable.status = 'active'
    and nullif(btrim(timetable.room), '') is not null
  group by classroom.org_id, classroom.id
  having count(distinct lower(btrim(timetable.room))) = 1
)
update public.education_classes classroom
set room = single_room_per_class.room
from single_room_per_class
where classroom.org_id = single_room_per_class.org_id
  and classroom.id = single_room_per_class.class_id
  and classroom.room is null;

grant insert (room) on public.education_classes to authenticated;
grant update (room) on public.education_classes to authenticated;

commit;
