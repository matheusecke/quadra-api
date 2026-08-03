# Module: Athletes (`AthletesModule`)

Organization-scoped athlete catalog, profile, and persisted-statistics reads.
The identity in every route is global `User.id`; active JWT organization scope
makes cross-tenant ids indistinguishable from missing ids.

## Endpoints

| Method | Path                        | Query                                                  | Purpose                                        |
| ------ | --------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `GET`  | `/athletes`                 | `page`, `limit`, `q`, repeated `ids`, `teamId`, `role` | Existing roster-candidate catalog              |
| `GET`  | `/athletes/:id`             | none                                                   | Current profile or historical athlete identity |
| `GET`  | `/athletes/:id/statistics`  | none                                                   | All visible finished-match aggregates          |
| `GET`  | `/athletes/:id/matches`     | `page`, `limit`, repeated `ids`, `tournamentId`        | Match box-score history                        |
| `GET`  | `/athletes/:id/tournaments` | `page`, `limit`, repeated `ids`, `seasonId`            | Tournament/team aggregate history              |

All reads require `JwtAuthGuard`, active organization context, and any active
organization role. List routes use the standard pagination envelope.

## Visibility and history

The catalog remains restricted to active roster-eligible affiliations. Detail
routes accept a non-deleted user who has either an active `ATHLETE` affiliation
or a non-deleted historical athlete tournament roster in the organization.
Historical-only profiles return null current team, jersey, and position.

Only non-deleted `PlayerMatchStatistic` rows from visible `FINISHED` matches
contribute. LIVE draft/reopened rows do not contribute. Match names prefer the
non-deleted match-roster snapshot and fall back to the tournament-roster
snapshot; tournament and team names always use tournament snapshots.

## Statistics

Aggregates expose games played, metric-specific measured games, nullable
totals/per-game values, `fgPct`, `threeFgPct`, `ftPct`, `trueShootingPct`, and
EFF. Percentages are `0..1`; derived non-integers have at most three decimals.
`null` means untracked and zero means measured zero.

Match history order is `scheduledAt DESC`, then match id DESC. Tournament
history groups by tournament and tournament team, then orders by tournament
start DESC NULLS LAST, tournament id DESC, and tournament-team id ASC.

## Boundaries

This module only reads Phase 9 statistics/roster snapshots. It does not write,
repair, cache, or persist aggregates and does not implement Phase 11 admin
behavior. Shared arithmetic lives in the internal `StatisticsModule`.
