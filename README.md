# ElonHub OS

Elon Hub's internal operating system — Phase 1 foundation. See the
[ElonHub OS spec](https://claude.ai/code/artifact/8b45cb15-bcf9-453a-af76-0f5f8a66e97d)
for the full product spec, roadmap, and RBAC matrix this build implements.

## What's here (foundation phase)

- **Auth** — Supabase email/password, session refresh via `src/proxy.ts`.
- **RBAC** — 10 roles (`app_role` enum), enforced with Postgres row-level
  security in `supabase/migrations/0002_rls.sql`, not just in the UI.
- **Schema** — the full core data model (`supabase/migrations/0001_init.sql`):
  organisations, profiles, customers, contacts, leads, opportunities,
  services, quotes, sales orders, projects, tasks, time entries, invoices,
  payments, audit log.
- **Audit log** — every write to customers/leads/opportunities/quotes/
  invoices/payments/projects is recorded automatically via trigger.
- **Dashboard** — the four-row executive view (Financial/Sales/Projects/
  Customers), reading live from the database.
- **Team** — lists everyone in the workspace; a `super_admin` can change
  roles from here (guarded server-side against self-escalation).

CRM, Projects, Finance and Support have nav entries but no screens yet —
that's Phase 2. The schema for all of it already exists.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your Supabase
   project's URL and anon key (Project Settings → API).
2. Apply the migrations in `supabase/migrations/` to that project, in
   order (Supabase dashboard → SQL Editor, or `supabase db push` with the
   CLI linked to the project).
3. `npm install && npm run dev`
4. Sign up at `/signup` — the first account becomes `super_admin`.
5. Sign in and open **Settings** to set the VAT number, letterhead and
   banking details. Until a VAT number is saved, every document titled
   "Tax Invoice" prints without one and is not valid under section 20(4)
   of the VAT Act. Migration `0009_org_identity.sql` adds those columns;
   until it is applied the app falls back to the constants in
   `src/lib/company.ts` and the Settings form reports what is missing.

## Verifying a release

`npm test` and `npx next build` stop at the database and the server/client
boundary — every production failure found so far was invisible to both.
`docs/END_TO_END_WALKTHROUGH.md` walks lead to receipt against real data with
the exact figures each step should produce. Run it after any change to money,
quoting, invoicing or payments.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres +
Auth), deployed on Vercel.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Supabase project URL. Public by design. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Anon key. Public by design; RLS is what protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel only, **never** `NEXT_PUBLIC_` | Required only by Team -> Add a team member, which creates auth users. |

### About the service-role key

This key **bypasses Row Level Security on every table**. Every policy in
`0002_rls.sql`, `0005` and `0007` is inert for requests made with it.

* It is read only by `src/lib/supabase/admin.ts`, which is imported by exactly
  one module: `src/app/dashboard/team/actions.ts`.
* It must never be imported from a client component, or from any module a
  client component imports, or it ends up in the browser bundle.
* The missing `NEXT_PUBLIC_` prefix is load-bearing: Next only inlines
  variables carrying that prefix into client bundles.

Find it in the Supabase dashboard under **Project settings -> API -> service_role**.
Without it, everything works except adding team members, which reports that the
key is missing.
