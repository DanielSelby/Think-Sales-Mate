# SalesMate ERP

SalesMate ERP is a multi-tenant business application built with Next.js 16,
React, TypeScript, Tailwind CSS, and Supabase. Organizations can manage sales,
inventory, point of sale, purchasing, expenses, accounting, staff, and related
business workflows from one application.

## Main features

- **Organization and access management:** organization membership, role-based
  permissions, branch assignments, and organization settings.
- **Sales and POS:** sales entry and history, quotations, register sessions,
  cash drawer workflows, and customer orders.
- **Inventory and purchasing:** product catalog, categories, pricing, stock
  adjustments, transfers, branch requests, suppliers, purchases, and returns.
- **Finance:** expenses, accounting overview, journal entries, invoices, bank
  accounts, cash closing, and assets.
- **People and operations:** CRM, HRM, payroll, projects, approvals, internal
  communication, customer messaging, reports, audit, and fraud monitoring.

The available pages are not all equivalent in maturity. External integrations,
organization settings, and some provider-backed functionality may require
additional configuration. Use the application and its role/permission
configuration to determine which features are enabled for an organization.

## Global watermark

Platform Admins with **System Settings** access manage the screen-only watermark
under **Branding & Watermark Management**. The image and display settings are
stored centrally in Platform Supabase (`platform_settings.platform_watermark`)
and the dedicated image is kept in the existing `platform-assets` bucket.
Uploads accept PNG, SVG, and WebP files up to 2 MB; SVG uploads are sanitized.
ERP users receive the shared watermark on their next authenticated page load or
refresh. It is not included in printed pages or business-document exports.
The display can be set to a normal image or a subtle 3D perspective style.

Platform Admin can also set an optional **organization-wide access expiry**,
separate from each product subscription. Access remains available through the
selected UTC date; from the next UTC day, application pages and organization
actions are blocked until the date is renewed. Users see a warning during the
final seven days and an access-paused message after expiry. Apply
`supabase/platform-migrations/0017_organization_access_expiry.sql` to the
Platform Supabase project before deploying code that reads this field.

## Technology

- Next.js 16 App Router and React 18
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres with row-level security (RLS)
- Zustand for client-side application state
- Vitest for unit tests and ESLint with the Next.js core web vitals rules

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project for authenticated application use

## Local setup

1. Create a Supabase project and configure its Auth redirect URLs for your
   local and deployed application addresses.
2. Copy `.env.example` to `.env.local`.
3. Set at least these values in `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   SITE_URL=http://localhost:3000
   ```

   Keep secret keys private. Do not commit `.env.local` or service-role keys.
   Other environment variables in `.env.example` are for optional integrations.
   The AI Assistant uses the server-only `GEMINI_API_KEY` from Google AI
   Studio; `GEMINI_MODEL` optionally selects a supported Gemini model and
   defaults to `gemini-3.8-flash`. Set both in Vercel Environment Variables
   when deploying. The authenticated `GET /api/ai/config` check reports only
   whether the key is configured; it never returns the key. If Gemini reports
   that the model cannot be found, verify the running environment has the
   intended `GEMINI_MODEL` and that `GEMINI_API_KEY` is a Google AI Studio key
   with Gemini API access. Restart the local server after editing `.env.local`;
   for Vercel, update the project environment variable and redeploy. A
   configured-key check confirms only that a value exists, not that Google
   accepts the key or model. The Gemini integration uses the Interactions API.
   On the AI page, **Test Gemini connection** sends
   a minimal server-side test request and reports whether the deployed key and
   model work; it uses one normal AI request from the applicable usage limit.
4. Install packages and start the development server:

   ```sh
   npm ci
   npm run dev
   ```

5. Open `http://localhost:3000`. Sign up and follow the application flow to
   create or join an organization.

Database migrations are in `supabase/migrations/`. Apply them to the target
Supabase project in the intended order using the Supabase CLI or your normal
database deployment process. Do not assume that copying only the original core
migration creates the full schema required by the current application.

