# Module: Tournament Teams (`TournamentTeamsModule`)

Registration lifecycle of a global `Team` into a specific `Tournament`. `TournamentTeam` is a historical identity distinct from `Team`: from registration onward, every downstream sports resource (roster, groups, bracket, matches) references `tournamentTeamId`, never `teamId` (see `docs/sports-domain-rules.md` §1).

## Endpoints

| Method   | Path                     | Guards                                          | Purpose                                                                         |
| -------- | ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET`    | `/tournaments/:id/teams` | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated list of registrations for a tournament; filters: `q`, `ids`, `status` |
| `POST`   | `/tournaments/:id/teams` | `JwtAuthGuard`, `OrgRoleGuard` (`ORG_ADMIN`)    | Register a team, or reactivate its withdrawn registration                       |
| `PATCH`  | `/tournament-teams/:id`  | `JwtAuthGuard`, `OrgRoleGuard` (`ORG_ADMIN`)    | Update the bracket seed only                                                    |
| `DELETE` | `/tournament-teams/:id`  | `JwtAuthGuard`, `OrgRoleGuard` (`ORG_ADMIN`)    | Withdraw the registration (status only, no hard delete)                         |

`GET /tournaments/:id/teams` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Tenant scope and tournament lifecycle

Every route resolves the tournament through `organizationId` + `isDeleted: false` first; a missing, deleted, or cross-tenant tournament (list/create) or registration (update/withdraw) returns `404 RECORD_NOT_FOUND`.

Writes are allowed while the tournament is `DRAFT`, `REGISTRATION`, or `IN_PROGRESS`, and rejected with `409 TOURNAMENT_NOT_MUTABLE` for `COMPLETED`/`CANCELLED`. Reads are available in every tournament status.

## Listing

Omitting `status` returns both `ACTIVE` and `WITHDRAWN` rows — the frontend must pass `status=ACTIVE` for operational selectors. Ordering is `displayNameSnapshot ASC`, then `id ASC`.

## Registration and reactivation

`POST` accepts only `{ teamId }`. Ordered validations: the team must be `ACTIVE` and non-deleted (`422 INVALID_TEAM`), and must have an active, non-deleted `OrganizationTeamAffiliation` with the active organization (`422 INVALID_TEAM`). An existing `ACTIVE` registration for the same tournament/team is rejected (`409 DUPLICATE_RECORD`). An existing `WITHDRAWN` registration is reactivated in place — the same historical id, with only `organizationTeamAffiliationId` and `status` refreshed; `displayNameSnapshot`, `seed`, and tiebreak fields are left untouched. Otherwise a new row is created with the team's current name snapshot.

## Seed update

`PATCH /tournament-teams/:id` accepts only `seed` (`null` or an integer ≥ 1). Tiebreak fields (`tiebreakOrder`, `tiebreakBlockKey`) are not accepted here — they are written only by `PUT /tournaments/:id/tiebreaks` (see
[`src/standings/docs/README.md`](../../standings/docs/README.md)). The target registration must be `ACTIVE` (`422 INACTIVE_REGISTRATION` otherwise). An empty body is a no-op that returns the current read model without a write. The update is rejected with `409 REGISTRATION_IN_USE` when any non-deleted `TournamentBracketSlot` references this registration as home, away, or winner.

## Withdrawal

`DELETE /tournament-teams/:id` sets `status: WITHDRAWN` only — it never sets `isDeleted` and never touches roster rows, group memberships, bracket slots, or match sides. An already-withdrawn registration returns `204` without another write, but only after the tenant and tournament-lifecycle checks pass (a withdrawal request against a completed/cancelled tournament still returns `409` even if already withdrawn).
