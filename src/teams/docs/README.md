# Module: Teams (`TeamsModule`)

Team lifecycle management. Teams are affiliated to organizations through `OrganizationTeamAffiliation`; this module manages the team entity itself and is system-admin-gated for all writes.

## Endpoints

| Method   | Path                | Guards                                          | Purpose                                                                                              |
| -------- | ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST`   | `/teams`            | `JwtAuthGuard`, `SystemAdminGuard`              | Create team; requires `name` and `shortName`; auto-generates slug from name                          |
| `GET`    | `/teams`            | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated catalog scoped to the active JWT organization; filters: `q` (name search), `ids`, `status` |
| `GET`    | `/teams/:id`        | `JwtAuthGuard`                                  | Get by id                                                                                            |
| `PATCH`  | `/teams/:id`        | `JwtAuthGuard`, `SystemAdminGuard`              | Update name; re-generates slug on rename                                                             |
| `PATCH`  | `/teams/:id/status` | `JwtAuthGuard`, `SystemAdminGuard`              | Update status; system admin only                                                                     |
| `DELETE` | `/teams/:id`        | `JwtAuthGuard`, `SystemAdminGuard`              | Soft delete; sets `isDeleted: true` + `status: INACTIVE`                                             |

`GET /teams` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Rules

- **`GET /teams`**: tenant-scoped catalog. A team qualifies when it has a non-deleted, `ACTIVE` `OrganizationTeamAffiliation` in the JWT's active organization. Requires an active org context (`OrgRoleGuard`); a token without one, including a platform-admin token, gets `403`. Ordering: `name ASC`, then `id ASC`. Response includes `city`/`state` (nullable). The old `organizationId` query parameter is removed — organization scope comes only from the JWT.
- **Get by id** (`GET /teams/:id`): any authenticated user, no tenant scoping (global lookup).
- **All writes** (create, update, update status, delete): system admin only — no role-based exceptions.

## Known temporary regression

The former cross-tenant admin consumer of `GET /teams` (system-admin listing across all organizations via an explicit `organizationId` query param) is intentionally unsupported until platform-admin routes move to `/admin/*`.

## Slug behavior

- Auto-generated from the team name: lowercased, diacritics stripped, spaces converted to hyphens, non-alphanumeric characters removed.
- Re-generated whenever the name is updated via `PATCH /teams/:id`.
- Must be unique among non-deleted teams. A conflict returns `409 DUPLICATE_RECORD`.
- Utility: `src/common/utils/slugify.ts`.

## Soft-delete behavior

- Sets `isDeleted: true` and `status: INACTIVE` on the team record.
- Does **not** revoke refresh tokens — `RefreshToken` has no `teamId` field.
- Soft-deleted teams are excluded from list/get queries by default.
