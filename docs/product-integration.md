# Integrating a Product

The product catalog currently manages the display name, description, and
registration availability of ThinkSales ERP, Restaurant, and Think Service &
Repairs. Publishing a
catalog entry only makes it selectable; it does not integrate a new product.
Product slugs are currently a compile-time union, and route access defaults to
ThinkSales ERP unless a route is explicitly classified. Do not add a product
by inserting a catalog row alone.

## Integration checklist

1. **Define the product identity**
   - Choose a permanent lowercase kebab-case slug. Do not reuse or rename a
     slug after subscriptions or entitlement events have been created.
   - Add the slug to `PlatformProductSlug` in
     `src/types/platform-database.ts` and the supported product list in
     `src/lib/supabase/platform-admin.ts`.
   - Add user-facing names and catalog records in an additive Platform Admin
     migration. Do not edit an already-applied migration.

2. **Map product features**
   - Add every module to `platform_product_features` in the migration.
   - Mark a module as product-entitling only if it should establish product
     access. Shared/integration modules must not independently entitle a
     product.
   - Preserve existing organization grants and role permissions. Product
     entitlement, module grants, role permissions, and branch scope remain
     separate checks.
   - Verify product-to-plan mappings are derived from the intended product
     modules and do not accidentally add a product to unrelated plans.

3. **Classify routes, APIs, and server actions**
   - Update `src/lib/product-entitlement-routes.ts` for page and API routes.
     Use the shared-product allowlist only where either product is sufficient;
     do not rely on the default ERP classification for new product routes.
   - Add permission-module mappings for server-action checks.
   - Inspect every server action, route handler, server component data loader,
     and RPC used by the product. Enforce entitlement and existing RBAC,
     organization, and branch authorization at the server boundary.
   - For product-specific operations on a shared route, pass the explicit
     product module to the shared permission helper.

4. **Wire product-facing UI**
   - Add the product to subscription status and any product-specific
     navigation or onboarding surfaces that are intentionally static.
   - Ensure onboarding only offers published products and only records a
     request. Registration approval, subscription activation, feature grants,
     and billing remain separate operations.
   - Confirm unpublishing hides new requests without revoking existing access.

5. **Add tests**
   - Unit-test subscription states: pending, trial, active, grace, suspended,
     expired, cancelled, and scheduled cancellation.
   - Test direct route and API access, action/RPC enforcement, both read and
     write paths, and shared routes.
   - Test role permission and tenant/branch isolation independently of product
     entitlement.
   - Test onboarding, add-on requests, plan compatibility, and unpublishing.
   - Run the focused tests, lint, typecheck, and `git diff --check`.

6. **Migrate and roll out safely**
   - Apply and verify the Platform Admin catalog/entitlement migration and the
     application entitlement-projection and product-assignment migrations in
     a non-production environment first.
   - Verify legacy-grant compatibility and outbox projection/reconciliation.
   - The Organization Product Hub and middleware route gates always require
     valid organization entitlements and explicit employee assignments; apply
     the migrations before deploying. Organization administrators can assign
     existing employees after deployment; until assigned, non-administrators
     are denied access to product routes.
   - `PRODUCT_ENTITLEMENTS_ENFORCED` controls additional module-permission
     checks. Enable it after the entitlement projection is verified.
   - Never apply migrations or enable enforcement in production without
     explicit deployment approval.

## Current integration seams

- `src/types/platform-database.ts`: product slug type and Platform Admin schema.
- `src/lib/supabase/platform-admin.ts`: supported products, catalog reads,
  organization synchronization, and product-to-module checks.
- `src/lib/product-entitlement-routes.ts`: route/API and permission-module
  classification.
- `src/lib/product-entitlements.ts` and
  `src/lib/supabase/product-entitlements.ts`: policy and server-side
  entitlement resolution.
- `src/app/platform-admin/actions.ts`: supported product validation and
  subscription administration.
- `src/app/(dashboard)/subscription-status/page.tsx`: product status display.
- `src/app/(hub)/product-hub/page.tsx`: dynamically loaded organization product
  hub and server-side entitlement/assignment filtering.
