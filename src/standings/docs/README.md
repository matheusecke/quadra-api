# Standings

Computes the FIBA classification table (Official Basketball Rules, Appendix D)
from existing match data, and persists the human draw that resolves a tie the
norm cannot break. It never writes matches.

## Routes

- `GET /tournaments/:id/standings` — optional `groupId` filter
- `PUT /tournaments/:id/tiebreaks`
- `DELETE /tournaments/:id/tiebreaks/:blockKey`

Reads accept any active organization role. Writes require `ORG_ADMIN`. Tenant
scope comes from the JWT; missing, deleted, and cross-tenant tournaments return
`404`.

## Scope resolution

| Format | Tables | Teams | Matches counted |
| --- | --- | --- | --- |
| `LEAGUE` | one, `group: null` | every active registration | tournament matches whose two sides are both in the table |
| `GROUP_STAGE`, `GROUP_STAGE_KNOCKOUT` | one per group, ordered by `sortOrder` (nulls last), `name`, `id` | the group's active memberships | matches with that `tournamentGroupId` whose two sides are both in the table |
| `KNOCKOUT` | none — empty list | — | — |

A knockout match has no `tournament_group_id`, so it never enters a group
table. `groupId` filters the resolved tables and yields an empty list for
`LEAGUE`, `KNOCKOUT`, and any group that does not exist in the tenant.
`WITHDRAWN` registrations keep their row and their matches — dropping them
would retroactively annul everyone else's wins over them.

## Counting

Only `FINISHED` matches count, and only when both sides carry a result and a
final score. Classification points follow Appendix D: `WIN` 2, `LOSS` 1,
`LOSS` by forfeit 0. The winner is read from `match_teams.result`, never
re-derived from the score. `winPct` is display-only and is `null` at zero games.

`standingsState` is `EMPTY` with no counted match, `PARTIAL` while a
`SCHEDULED`, `LIVE`, or `POSTPONED` match remains, and `FINAL` otherwise.
`CANCELLED` matches are not pending. In `EMPTY`, every `position` is `null` and
rows are listed by team name.

## Tiebreaks

`standings-ranking.ts` partitions by classification points, then resolves each
tied block through the six criteria: head-to-head classification points,
head-to-head difference, head-to-head points scored, group-wide difference,
group-wide points scored, and finally the recorded draw. Head-to-head is
intransitive, so the algorithm partitions recursively instead of sorting: the
moment a criterion splits a block, each surviving sub-block restarts from
criterion 1 with head-to-head recomputed among the survivors only. Criteria 4
and 5 stay group-wide at every depth.

`tieBlockKey` is the block's `tournamentTeamId`s, ascending, joined by `-`. It
is set on every row of a block that reached the draw criterion, whether or not
a draw exists, because that key is what `DELETE` addresses. A draw is honoured
only when every team of the block carries an order and a `tiebreakBlockKey`
equal to the current key; otherwise the block is flagged `isTiedUnresolved` and
listed by team name. A draw recorded for a different block stays written but
inert.

`PUT` accepts any current block, resolved or not — that is how a draw is
corrected without a prior `DELETE`. Validation runs in order: tenant `404`,
mutability `409 TOURNAMENT_NOT_MUTABLE`, block identity against standings
recomputed at request time `409 TIE_BLOCK_MISMATCH`, then permutation of `1..n`
`422 INVALID_TIEBREAK_ORDER`. It returns the recomputed tables. `DELETE`
returns `204`.

Out of scope: qualification marking, cross-group comparison (D.4), retroactive
annulment after a second forfeit (D.3.2/D.3.3), and any materialized standings
table — every table is derived per request.
