# Matches

`MatchesModule` owns match scheduling, match detail/list reads, scoresheet
drafts, official result submission, and result reopening. It reuses the
persisted sports schema; Phase 9 adds no migration or response model.

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
| POST   | `/matches/:id/draft`       | `ORG_ADMIN`                  | 200 detail            |
| POST   | `/matches/:id/result`      | `ORG_ADMIN`                  | 200 detail            |
| POST   | `/matches/:id/reopen`      | `ORG_ADMIN`                  | 200 detail            |

Tenant scope always comes from the JWT. Missing, deleted, and cross-tenant
targets return `404`. Unknown query/body properties and invalid values return
`400 VALIDATION_ERROR`. Every write response is the same detail model returned
by `GET /matches/:id`; the global interceptor wraps it as
`{ data, statusCode }`.

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
ids reject an explicit `null` with `400 VALIDATION_ERROR`. Sending
`scheduledAt` for a POSTPONED match sets it back to SCHEDULED even when the
timestamp is unchanged.

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

## Scoresheet value objects

A period has `periodNumber`, `periodType`, `homePoints`, and `awayPoints`.
Numbers start at 1 without gaps or duplicates. Periods 1–4 are `REGULAR`; any
later period is `OVERTIME`. Points are non-negative integers. Period timestamps
are stored as null because the API does not accept them.

A player-stat item requires `tournamentRosterId`. The metrics `pts`, `fgm`,
`fga`, `threeFgm`, `threeFga`, `ftm`, `fta`, `reb`, `ast`, `stl`, `blk`,
`tov`, `pf`, and `minutesSeconds` each accept an integer greater than or equal
to zero or null. Omitted metrics normalize to null. For each metric, every
submitted player must either have a numeric value or every player must have
null; mixing tracked and untracked values returns `INVALID_PLAYER_STATS`.
Made shots cannot exceed their attempted counterpart for `fgm`/`fga`,
`threeFgm`/`threeFga`, and `ftm`/`fta`.

Statistics accept eligible active or inactive tournament-roster athletes from
one of the two match teams. Each athlete may appear once. Submitted statistics
create `AVAILABLE` match-roster snapshots as a consequence; there is no roster
request field and this phase creates no `DNP` row.

## Draft

`POST /matches/:id/draft` accepts this shape:

```json
{
  "periods": [
    {
      "periodNumber": 1,
      "periodType": "REGULAR",
      "homePoints": 18,
      "awayPoints": 22
    }
  ],
  "playerStats": [
    {
      "tournamentRosterId": 88,
      "pts": 18,
      "fgm": null
    }
  ],
  "mvpTournamentRosterId": 88
}
```

Every key is optional. Omitted `periods` or `playerStats` preserve that active
collection; a supplied collection replaces it completely and `[]` clears it.
Replacing statistics also replaces their active `AVAILABLE` match rosters.
Omitted MVP preserves it, a positive roster id binds it to a statistic in the
resulting set, and null clears it. A statistic replacement that would silently
remove an existing MVP is rejected.

Draft changes SCHEDULED to LIVE, keeps LIVE as LIVE, initializes a missing
`startedAt`, and clears `endedAt`. It never writes official result fields,
linked-slot winner, tournament status, or champion. Draft does not accept
`resultType` or `offendingTournamentTeamId`.

## Result

`POST /matches/:id/result` accepts one of three payloads. Omitted `resultType`
means `NORMAL`.

NORMAL requires four complete regular periods, any contiguous overtime
periods needed to break a tie, and a non-tied final sum:

```json
{
  "resultType": "NORMAL",
  "periods": [
    {
      "periodNumber": 1,
      "periodType": "REGULAR",
      "homePoints": 18,
      "awayPoints": 15
    },
    {
      "periodNumber": 2,
      "periodType": "REGULAR",
      "homePoints": 20,
      "awayPoints": 17
    },
    {
      "periodNumber": 3,
      "periodType": "REGULAR",
      "homePoints": 16,
      "awayPoints": 18
    },
    {
      "periodNumber": 4,
      "periodType": "REGULAR",
      "homePoints": 18,
      "awayPoints": 18
    }
  ],
  "playerStats": [],
  "mvpTournamentRosterId": null
}
```

