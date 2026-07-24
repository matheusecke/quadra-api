# Module: Teams (`TeamsModule`)

Team lifecycle management. Teams are affiliated to organizations through `OrganizationTeamAffiliation`; this module manages the team entity itself and is system-admin-gated for all writes.

## Endpoints

| Method  | Path                  | Guards                                     | Purpose |
| ------- | --------------------- | ------------------------------------------ | ------- |
| `POST`  | `/teams`              | `JwtAuthGuard`, `SystemAdminGuard`         | Create team; requires `name` and `shortName`; auto-generates slug from name |
| `GET`   | `/teams`              | `JwtAuthGuard`                             | Paginated list; filters: `q` (name search), `status` |
| `GET`   | `/teams/:id`          | `JwtAuthGuard`                             | Get by id |
| `PATCH` | `/teams/:id`          | `JwtAuthGuard`, `SystemAdminGuard`         | Update name; re-generates slug on rename |
| `PATCH` | `/teams/:id/status`   | `JwtAuthGuard`, `SystemAdminGuard`         | Update status; system admin only |
| `DELETE`| `/teams/:id`          | `JwtAuthGuard`, `SystemAdminGuard`         | Soft delete; sets `isDeleted: true` + `status: INACTIVE` |

`GET /teams` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Rules

- **Read** (list / get): any authenticated user.
- **All writes** (create, update, update status, delete): system admin only — no role-based exceptions.

## Slug behavior

- Auto-generated from the team name: lowercased, diacritics stripped, spaces converted to hyphens, non-alphanumeric characters removed.
- Re-generated whenever the name is updated via `PATCH /teams/:id`.
- Must be unique among non-deleted teams. A conflict returns `409 DUPLICATE_RECORD`.
- Utility: `src/common/utils/slugify.ts`.

## Soft-delete behavior

- Sets `isDeleted: true` and `status: INACTIVE` on the team record.
- Does **not** revoke refresh tokens — `RefreshToken` has no `teamId` field.
- Soft-deleted teams are excluded from list/get queries by default.
