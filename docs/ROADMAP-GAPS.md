# Roadmap and known gaps

What is **not** implemented yet and sensible next increments. Use together with domain context in the parent repo (`../TCC.md`). Project-wide `docs/` file; for documentation placement conventions see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Not in this codebase yet

- Platform admin routes outside user management (e.g. `/admin/organizations`).
- Dedicated audit logging module (DB triggers/functions pattern is described in [DATABASE.md](./DATABASE.md) as future work).
- Championship, match, and statistics modules (not in Prisma schema yet).

## Completed

- **Organizations and teams CRUD** — full lifecycle with slug, soft delete, and system-admin guards.
- **Affiliation APIs** — `OrganizationTeamAffiliationsModule` and `OrganizationUserAffiliationsModule` implement the full invite/accept/reject flow with token-based handshake, role/team constraints, resend, status override, and soft delete. Auth is scoped to ACTIVE affiliations.

## Natural next blocks

1. **Platform admin APIs** — e.g. `POST /admin/organizations`, lifecycle for orgs aligned with `TCC.md`.
2. **Org-scoped endpoints** — e.g. roster views, team roster under org.
3. **Sports domain** — reintroduce tournaments, matches, statistics after the tenant and membership layer is stable.

## CI and lint follow-ups

- **Revisit type-aware lint in CI** — the current strict lint setup reports many `@typescript-eslint/no-unsafe-*` issues in unit specs because Jest/Prisma mocks are intentionally partial. For now, keep the pipeline focused on the selected validation steps. Later, evaluate whether to reintroduce lint in CI with strong unsafe rules for production API code and a narrower override for `*.spec.ts` / `test/**/*.ts`.

## Migrations

Schema evolution and DB-only SQL workflow are defined in [DATABASE.md](./DATABASE.md). Repository policy for agents: never run `prisma migrate *` in automation; see root `CLAUDE.md`.
