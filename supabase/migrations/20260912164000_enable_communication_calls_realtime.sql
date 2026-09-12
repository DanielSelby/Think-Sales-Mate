-- Enable incoming call events for Supabase Realtime.
-- This is safe to apply after the communication collaboration migrations.
do $$
begin
  alter publication supabase_realtime add table public.communication_calls;
exception
  when duplicate_object then null;
end
$$;