DEFAULT represents abandonment. It requires at least one valid period and the
offending participant. Court scores come from period sums. If the
non-offending team is already ahead, the official score preserves both court
totals; if it is tied or behind, the official score becomes 2–0 for that team:

```json
{
  "resultType": "DEFAULT",
  "offendingTournamentTeamId": 52,
  "periods": [
    {
      "periodNumber": 1,
      "periodType": "REGULAR",
      "homePoints": 1,
      "awayPoints": 7
    }
  ],
  "playerStats": [],
  "mvpTournamentRosterId": null
}
```

FORFEIT represents W.O. and permits only the offender field. `periods`,
`playerStats`, and `mvpTournamentRosterId` are prohibited even when empty or
null:

```json
{
  "resultType": "FORFEIT",
  "offendingTournamentTeamId": 52
}
```

Played results require both `periods` and `playerStats`; `playerStats: []` is
valid. NORMAL prohibits an offender, DEFAULT requires one, and FORFEIT requires
one. Result fully replaces periods, statistics, and their active `AVAILABLE`
match rosters. FORFEIT clears those active facts and MVP but preserves
standalone legacy/future `DNP` rows.

For a played result, omitted `mvpTournamentRosterId` preserves the current MVP
only when that athlete is present in the complete replacement statistics;
null clears it, and a positive id selects an athlete from that resulting set.

The client never sends official score, side result, loss type, winner flag, or
score source. The service derives all five. NORMAL uses period sums. DEFAULT
uses the abandonment rule above. FORFEIT awards 20–0. `scoreSource` is
`PERIODS` unless a DEFAULT award differs from court sums; DEFAULT with an
adjusted score and every FORFEIT use `AWARDED`.

A played result from SCHEDULED uses one transaction time for both `startedAt`
and `endedAt`. A played result from LIVE preserves a non-null start time and
sets `endedAt` to the transaction time. FORFEIT always stores
`startedAt = null` and `endedAt = now`.

If an already-linked slot has incomplete or different participants, result
submission returns `MATCH_TEAMS_MISMATCH` before any write. Otherwise the same
transaction synchronizes that slot's winner. A changed winner reopens a
COMPLETED tournament and clears its champion; an unchanged winner does not.
The service never advances another slot or follows `sourceSlotId`.

After commit, a played result with non-empty statistics and numeric `pts` for
every player compares per-side player totals with official `PERIODS` scores.
Each mismatching side emits one structured
`match_player_points_mismatch` warning. The warning does not alter the response
or roll back the result. Awarded scores, empty statistics, and any null `pts`
suppress the check.

## Reopen

`POST /matches/:id/reopen` accepts an omitted body or `{}`; any body property
returns `400 VALIDATION_ERROR`. Only FINISHED can transition to LIVE. Reopen
clears `endedAt` plus both sides' official score, result, loss type, and winner
flag. It preserves `startedAt`, periods, player statistics, match rosters, MVP,
linked-slot winner, tournament status, and champion.

Reopen itself never changes a completed tournament. The corrected result
submission changes tournament/champion state only when it changes the linked
slot's stored winner.

## Phase 9 lifecycle matrix

| Current status | `/draft`     | `/result`                     | `/reopen` |
| -------------- | ------------ | ----------------------------- | --------- |
| SCHEDULED      | LIVE         | FINISHED for all result types | 409       |
| LIVE           | remains LIVE | FINISHED for all result types | 409       |
| FINISHED       | 409          | 409; reopen first             | LIVE      |
| POSTPONED      | 409          | 409                           | 409       |
| CANCELLED      | 409          | 409                           | 409       |

A CANCELLED tournament blocks every draft, result, and reopen write. A
COMPLETED tournament still permits the correction flow described above. Every
Phase 9 mutation uses the existing serializable transaction with four total
attempts before `409 CONCURRENT_MODIFICATION`.

