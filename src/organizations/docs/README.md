# Module: Organizations (`OrganizationsModule`)

Tenant lifecycle management. Organizations are the top-level multi-tenant boundary; users and teams are affiliated through separate affiliation tables.

## Endpoints

| Method  | Path                        | Guards                                     | Purpose |
| ------- | --------------------------- | ------------------------------------------ | ------- |
| `POST`  | `/organizations`            | `JwtAuthGuard`, `SystemAdminGuard`         | Create organization; auto-generates slug from name |
| `GET`   | `/organizations`            | `JwtAuthGuard`, `SystemAdminGuard`         | Paginated list; filters: `q` (name search), `status` |
| `GET`   | `/organizations/:id`        | `JwtAuthGuard`, `SystemAdminGuard`         | Get by id |
| `PATCH` | `/organizations/:id`        | `JwtAuthGuard`                             | Update name; service enforces permission check (see Rules) |
| `PATCH` | `/organizations/:id/status` | `JwtAuthGuard`, `SystemAdminGuard`         | Update status; system admin only |
| `DELETE`| `/organizations/:id`        | `JwtAuthGuard`, `SystemAdminGuard`         | Soft delete; sets `isDeleted: true` + `status: INACTIVE`; revokes org refresh tokens |

`GET /organizations` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Rules

- **Read** (list / get): system admin only.
- **Create**, **delete**, **update status**: system admin only.
- **Update name** (`PATCH /organizations/:id`): system admin OR an `ORG_ADMIN` whose JWT `organizationId` matches the organization being updated. Any other caller receives `403 Forbidden`.

## Slug behavior

- Auto-generated from the organization name: lowercased, diacritics stripped, spaces converted to hyphens, non-alphanumeric characters removed.
- Re-generated whenever the name is updated via `PATCH /organizations/:id`.
- Must be unique among non-deleted organizations. A conflict returns `409 DUPLICATE_RECORD`.
- Utility: `src/common/utils/slugify.ts`.

## Soft-delete behavior

- Sets `isDeleted: true` and `status: INACTIVE` on the organization record.
- Revokes **all active refresh tokens** whose `organizationId` matches the deleted organization, executed in the same database transaction.
- Soft-deleted organizations are excluded from list/get queries by default.
