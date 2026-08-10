# Module: Teams (`TeamsModule`)

Team lifecycle management. Teams are affiliated to organizations through `OrganizationTeamAffiliation`; this module manages the team entity itself. Create, status update, and delete are system-admin-gated platform operations; identity edits (`PATCH /teams/:id`) belong to the team's own active `TEAM_ADMIN`.

## Endpoints

| Method   | Path                            | Guards                                          | Purpose                                                                                               |
| -------- | ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST`   | `/teams`                        | `JwtAuthGuard`, `SystemAdminGuard`              | Create team; requires `name` and `shortName`; auto-generates slug from name                           |
| `GET`    | `/teams`                        | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated catalog scoped to the active JWT organization; filters: `q` (name search), `ids`, `status`  |
| `GET`    | `/teams/affiliation-candidates` | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)`       | Paginated search for teams the active organization can invite; filter: `q` (name/short name)          |
| `GET`    | `/teams/:id`                    | `JwtAuthGuard`, `SystemAdminGuard`              | Global lookup by id; platform operation                                                               |
| `GET`    | `/teams/:id/summary`            | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Team identity, all valid titles, and organization-scoped historical averages                          |
| `GET`    | `/teams/:id/matches`            | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated `upcoming` or `history` matches; `scope` is required                                        |
| `GET`    | `/teams/:id/tournaments`        | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated tournament participations and per-participation averages                                    |
| `PATCH`  | `/teams/:id`                    | `JwtAuthGuard`, `OrgRoleGuard(TEAM_ADMIN)`      | Update `name`/`shortName`/`city`/`state` of the caller's own active team; re-generates slug on rename |
| `PATCH`  | `/teams/:id/status`             | `JwtAuthGuard`, `SystemAdminGuard`              | Update status; system admin only (platform operation)                                                 |
| `DELETE` | `/teams/:id`                    | `JwtAuthGuard`, `SystemAdminGuard`              | Soft delete; sets `isDeleted: true` + `status: INACTIVE` (platform operation)                         |

`GET /teams` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Team profile reads

The three `/teams/:id/*` profile reads take the active organization only from
the JWT. A team is visible when it is non-deleted and has either a live active
organization affiliation or a non-deleted tournament participation in that
organization. Missing, deleted, and organization-invisible ids all return the
same `404 Team not found` response. The original `GET /teams/:id` route is a
system-admin-only global lookup, distinct from the three tenant-scoped
`/teams/:id/*` reads above.

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

## Affiliation candidates (`GET /teams/affiliation-candidates`)

Backs the org-admin "invite a team" search in `organization-team-affiliations`. Returns globally `ACTIVE`, non-deleted teams that do **not** currently have a `PENDING` or `ACTIVE` affiliation with the caller's organization — i.e. teams that are either brand new to the organization or whose prior affiliation is `INACTIVE`.

- `affiliation` on each item is `null` for a team with no prior link, or `{ id, status: 'INACTIVE' }` when the team has a live `INACTIVE` affiliation with this organization (reusable by reactivating rather than re-onboarding). `PENDING`/`ACTIVE` links exclude the team from the list entirely — they are not candidates.
- `q` filters by `name` or `shortName`, case-insensitive.
- Allowed role: `ORG_ADMIN` only.

## Own-team edit (`PATCH /teams/:id`)

Exclusively an active own-team `TEAM_ADMIN` operation. The route no longer accepts `SYSTEM_ADMIN`, and there is no `/admin` replacement for platform-wide team identity edits yet. The service derives the actor's current team from a live `OrganizationUserAffiliation` (`role: TEAM_ADMIN`, `status: ACTIVE`, matching `teamId`) whose team is globally `ACTIVE` and holds an `ACTIVE` `OrganizationTeamAffiliation` with the JWT's organization, then requires that team to equal the path `:id`; otherwise `403 You can only manage your own team`. Editable fields: `name`, `shortName`, `city`, `state` — at least one is required. Renaming re-generates the slug and re-checks the `409 DUPLICATE_RECORD` conflict against other non-deleted teams.

## Rules

- **`GET /teams`**: tenant-scoped catalog. A team qualifies when it has a non-deleted, `ACTIVE` `OrganizationTeamAffiliation` in the JWT's active organization. Requires an active org context (`OrgRoleGuard`); a token without one, including a platform-admin token, gets `403`. Ordering: `name ASC`, then `id ASC`. Response includes `city`/`state` (nullable). The old `organizationId` query parameter is removed — organization scope comes only from the JWT.
- **Get by id** (`GET /teams/:id`): system admin only. It is a global lookup with no tenant scoping, so an organization member has no legitimate use for it; the tenant-scoped surfaces are `GET /teams` and `GET /teams/:id/summary`.
- **`PATCH /teams/:id`**: active own-team `TEAM_ADMIN` only (see above).
- **Create, update status, delete**: system admin only — platform operations, documented separately below; no role-based exceptions.

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
