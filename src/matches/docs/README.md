# Matches

Phase 8 owns match scheduling and reads persisted result data without writing it.

## Routes and authorization

| Method | Route                      | Role                         | Success               |
| ------ | -------------------------- | ---------------------------- | --------------------- |
| GET    | `/matches`                 | Any active organization role | 200 paginated summary |
| GET    | `/matches/:id`             | Any active organization role | 200 detail            |
| GET    | `/tournaments/:id/matches` | Any active organization role | 200 paginated summary |
| POST   | `/matches`                 | `ORG_ADMIN`                  | 201 detail            |
| PATCH  | `/matches/:id`             | `ORG_ADMIN`                  | 200 detail            |
| POST   | `/matches/:id/postpone`    | `ORG_ADMIN`                  | 200 detail            |
| POST   | `/matches/:id/cancel`      | `ORG_ADMIN`                  | 200 detail            |

Tenant scope always comes from the JWT. Missing, deleted, and cross-tenant
targets return `404`.

## Lists

Both lists accept `page`, `limit`, `q`, repeated `ids`, repeated
`tournamentTeamIds`, and `status`; the global list also accepts `tournamentId`.
Defaults are page 1 and limit 10; maximum limit is 100. Filters combine with
AND, repeated values use IN, and `tournamentTeamIds` matches either active
side. Ordering is `scheduledAt DESC, id DESC`. The nested list validates its
tournament before listing and rejects a query `tournamentId`.

## Scheduling writes

`POST /matches` requires `tournamentId`, `scheduledAt`,
`homeTournamentTeamId`, and `awayTournamentTeamId`. It optionally accepts
nullable `tournamentGroupId`, `matchNumber`, and `venueName`. It creates a
`SCHEDULED` match plus exactly one HOME and one AWAY `MatchTeam` in one nested
Prisma write. Participant ids are `TournamentTeam.id` registrations.

`PATCH /matches/:id` accepts the same fields except immutable `tournamentId`;
every field is optional. An empty object is a 200 no-op. Nullable group,
number, and venue values clear those fields; `scheduledAt` and both participant
ids reject an explicit `null` with `400 VALIDATION_ERROR`. Sending `scheduledAt`
for a POSTPONED match sets it back to SCHEDULED even when the timestamp is
unchanged.

| Status    | Schedule                 | Number/venue | Participants/group              |
| --------- | ------------------------ | ------------ | ------------------------------- |
| SCHEDULED | Editable                 | Editable     | Editable                        |
| POSTPONED | Editable and reschedules | Editable     | Editable before scoresheet data |
| LIVE      | Editable                 | Editable     | Rejected                        |
| FINISHED  | Rejected                 | Editable     | Rejected                        |
| CANCELLED | Rejected                 | Editable     | Rejected                        |

Postpone accepts SCHEDULED or LIVE. Cancel accepts SCHEDULED, LIVE, or
POSTPONED. Actions are not idempotent; repeated or otherwise invalid actions
return `INVALID_STATUS_TRANSITION`.

## Group and bracket rules

LEAGUE and KNOCKOUT matches must have a null group. GROUP_STAGE and
GROUP_STAGE_KNOCKOUT may use a valid group or null. A non-null group requires
both active registrations to belong to it. A null group may pair teams from
different groups and is not included in group standings automatically.

A linked match cannot gain a non-null group. A complete linked slot must have
the same unordered participant pair; an incomplete slot skips comparison.
Postpone and cancel preserve the link. This module never links, unlinks, writes
a slot winner, or advances the bracket.

## Read models

Lists return summary items. Detail and every write add `periods`,
`playerStats`, and nullable `mvp`. Participant names use
`TournamentTeam.displayNameSnapshot`. Result fields and `scoreSource` are null
until FINISHED. `scoreSource` is AWARDED for FORFEIT and for DEFAULT when final
scores differ from active period sums; otherwise a finished match uses PERIODS.
A FINISHED forfeit reads as `periods: []`, `playerStats: []`, and `mvp: null`;
that masking applies only while the match is FINISHED, so a reopened match still
exposes its stored scoresheet. Phase 8 reads result relations but never writes
them.

## Domain errors

| HTTP | Code                      | Message                                                                                      |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------- |
| 400  | VALIDATION_ERROR          | `Invalid data in request.`                                                                   |
| 404  | RECORD_NOT_FOUND          | `Match not found`                                                                            |
| 404  | RECORD_NOT_FOUND          | `Tournament not found`                                                                       |
| 404  | RECORD_NOT_FOUND          | `Tournament group not found`                                                                 |
| 404  | RECORD_NOT_FOUND          | `Tournament team not found`                                                                  |
| 409  | TOURNAMENT_NOT_MUTABLE    | `Matches cannot be created for a completed or cancelled tournament.`                         |
| 409  | INVALID_STATUS_TRANSITION | `Only a scheduled or live match can be postponed.`                                           |
| 409  | INVALID_STATUS_TRANSITION | `Only a scheduled, live, or postponed match can be cancelled.`                               |
| 409  | INVALID_STATUS_TRANSITION | `scheduledAt cannot be changed for a finished or cancelled match.`                           |
| 409  | INVALID_STATUS_TRANSITION | `Participants and tournamentGroupId can only be changed for scheduled or postponed matches.` |
| 409  | MATCH_HAS_SCORESHEET      | `Match participants cannot be changed after scoresheet data has been recorded.`              |
| 409  | CONCURRENT_MODIFICATION   | `The resource changed during this operation. Retry the request.`                             |
| 422  | SAME_TEAM_IN_MATCH        | `A match cannot have the same team on both sides.`                                           |
| 422  | INACTIVE_REGISTRATION     | `The tournament team registration is not active.`                                            |
| 422  | INVALID_MATCH_ASSIGNMENT  | `The tournament team registration must belong to the match tournament.`                      |
| 422  | INVALID_TOURNAMENT_FORMAT | `This tournament format does not have a group stage.`                                        |
| 422  | INVALID_GROUP_ASSIGNMENT  | `The tournament group must belong to the match tournament.`                                  |
| 422  | INVALID_GROUP_ASSIGNMENT  | `Both match participants must belong to the selected tournament group.`                      |
| 422  | MATCH_IN_BRACKET          | `A match linked to a bracket slot cannot belong to a tournament group.`                      |
| 422  | MATCH_TEAMS_MISMATCH      | `The match participants do not match the bracket slot participants.`                         |

Unknown query/body properties and invalid values return `400 VALIDATION_ERROR`.

## Phase 9 boundary

Draft/result/reopen routes, periods, box score, match rosters, MVP writes,
result derivation/persistence, and automatic bracket advancement belong to
Phase 9 and are not implemented here.
