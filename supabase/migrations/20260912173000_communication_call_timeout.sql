-- Atomically expire an unanswered call so only one recipient can transition
-- a ringing call to unanswered.
create or replace function public.expire_communication_call(p_call_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed boolean;
begin
  update public.communication_calls
  set ended_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'status', 'unanswered',
        'unanswered_at', now()
      )
  where id = p_call_id
    and ended_at is null
    and coalesce(metadata ->> 'status', 'ringing') = 'ringing'
    and started_at <= now() - interval '30 seconds'
    and public.is_org_member(org_id);
  changed := found;
  return changed;
end;
$$;
