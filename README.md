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

For Modern Green login themes, apply
`supabase/platform-migrations/0011_login_theme_form_background.sql` and
`supabase/platform-migrations/0012_login_theme_background_visibility.sql` to
the separate Platform Admin database to enable separate form background
artwork, transparent form surfaces, and artwork visibility settings.

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
