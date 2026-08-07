# Module: Teams (`TeamsModule`)

Team lifecycle management. Teams are affiliated to organizations through `OrganizationTeamAffiliation`; this module manages the team entity itself and is system-admin-gated for all writes.

## Endpoints

| Method   | Path                | Guards                                          | Purpose                                                                                              |
| -------- | ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST`   | `/teams`            | `JwtAuthGuard`, `SystemAdminGuard`              | Create team; requires `name` and `shortName`; auto-generates slug from name                          |
| `GET`    | `/teams`            | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated catalog scoped to the active JWT organization; filters: `q` (name search), `ids`, `status` |
| `GET`    | `/teams/:id`        | `JwtAuthGuard`                                  | Authenticated global lookup by id                                                                     |
| `GET` | `/teams/:id/summary` | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Team identity, all valid titles, and organization-scoped historical averages |
| `GET` | `/teams/:id/matches` | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated `upcoming` or `history` matches; `scope` is required |
| `GET` | `/teams/:id/tournaments` | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated tournament participations and per-participation averages |
| `PATCH`  | `/teams/:id`        | `JwtAuthGuard`, `SystemAdminGuard`              | Update name; re-generates slug on rename                                                             |
| `PATCH`  | `/teams/:id/status` | `JwtAuthGuard`, `SystemAdminGuard`              | Update status; system admin only                                                                     |
| `DELETE` | `/teams/:id`        | `JwtAuthGuard`, `SystemAdminGuard`              | Soft delete; sets `isDeleted: true` + `status: INACTIVE`                                             |

`GET /teams` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Team profile reads

The three `/teams/:id/*` profile reads take the active organization only from
the JWT. A team is visible when it is non-deleted and has either a live active
organization affiliation or a non-deleted tournament participation in that
organization. Missing, deleted, and organization-invisible ids all return the
same `404 Team not found` response. The original `GET /teams/:id` route remains
an authenticated global lookup and is unchanged.

`summary` returns current global identity, every valid completed title, and
historical statistics. Contextual status is `INACTIVE` for an inactive global
team, otherwise `ACTIVE` with a live affiliation or `HISTORICAL` with history
only. Titles use `startsAt DESC NULLS LAST`, then `id DESC`.

`matches` requires `scope=upcoming|history`. Upcoming data places `LIVE` rows
before `SCHEDULED` and `POSTPONED`; history contains `FINISHED` and `CANCELLED`.
Both scopes use deterministic ordering and the standard pagination envelope.
Historical labels use registration snapshots and links use global `teamId`.
Unfinished rows mask scores, results, loss types, winners, and score source.

`tournaments` returns every non-deleted participation in every tournament
status, including `WITHDRAWN` participation, using the standard pagination
envelope. `isChampion` is true only when the tournament's champion id equals
that exact participation id. Statistics are restricted to each participation.

All aggregates are calculated from non-deleted `FINISHED` matches. Win rate
includes normal, default, and forfeit results. Score averages include only
`PERIODS` scores with both final scores present. Player rows are first summed
to one nullable team-match line; measured zero is preserved and each metric
uses its own measured-match denominator. Shooting uses aggregate makes and
attempts, and efficiency uses only complete measured inputs. Derived values
are rounded to three decimals. With no denominator, the value is `null` and
the measured-game count is `0`. Team profile responses expose averages,
rates, and measured-game metadata only; they never expose aggregate totals.

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