Customer order status emails use the configured Resend provider. Set
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` to enable delivery, and configure
`SITE_URL` or `NEXT_PUBLIC_SITE_URL` so each email can include a customer order
tracking link. The customer-ordering setting **Send Email Notifications**
controls these messages. Delivery results are recorded with the order
notifications; failed deliveries are logged and marked as failed.

To show a WhatsApp contact link on the customer storefront and checkout, apply
`supabase/migrations/20261023220000_customer_portal_whatsapp_contact.sql`.
Organizations can then configure their WhatsApp Business number and prefilled
chat message under **Settings → Company Information**. The number must include
its international country code.

The AI Assistant migration adds metadata-only usage events and atomic database
request limits (20 requests per user per hour and 300 requests per organization
per day). It does not store chat messages. Chat context exists only in the
current browser session and is sent to the authenticated server endpoint with
each request. The initial read-only business tools cover sales, inventory,
approved expenses, purchases, and organization-wide outstanding invoices. Each
tool is limited by the member's module and branch permissions; invoice balances
are unavailable to branch-scoped users because invoices do not have a branch
field. HR/payroll, cash-closing data, and write actions are not exposed to the
assistant.

### Organization registration approval

New workspaces remain unavailable until approved in Platform Admin. Apply
`supabase/migrations/20261006100000_organization_registration_approval.sql` to
the application database and
`supabase/migrations/20261006150000_registration_submission_idempotency.sql`
to the application database and
`supabase/platform-migrations/0004_organization_registration_approval.sql` to
the separate Platform Admin database. Platform Admins with platform-management
permission can review applications at `/platform-admin/registrations`, request
more information, and configure notification recipients. Email delivery uses
the configured Resend provider (`RESEND_API_KEY` and `RESEND_FROM_EMAIL`); a
comma-separated `PLATFORM_ADMIN_NOTIFICATION_EMAILS` environment variable can
be used as a fallback recipient list. Registration creation is serialized and
idempotent per owner: a repeated form submission reuses the existing pending
application rather than creating a duplicate organization. The form reports
submission progress, then confirms that the organization is pending review.
Registration attempts are atomically limited to three per account and ten per
trusted proxy IP in a rolling 24-hour window. IPs are HMAC-hashed before being
stored; set `REGISTRATION_RATE_LIMIT_SECRET` to use a dedicated hashing secret.

For organization-specific capacity limits and live Platform Admin alerts, also
apply `supabase/platform-migrations/0009_organization_limit_overrides.sql` and
`supabase/platform-migrations/0010_platform_notification_realtime.sql` to the
separate Platform Admin database. Blank per-organization user or branch limits
follow the assigned subscription plan; if the plan has no limit, the resource
is unlimited. The Platform Admin alert bell receives new platform notifications
through Supabase Realtime; administrators can enable its synthesized chime from
the bell menu after a browser interaction.
Apply `supabase/migrations/20261102160000_organization_capacity_reservations.sql`
to the application database before deploying capacity-checked member and branch
creation. The reservation RPC serializes concurrent additions and automatically
expires abandoned reservations. Reactivating a suspended member also reserves a
seat because active and invited members count against the configured limit.

For Modern Green login themes, apply
`supabase/platform-migrations/0011_login_theme_form_background.sql` and
`supabase/platform-migrations/0012_login_theme_background_visibility.sql` to
the separate Platform Admin database to enable separate form background
artwork, transparent form surfaces, and artwork visibility settings.

### Product subscriptions and entitlements

Product subscriptions are managed per organization in Platform Admin. Product
plans are derived from the product-entitling modules included in each
subscription plan; an organization can also have a manual product subscription
without a plan.

Before deploying the code that uses product subscriptions, apply
`supabase/platform-migrations/0014_product_entitlements.sql` to the separate
Platform Admin database, then apply
`supabase/migrations/20261102100000_product_entitlement_projection.sql` to the
application database. The Platform Admin migration backfills products and
subscriptions from existing feature grants. Verify that pending projection
events have synchronized before setting `PRODUCT_ENTITLEMENTS_ENFORCED=true`.
Keep it `false` until both migrations and the backfill are verified.

New organization registrations can request one or more published products.
The request is saved with the pending application and shown to Platform Admin
reviewers; it does not create a subscription, activate access, or trigger
billing. Product requests start with feature grants disabled, so approval alone
does not grant product access. Review approval, subscription activation, and
feature grants remain separate steps.

Apply `supabase/migrations/20261102140000_organization_product_requests.sql`
after the entitlement projection migration and before deploying the product
selection or add-on request flows. Owners of approved organizations can request
additional products from Settings > Products & Access. Platform Admin can mark
the request approved or declined; approval does not create a subscription or
grant product feature access. After approval, a billing administrator must
configure the product subscription in the organization subscription controls.
Approving or rejecting a new organization registration also resolves its initial
product requests in the application database transaction, preventing them from
appearing later as duplicate add-on requests.
Approved add-on requests remain approved while subscription activation is
pending; duplicate requests are prevented until the product becomes accessible.
Declined requests can be submitted again by the organization owner.
Organization owners can review current seat and branch usage against the
organization override or subscription-plan limits on the subscription status
page. Invited members and all configured branches count toward the same limits
used by capacity checks.
Platform Admin users with product-management permission can inspect pending
entitlement projections and retry failed events from the product catalog page.
The scheduled sync endpoint continues to retry due events automatically.

Platform Admin can manage display names, descriptions, and registration
availability for the currently integrated products at `/platform-admin/products`.
Unpublishing a product does not cancel subscriptions or revoke access. Adding a
new product still requires application routes, permission mappings, subscription
entitlement handling, and product feature configuration; catalog publication
alone does not integrate a new product.
Users with organization-management permission can explicitly synchronize
application organizations missing from Platform Admin without granting product
features or subscriptions. The organization details editor can update the
organization name and owner contact email; changing the contact email does not
change the owner's sign-in email.
See [docs/product-integration.md](./docs/product-integration.md) for the
integration checklist and rollout requirements.

Configure `PRODUCT_ENTITLEMENT_SYNC_SECRET` on the application and schedule
`GET /api/cron/product-entitlements` with the header
`Authorization: Bearer <secret>` to retry pending cross-database projections.
Schedule it with the hosting provider's cron facility; no scheduler is
configured by this repository. The endpoint returns `503` until its secret is
configured. Do not expose the secret in client-side environment variables.

Configure `PLATFORM_USAGE_SYNC_SECRET` and schedule
`GET /api/cron/platform-usage` with the header
`Authorization: Bearer <secret>`. This updates the Platform Admin AI usage
metrics and measured organization usage. Active users, branches, active
products, and customers are current counts. Orders, purchases, sales volume,
AI request counts, and monthly activity cover the rolling last 30 days.
The product count includes active ERP products and Restaurant menu items.
Monthly activity is the count of orders plus purchases; linked customer orders
are not double-counted, cancelled records are excluded, and ERP sales volume
accounts for refunds. Restaurant sales volume uses non-cancelled order totals.
The response lists skipped organization IDs when an application organization
has no matching Platform Admin organization record. API usage and storage are
not estimated.
The endpoint returns `503` until its secret is configured. Apply application migration
`20261102173000_platform_ai_usage_snapshot.sql` and Platform Admin migration
`0015_platform_ai_usage_snapshot.sql` before scheduling it. To include skipped
organization diagnostics, also apply Platform Admin migration
`0016_platform_usage_sync_diagnostics.sql` before deploying the updated sync
service.

For Restaurant POS payment-account selection and refund consistency, apply
`supabase/migrations/20261102110000_restaurant_pos_payment_access.sql` after
the Restaurant POS payment-account migration. It adds a role-checked
account-options RPC, enforces organization-matched payment accounts, and makes
local refunds use the original tender and bank account. Split-payment account
validation also covers the first tender when it receives a tip, even if its
payment amount is zero.

For Think Service & Repairs, configure `SERVICE_STATUS_NOTIFICATION_SECRET`
and schedule `GET /api/cron/service-status-notifications` with the header
`Authorization: Bearer <secret>`. This requires the Service Center migrations,
a provider configuration, and the organization-level setting enabled. No cron
scheduler is configured by this repository.

## Validation

Run these checks before submitting changes:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The GitHub Actions workflow at `.github/workflows/ci.yml` runs those checks on
pull requests and pushes to `main`. CI uses placeholder Supabase values to
compile the application; it does not connect to a live organization or
database.

Unit tests are located alongside the code they cover as `*.test.ts` files and
run with Vitest. Current tests cover organization super-admin detection and
branch/location access helpers. They are a foundation, not end-to-end coverage
of all screens or Supabase policies. Expand coverage for server actions,
database/RLS behavior, and user-facing flows as those areas are changed.

## Project structure

- `src/app/` — App Router pages, layouts, route handlers, and server actions.
- `src/components/` — reusable UI and feature components.
- `src/lib/` — access control, organization context, Supabase clients, and
  shared business logic.
- `src/types/` — application and database types.
- `supabase/migrations/` — schema and policy changes.

## Database types

The `db:types` script generates Supabase types from a linked project:

```sh
npm run db:types
```

It requires the Supabase CLI and a project link. Review the generated changes
before committing them.

## Deployment

Deploy using the hosting platform configured for the project (currently
Vercel-compatible). Configure the required environment variables in the
deployment environment and ensure Supabase Auth redirect URLs include the
production domain. Apply database migrations before enabling features that
depend on their schema.
