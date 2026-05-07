# Roadmap and known gaps

What is **not** implemented yet and sensible next increments. Use together with domain context in the parent repo (`../TCC.md`). Project-wide `docs/` file; for documentation placement conventions see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Not in this codebase yet

- Full CRUD for `organizations`, `teams`, and public/admin flows for affiliations (beyond what auth needs internally).
- Platform admin routes outside user management (e.g. `/admin/organizations`).
- Org-scoped business APIs (e.g. teams under an org) beyond auth’s org selection.
- Dedicated audit logging module (DB triggers/functions pattern is described in [DATABASE.md](./DATABASE.md) as future work).
- Championship, match, and statistics modules (not in Prisma schema yet).

## Natural next blocks

1. **Platform admin APIs** — e.g. `POST /admin/organizations`, lifecycle for orgs aligned with `TCC.md`.
2. **Organizations and teams CRUD** — create, read, update, deactivate; respect multi-tenant rules.
3. **Org-scoped endpoints** — e.g. teams under `organizations/:orgId`, protected with `JwtAuthGuard` + `OrgRoleGuard`.
4. **Affiliation APIs** — add/remove users and teams; enforce consistency with DB constraints documented in [DATABASE.md](./DATABASE.md); roster/coach views should use these, not raw `/users` list semantics.
5. **Sports domain** — reintroduce tournaments, matches, statistics after the tenant and membership layer is stable.

## Migrations

Schema evolution and DB-only SQL workflow are defined in [DATABASE.md](./DATABASE.md). Repository policy for agents: never run `prisma migrate *` in automation; see root `CLAUDE.md`.
