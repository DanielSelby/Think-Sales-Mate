-- Support the stock-request history activity, notification, and audit views.
-- The workflow reuses the existing notifications and audit_logs tables.

create index if not exists idx_audit_logs_stock_requests
  on public.audit_logs (org_id, entity_id, created_at desc)
  where entity_type = 'stock_request';

create index if not exists idx_notifications_stock_requests
  on public.notifications (org_id, entity_id, created_at desc)
  where entity_type = 'stock_requests';

create index if not exists idx_stock_request_timeline_request_created
  on public.stock_request_timeline (request_id, created_at desc);

create index if not exists idx_stock_request_approvals_request_created
  on public.stock_request_approvals (request_id, created_at desc);
