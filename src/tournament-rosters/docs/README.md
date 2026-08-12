# Module: Tournament Rosters (`TournamentRostersModule`)

Membership of a global `User` in a specific `TournamentTeam` registration. `TournamentRoster` is a historical identity distinct from `OrganizationUserAffiliation`: once a user joins a roster, downstream sports resources (match rosters, statistics, MVP) reference `tournamentRosterId`, never `organizationUserAffiliationId` (see `docs/sports-domain-rules.md` §1).

## Endpoints

| Method   | Path                                       | Guards                                                                       | Purpose                                                                   |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET`    | `/tournament-teams/:id/tournament-rosters` | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`)                              | Full active roster for a registration; not paginated, no query parameters |
| `POST`   | `/tournament-rosters`                      | `JwtAuthGuard`, `OrgRoleGuard` (`ORG_ADMIN`, `TEAM_ADMIN`, `COACHING_STAFF`) | Add a member, or reactivate an inactive roster entry                      |
| `PATCH`  | `/tournament-rosters/:id`                  | `JwtAuthGuard`, `OrgRoleGuard` (`ORG_ADMIN`, `TEAM_ADMIN`, `COACHING_STAFF`) | Update `jerseyNumber` and/or `role`                                       |
| `DELETE` | `/tournament-rosters/:id`                  | `JwtAuthGuard`, `OrgRoleGuard` (`ORG_ADMIN`, `TEAM_ADMIN`, `COACHING_STAFF`) | Deactivate a roster entry (status only, no hard delete)                   |

`GET` returns a plain `{ data: [...] }` array — no `PaginationInterceptor`, no `page`/`limit`. The empty `ListTournamentRostersQueryDto` makes the global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`) reject any query parameter with `400 VALIDATION_ERROR`.

## Tenant scope, team ownership, and tournament lifecycle

Every route resolves its target (`TournamentTeam` for `GET`, `TournamentRoster` for `PATCH`/`DELETE`, and the body's `tournamentTeamId` for `POST`) through `organizationId` + `isDeleted: false` first; a missing, deleted, or cross-tenant target returns `404 RECORD_NOT_FOUND`.

Writes are allowed while the tournament is `DRAFT`, `REGISTRATION`, or `IN_PROGRESS`, and rejected with `409 TOURNAMENT_NOT_MUTABLE` for `COMPLETED`/`CANCELLED`. Reads are available in every tournament status, for both `ACTIVE` and `WITHDRAWN` team registrations.

`ORG_ADMIN` may write to any team's roster in the active organization. `TEAM_ADMIN` and `COACHING_STAFF` may only write to the roster of the tournament team whose global `teamId` matches their own current active `OrganizationUserAffiliation.teamId`; the role guard cannot express this (the JWT carries no `teamId`), so the service performs the check and returns `403 FORBIDDEN` for a mismatch. This authorization check always runs before an idempotent no-op decision on `DELETE`.

## Listing

`GET /tournament-teams/:id/tournament-rosters` returns only `status: ACTIVE`, non-deleted rows, ordered `role ASC`, `displayNameSnapshot ASC`, then `id ASC`.

The shared read model is `id`, `tournamentId`, `tournamentTeamId`, `userId`, `role`, `jerseyNumber`, `displayNameSnapshot`, and `status`. `joinedAt`, `leftAt`, `createdAt`, and `updatedAt` are written and persisted but never returned — they are internal control columns with no consumer.

## Membership creation and reactivation

`POST` accepts `{ userId, tournamentTeamId, role, jerseyNumber? }`. Ordered validations: the target registration exists and is tenant-scoped (`404`); its tournament is mutable (`409 TOURNAMENT_NOT_MUTABLE`); the registration is `ACTIVE` (`422 INACTIVE_REGISTRATION`); the actor has write access to that team (`403 FORBIDDEN`); the target user exists, is `ACTIVE`, and non-deleted (`422 INVALID_ROSTER_MEMBER`); the user has an active, non-deleted `OrganizationUserAffiliation` in the same organization and global team (`422 INVALID_ROSTER_MEMBER` if absent); the affiliation role exactly matches the requested roster role (`422 INVALID_ROSTER_ROLE` otherwise); the user has no active roster row already on this registration (`409 DUPLICATE_RECORD`); for `ATHLETE` only, the user has no other active athlete roster row in the same tournament on a different team (`409 ATHLETE_ALREADY_REGISTERED` — this cross-team uniqueness rule does not apply to `COACHING_STAFF`, who may be active on multiple tournament teams).

`jerseyNumber` is optional: omitting it copies the current affiliation's jersey number; an explicit value, including `null`, overrides it for this tournament only.

An inactive roster row for the same user and registration is reactivated in place — the same historical id, refreshing only `organizationUserAffiliationId`, `role`, `jerseyNumberSnapshot`, `status: ACTIVE`, and clearing `leftAt`. `displayNameSnapshot` and `joinedAt` are never touched by reactivation. Otherwise a new row is created with `joinedAt: now()` and the current user name snapshot.

## Update

`PATCH /tournament-rosters/:id` accepts only `role?` and `jerseyNumber?`. The target must be `ACTIVE` (`422 INACTIVE_REGISTRATION` otherwise). An empty body is a no-op returning the current read model without a write. When `role` changes, the service re-reads the user's active same-team affiliation and enforces exact role compatibility (`422 INVALID_ROSTER_MEMBER` / `422 INVALID_ROSTER_ROLE`); changing to `ATHLETE` also reruns the cross-team athlete uniqueness check (`409 ATHLETE_ALREADY_REGISTERED`). `displayNameSnapshot` and `joinedAt` never change through this route.

## Deactivation

`DELETE /tournament-rosters/:id` sets `status: INACTIVE` and `leftAt: now()` only — it never sets `isDeleted` and never touches match rosters or statistics attached to this historical roster row. An already-inactive entry returns `204` without another write, but only after the tenant, tournament-lifecycle, and team-ownership checks pass.
