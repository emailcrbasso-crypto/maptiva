# CLAUDE.md

## Project overview

Maptiva is a multi-tenant SaaS for running 180-degree, 360-degree, and custom feedback/assessment cycles for companies and consulting firms.

The product must support:
- multiple tenants;
- reusable assessment templates;
- configurable methods (180, 360, custom);
- evaluator assignments with role-based relationships;
- anonymous feedback with N-minimum rules;
- dashboard and progress tracking;
- PDF and spreadsheet exports;
- an analytics layer that will later integrate with Maptiva Grid, a separate Nine Box SaaS.

Maptiva Grid is a separate future product. Do not couple the core Maptiva app to Nine Box screens or workflows. Instead, prepare analytics and exports so Grid can consume consolidated scores later.

## Product goals

The main goal is to replace spreadsheet-based evaluation operations with a structured SaaS that is secure, configurable, and scalable across clients.

This repository should prioritize:
1. solid domain modeling;
2. multi-tenant isolation;
3. predictable reporting data;
4. clean modular architecture;
5. implementation by phases instead of trying to build everything at once.

## Core domain rules

- The platform is multi-tenant by design.
- Every business table must include `tenant_id`.
- 180, 360, and custom are configuration presets, not separate applications.
- Templates are the reusable core; cycles are executions of templates.
- Reports and exports must read from consolidated analytics/snapshots, not directly from raw responses.
- `self` and `manager` may be shown separately depending on template rules.
- Anonymous groups under the N-minimum threshold must be merged or hidden according to policy.
- Peer/subordinate comments must never expose evaluator identity.
- Maptiva Grid is a separate SaaS and should consume exported or API-delivered consolidated data only.

## Preferred stack

Current preferred stack:
- React + TypeScript
- Tailwind CSS
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Vercel
- `@react-pdf/renderer`
- `html2canvas`
- `xlsx` / SheetJS
- `recharts`

If the codebase later adopts Next.js instead of Vite, keep the same domain architecture and module separation.

## Working style

Always work in phases.

Before implementing a large feature:
1. read the relevant docs in `/docs`;
2. propose a short plan;
3. identify impacted files;
4. implement the smallest coherent slice;
5. validate before moving on.

For complex features touching more than 3 files, prefer planning first.

Do not generate large speculative systems without reading existing project docs.

## Repository map

Important folders:

- `/docs/prd/` → product vision, MVP scope, user flows, roadmap
- `/docs/architecture/` → system architecture, data model, multi-tenant rules, RLS rules
- `/docs/modules/` → module-specific specs
- `/docs/decisions/` → architecture decision records
- `/prompts/` → reusable implementation prompts
- `/supabase/migrations/` → SQL migrations
- `/supabase/seed.sql` → seed data
- `/apps/` or `/src/` → application code

Always check docs before introducing new architecture patterns.

## Implementation priorities

Build in this order unless the docs explicitly change it:

1. tenant and membership model
2. authentication and authorization
3. templates and assessment methods
4. cycles
5. participants
6. evaluator assignments / magic links
7. questionnaires and responses
8. scoring engine
9. analytics snapshots
10. reports and exports
11. integrations for future Maptiva Grid compatibility

## Code conventions

- Use TypeScript everywhere possible.
- Prefer small focused modules over large files.
- Keep domain logic out of UI components.
- Separate:
  - data access,
  - business rules,
  - UI rendering,
  - report/export generation.
- Avoid duplicating business rules in frontend and backend.
- Prefer explicit types over `any`.
- Keep naming consistent with the business domain.

## Database conventions

- All core business tables must include `tenant_id`.
- Use UUID primary keys.
- Add timestamps to important tables.
- Keep migration files small and reviewable.
- Never expose service role credentials to the frontend.
- Use RLS for tenant isolation and role-based access.

## Reporting and analytics rules

- Raw responses are not the final reporting source.
- Create consolidated score snapshots for reporting.
- Keep reporting logic deterministic and reproducible.
- Prepare dimension-based scores so future Grid integrations can use them.
- Exports must support future consumption by Maptiva Grid without requiring raw answer access.

## Security rules

- Never put secrets in committed files.
- Keep real credentials out of `CLAUDE.md`.
- Use `.env.example` for documented environment variables.
- Service role keys must only be used in secure server-side contexts or Supabase Edge Functions.
- Magic links must be single-use or strongly controlled according to assignment status.

## What to avoid

- Do not hardcode the platform as “360 only”.
- Do not mix Nine Box UI into the Maptiva core product.
- Do not create reports directly from raw tables if analytics snapshots are expected.
- Do not bypass tenant isolation for convenience.
- Do not invent undocumented domain rules when docs already define them.

## When in doubt

If requirements are unclear:
1. inspect `/docs`;
2. summarize the ambiguity;
3. propose 1–2 implementation options;
4. choose the safest path that preserves modularity and multi-tenant design.