- `src/app/(dashboard)/settings/organization/actions.ts` and
  `supabase/migrations/20261107100000_organization_product_access_assignments.sql`:
  owner-managed employee assignments, RLS, and audit history.
- `src/lib/organizations/capacity.ts`: shared seat and branch limit enforcement;
  owners can review these current organization-wide limits and usage on the
  subscription status page. Member and branch creation reserves capacity
  transactionally to prevent concurrent requests from exceeding a configured
  limit, and reactivating a suspended member reserves a seat; deploy
  `20261102160000_organization_capacity_reservations.sql` first.
- `supabase/platform-migrations/0014_product_entitlements.sql`: current
  product, feature, plan, subscription, and outbox schema/seeds.
- `supabase/platform-migrations/0017_organization_access_expiry.sql`:
  optional Platform Admin–controlled organization-wide access expiry, separate
  from product subscriptions. Apply this migration to Platform Supabase before
  deploying code that reads the new column. The date remains valid through its
  UTC calendar day; access is blocked from the following UTC day until renewed.
  Expiry blocks application access without changing organization status or
  deleting organization data.
- `supabase/platform-migrations/0018_think_service_repairs_product.sql` and
  `supabase/migrations/20261104100000_think_service_repairs_core.sql`:
  register the unpublished Think Service & Repairs product and its initial
  branch-scoped service schema. Apply platform migration
  `0019_publish_think_service_repairs.sql` after `0018` to publish the catalog
  entry so it can be subscribed to per organization in Platform Admin. The
  subscription can be activated manually without a product plan. Apply the
  application migration below to the organization database to enable the
  service product itself. The current application workflow supports
  service-job intake with recorded arrival condition, included accessories,
  and acknowledgment by the customer or an authorized representative, plus
  status transitions, customer equipment registration,
  technician registration, optional equipment/technician assignment, and
  appointment scheduling with technician-overlap protection and status history.
  Equipment records can include warranty provider, reference, coverage dates,
  and terms. Coverage status is shown on equipment and linked repair jobs;
  warranty dates are optional, but when supplied both dates are required and
  the end date cannot precede the start date.
  It also supports versioned repair estimates, itemized totals and tax, recording
  when an estimate is sent, and recording the customer's decision with an audit
  note. Staff may explicitly send an estimate using a configured customer
  messaging provider. The message includes a per-estimate secure portal link
  that expires after 30 days; customers can review repair status and estimate
  details, then approve or decline once. Only a SHA-256 token hash is stored,
  responses update estimate and job history atomically, and message history
  does not retain the bearer link. The portal does not require an account;
  anyone with the link can view its scoped repair details. Estimate delivery
  remains staff-triggered. Automatic repair status messages are disabled by
  default and can be enabled by a settings editor. Intake records affirmative
  customer consent separately for WhatsApp, SMS, and email; a notification is
  sent only when the customer's preferred channel is both consented for that
  repair and not opted out in message preferences. There is no channel fallback.
  Only received, awaiting-customer-approval, in-progress, awaiting-parts,
  ready-for-collection, and awaiting-payment changes are eligible. The worker
  skips stale statuses, disabled organizations, missing consent, missing
  recipients, and unconfigured providers. Delivery attempts are written to
  message history and are not automatically retried, to avoid duplicate sends.
  Service staff with inventory
  edit permission can issue stock-tracked products to an approved repair job
  from that job's branch inventory, and record unused-part returns against the
  original issue. These inventory changes are atomic and appear in the repair
  movement history. Staff can also keep an append-only, branch-scoped customer
  contact log for each repair job, recording direction, method, outcome, and
  notes. Staff can prepare a status-based customer update and either copy it
  to their normal messaging app and log it manually, or explicitly send it
  through the configured SMS, WhatsApp, or email provider. Direct sends check
  the customer's channel preferences, record delivery status and provider in
  messaging history, and add an entry to the repair contact log. Direct delivery
  requires a configured provider and may incur provider charges; failed sends
  are surfaced and logged. Staff with appointment-edit permission can also
  prepare and send a reminder for a scheduled or confirmed future appointment;
  reminders are never sent automatically. The service
  reports page shows exact current job counts by
  status, jobs received during a selected date range, and appointment counts
  by status for that period when the user has appointment-view permission.
  It also shows jobs closed and average intake-to-closure time; accounting-view
  users can see repair payments collected by method, inventory-view users can
  see issued/returned parts and their net inventory cost, and service-technician
  viewers can see the selected-period workload by current assignment. Report
  queries respect branch scope and paginate all matching rows rather than
  silently truncating totals.
  At collection, staff can issue an Accounts Receivable invoice from the
  approved estimate. Repair invoices support branch-scoped partial payments,
  payment history, and printable per-payment receipts; the job completes only
  when the invoice is fully paid. Staff can then record a branch-scoped device
  handover with the recipient, release condition, returned accessories, and
  customer acknowledgment; this closes the job and adds status history. Direct
  status changes cannot mark a job paid or handed over. An unpaid invoice can
  be voided to return the job to the collection-ready state, while an invoice
  with recorded payments cannot be voided. Repair payment recording is
  separate from the generic customer-credit ledger and does not create bank
  deposits or process online payments. A warranty follow-up can be opened only
  from a handed-over repair for the same customer, branch, and equipment.
  The claim must be reviewed before work proceeds beyond inspection. Staff
  record a covered/not-covered decision and reason; covered claims follow a
  no-customer-charge repair path and require handover but no invoice. Non-covered
  claims continue through the estimate and payment workflow. Dates and stored
  warranty terms are context for the staff decision, not an automatic coverage
  determination. The core schema is in the unapplied service migration;
  secure customer portal links and response procedures are in the additive
  `20261105192000_service_repair_customer_portal.sql` migration. Portal links
  also show the latest 50 repair status changes without exposing internal staff
  notes; this is added by `20261105213500_service_repair_portal_timeline.sql`.
  Automatic repair status messages require the
  `20261105220000_service_status_notification_outbox.sql` migration, a configured
  provider, and a scheduled authenticated request to
  `/api/cron/service-status-notifications` using
  `SERVICE_STATUS_NOTIFICATION_SECRET`.
  The automatic estimate-ready update asks customers to contact the service
  team; it does not contain a customer portal link. Delivery attempts are
  one-shot to avoid duplicate messages. If a worker stops while an outbox item
  is `processing`, verify the provider's delivery status before taking any
  manual action; do not reset it to `pending` without confirming it was not sent.
  Configure `SITE_URL` or `NEXT_PUBLIC_SITE_URL` to the production HTTPS
  origin before sending estimate links. Keep the product unpublished and do
  not apply these migrations or deploy until the remaining product workflows,
  authorization tests, and rollout checks are complete.