## Group and bracket rules

LEAGUE and KNOCKOUT matches must have a null group. GROUP_STAGE and
GROUP_STAGE_KNOCKOUT may use a valid group or null. A non-null group requires
both active registrations to belong to it. A null group may pair teams from
different groups and is not included in group standings automatically.

A linked match cannot gain a non-null group. A complete linked slot must have
the same unordered participant pair. PATCH permits an incomplete slot because
Phase 7 may still be assembling the bracket; result submission requires a
complete, matching slot. Postpone, cancel, draft, and reopen preserve the link.
Only result writes the current slot winner. This module never links, unlinks,
propagates participants, or advances the bracket.

## Read models

Lists return summary items. Detail and every write add `periods`,
`playerStats`, and nullable `mvp`. Participant names use
`TournamentTeam.displayNameSnapshot`. Result fields and `scoreSource` are null
until FINISHED. A FINISHED forfeit reads as `periods: []`, `playerStats: []`,
and `mvp: null`; masking applies only while FINISHED, so a reopened LIVE match
exposes any preserved raw facts.

## Domain errors

| HTTP | Code                      | Message                                                                                      |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------- |
| 400  | VALIDATION_ERROR          | `Invalid data in request.`                                                                   |
| 404  | RECORD_NOT_FOUND          | `Match not found`                                                                            |
| 404  | RECORD_NOT_FOUND          | `Tournament not found`                                                                       |
| 404  | RECORD_NOT_FOUND          | `Tournament group not found`                                                                 |
| 404  | RECORD_NOT_FOUND          | `Tournament team not found`                                                                  |
| 404  | RECORD_NOT_FOUND          | `Tournament roster not found`                                                                |
| 409  | TOURNAMENT_NOT_MUTABLE    | `Matches cannot be created for a completed or cancelled tournament.`                         |
| 409  | TOURNAMENT_NOT_MUTABLE    | `Match scoresheets cannot be changed for a cancelled tournament.`                            |
| 409  | INVALID_STATUS_TRANSITION | `Only a scheduled or live match can be postponed.`                                           |
| 409  | INVALID_STATUS_TRANSITION | `Only a scheduled, live, or postponed match can be cancelled.`                               |
| 409  | INVALID_STATUS_TRANSITION | `Drafts can only be saved for scheduled or live matches.`                                    |
| 409  | INVALID_STATUS_TRANSITION | `Results can only be submitted for scheduled or live matches.`                               |
| 409  | INVALID_STATUS_TRANSITION | `Only a finished match can be reopened.`                                                     |
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
| 422  | INVALID_MATCH_PERIODS     | `Periods must be contiguous and use the type required by their number.`                      |
| 422  | INVALID_MATCH_PERIODS     | `A normal result requires four complete regular periods and a non-tied score.`               |
| 422  | INVALID_MATCH_PERIODS     | `A default result requires at least one period.`                                             |
| 422  | INVALID_OFFENDING_TEAM    | `The offending team must be one of the match participants.`                                  |
| 422  | INVALID_PLAYER_STATS      | `Each player can appear only once in match statistics.`                                      |
| 422  | INVALID_PLAYER_STATS      | `Each tracked statistic must be provided for every player or be null for every player.`      |
| 422  | INVALID_PLAYER_STATS      | `Made shots cannot exceed attempted shots.`                                                  |
| 422  | INVALID_MATCH_ROSTER      | `Every player statistic must reference an athlete from one of the match teams.`              |
| 422  | INVALID_MATCH_MVP         | `The match MVP must be present in the resulting player statistics.`                          |
| 422  | MATCH_TEAMS_MISMATCH      | `The match participants do not match the bracket slot participants.`                         |

## Phase boundaries

Phase 8 supplied scheduling, reads, detail mapping, result masking, and the
participant scoresheet guard that Phase 9 reuses. Phase 9 owns raw match-fact
writes and official result derivation. Phase 10 will calculate totals,
averages, leaders, and other aggregates from the persisted raw statistics;
this module stores none of those aggregates and exposes no leaderboard route.
