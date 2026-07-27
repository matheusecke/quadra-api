# Module: Athletes (`AthletesModule`)

Roster-eligible user catalog. Despite the route name, this is a selector over `OrganizationUserAffiliation` for the two tournament-roster roles (`ATHLETE`, `COACHING_STAFF`) — not a second person identity and not the standalone athlete profile that is still to be built.

## Endpoints

| Method | Path        | Guards                                          | Purpose                                                                                                                  |
| ------ | ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/athletes` | `JwtAuthGuard`, `OrgRoleGuard` (`ANY_ORG_ROLE`) | Paginated catalog of active, roster-eligible users in the active JWT organization; filters: `q`, `ids`, `teamId`, `role` |

`GET /athletes` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Eligibility

A row is included when the `OrganizationUserAffiliation` is active and non-deleted, its role is `ATHLETE` or `COACHING_STAFF`, and the related `User` is active and non-deleted. `ORG_ADMIN` and `TEAM_ADMIN` affiliations never appear, even without a `role` filter.

## Response shape

`id` is the global `User.id` — the same value accepted as `userId` by `POST /tournament-rosters`. `jerseyNumber` and `position` are nullable. `status` is the user's `EntityStatus` and is always `ACTIVE` in this catalog. Email and affiliation ids are deliberately omitted.

Ordering: user `name ASC`, then user `id ASC`.