Review the current code and migration heads before following this checklist;
the listed files may evolve as product integration becomes more data-driven.

Platform Admin users with organization-management permission can reconcile
missing application organization records from the Organizations page. This
creates only the Platform Admin organization record; it does not activate a
subscription or grant product features. Organization business details allow
editing the organization name and owner contact email. The email is Platform
Admin contact metadata and does not change the owner's authentication email.

## Platform usage snapshots

The scheduled `GET /api/cron/platform-usage` endpoint reports current counts
for active users, branches, active products, and customers, plus rolling
30-day orders, purchases, sales volume, AI requests, and monthly activity.
The product count includes active ERP products and Restaurant menu items.
Monthly activity is the count of orders plus purchases. Linked customer orders
are excluded from order counts when their sale is counted; cancelled orders
are excluded. ERP sales volume accounts for refunds; Restaurant sales volume
uses non-cancelled, non-pending-payment order totals. API usage and storage
are not estimated without reliable source data. The endpoint response lists
skipped organization IDs when no corresponding Platform Admin organization
record exists; this requires Platform Admin migration
`0016_platform_usage_sync_diagnostics.sql`. Configure the server-only
`PLATFORM_USAGE_SYNC_SECRET` and schedule the endpoint with
`Authorization: Bearer <secret>`. Apply application migration
`20261102173000_platform_ai_usage_snapshot.sql` and Platform Admin migration
`0015_platform_ai_usage_snapshot.sql` before enabling the scheduler. Apply
`0016_platform_usage_sync_diagnostics.sql` before deploying the diagnostic
response code. No scheduler is configured by this repository.
