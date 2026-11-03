# Integrating a Product

The product catalog currently manages the display name, description, and
registration availability of ThinkSales ERP and Restaurant. Publishing a
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
   - Add an additive Platform Admin migration for the catalog and feature
     mappings. Add an application migration only if the product requires new
     projection or data/RLS objects.
   - Apply and verify migrations in a non-production environment first.
   - Verify legacy-grant compatibility and outbox projection/reconciliation.
   - Keep `PRODUCT_ENTITLEMENTS_ENFORCED=false` until the migrations,
     backfill, and synchronization are verified and rollout is approved.
     Never apply migrations or enable enforcement in production without
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
- `src/lib/organizations/capacity.ts`: shared seat and branch limit enforcement;
  owners can review these current organization-wide limits and usage on the
  subscription status page. Member and branch creation reserves capacity
  transactionally to prevent concurrent requests from exceeding a configured
  limit, and reactivating a suspended member reserves a seat; deploy
  `20261102160000_organization_capacity_reservations.sql` first.
- `supabase/platform-migrations/0014_product_entitlements.sql`: current
  product, feature, plan, subscription, and outbox schema/seeds.

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
