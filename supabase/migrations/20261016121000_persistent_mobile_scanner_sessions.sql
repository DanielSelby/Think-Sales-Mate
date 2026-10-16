alter table public.pos_mobile_scanner_sessions
  alter column expires_at drop not null;

update public.pos_mobile_scanner_sessions
set expires_at = null
where revoked_at is null;
