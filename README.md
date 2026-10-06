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
