begin;

alter function public.create_pos_sale_header(
  uuid, uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, date
) security definer;

alter function public.create_pos_sale_header(
  uuid, uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, date
) set search_path = public;

revoke all on function public.create_pos_sale_header(
  uuid, uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, date
) from public, anon;
grant execute on function public.create_pos_sale_header(
  uuid, uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, date
) to authenticated;

commit;
