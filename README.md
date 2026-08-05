# SalesMate ERP — Core Scaffold

This is the **foundation layer** for SalesMate: multi-tenant auth, organizations,
role-based access control, and the dashboard shell that every module (POS,
Sales, Inventory, CRM, HRM, Accounting, Banking, ...) will plug into.

It does **not** include those business modules yet — building a full ERP is a
multi-month effort. What's here is meant to be a correct, working base you
extend module by module, not a demo.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS**, hand-rolled UI primitives (button/card/input) in the
  shadcn style — no compiler dependency
- **Supabase**: Postgres + Auth + Row-Level Security for multi-tenancy
- **Zustand** for client UI state (sidebar collapse, active org)
- Deploy target: **Vercel**

## What's included

- Email/password sign-up and sign-in, with email confirmation
- Organization ("workspace") creation on first login
- Multi-tenant Postgres schema with RLS: `organizations`, `organization_members`,
  `profiles`, `audit_logs` — see `supabase/migrations/0001_core_schema.sql`
- Role hierarchy: `owner > admin > manager > staff > viewer`, enforced both in
  Postgres RLS policies and in the app layer (`src/lib/rbac`)
- Org switcher (for users who belong to more than one workspace)
- Team management page: invite by email, change roles, remove members
- Dashboard shell with sidebar navigation for every planned module — modules
  not yet built are shown locked rather than broken links
- Executive dashboard page in an honest zero-state (no fake demo numbers) so
  it's obvious what's real once you're live

## Setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/0001_core_schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in your project's URL, anon
   key, and service role key (Project Settings → API).
4. `npm install`
5. `npm run dev` — visit `http://localhost:3000`, sign up, confirm your email,
   and create your first workspace.

## Deploying

Push to GitHub, import into Vercel, and set the same three environment
variables in the Vercel project settings. Add your Vercel domain to
Supabase's **Auth → URL Configuration → Redirect URLs** as
`https://your-domain.vercel.app/auth/callback`.

## Extending with a new module

Each module should follow the same pattern as `settings/organization`:

1. A route under `src/app/(dashboard)/<module>/page.tsx`, gated by the
   `(dashboard)` layout (already requires an active org).
2. A migration adding that module's tables, always with an `org_id` column
   and RLS policies using `public.is_org_member(org_id)` /
   `public.has_org_role(org_id, 'role')` from the core migration.
3. Capabilities added to `CAPABILITIES` in `src/lib/rbac/index.ts` so access
   is checked the same way everywhere.
4. Flip that module's `status` from `"soon"` to `"live"` in
   `src/components/nav/sidebar.tsx`.
5. Writes that matter for audit go into `audit_logs` via a small helper —
   worth adding once the second module lands.

## Suggested build order

Sales/Inventory (they share the same tenant data and unlock POS) →
Accounting (needs Sales as its transaction source) → CRM → HRM/Payroll →
Banking/Assets/Projects → Reports (reads across everything above) →
AI Assistant (needs real data in the other modules to be useful) →
Super Admin Portal.
