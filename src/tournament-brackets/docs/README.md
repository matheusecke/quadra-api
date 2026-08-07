# Tournament brackets

Manual knockout structure: rounds, the slots inside them, and the existing
`TournamentTeam` registrations placed on each side of a slot. The bracket is
built by hand — nothing is seeded, derived, or advanced automatically.

## Routes

- `GET /tournaments/:id/bracket`
- `POST /tournaments/:id/bracket-rounds`
- `PATCH /tournament-bracket-rounds/:id`
- `DELETE /tournament-bracket-rounds/:id`
- `POST /tournament-bracket-slots`
- `PATCH /tournament-bracket-slots/:id`
- `DELETE /tournament-bracket-slots/:id`
- `POST /tournament-bracket-slots/:id/link-match`
- `DELETE /tournament-bracket-slots/:id/link-match`
- `PUT /tournament-bracket-slots/:id/winner`

The read accepts any active organization role and every tournament format and
status. All nine writes require `ORG_ADMIN`. Tenant scope comes from the JWT;
missing, deleted, and cross-tenant targets return `404`.

## Rules

- The read is unpaginated, accepts no query parameters, and returns `data` as
  an object: `{ "rounds": [...] }`. A tournament with no knockout stage returns
  `{ "rounds": [] }`.
- Rounds sort by `number`, then `id`; slots sort by `position`, then `id`. A
  round with no active slots is returned with `"slots": []`.
- Writes support `KNOCKOUT` and `GROUP_STAGE_KNOCKOUT`; `LEAGUE` and
  `GROUP_STAGE` return `INVALID_TOURNAMENT_FORMAT`.
- Writes support `DRAFT`, `REGISTRATION`, and `IN_PROGRESS`; `COMPLETED` and
  `CANCELLED` return `TOURNAMENT_NOT_MUTABLE`. `PUT /tournament-bracket-slots/:id/winner`
  is the single exception: it also accepts `COMPLETED`, because a winner write
  is what reopens a finished tournament. `CANCELLED` is closed on every write.
- Round `number` and slot `position` are client-supplied and required on
  create. Gaps are legal and nothing renumbers. `number` is unique among the
  tournament's active rounds and `position` among the round's active slots;
  both conflicts return `DUPLICATE_RECORD`.
- `label` is trimmed, 1–100 characters. Sending `null` clears it; omitting the
  key keeps the stored value. The same rule applies to both participants.
- A participant must be an active registration of the slot's own tournament:
  otherwise `404`, `INACTIVE_REGISTRATION`, or `INVALID_BRACKET_ASSIGNMENT`.
- A slot may not carry the same registration on both sides
  (`SAME_TEAM_IN_SLOT`), evaluated against the state resulting from the patch.
- One registration may occupy several slots, in the same or different rounds.
  This is deliberate and not validated — byes, corrections, and a third-place
  playoff are legitimate manual shapes.
- An empty `PATCH` body returns the current row unchanged.
- Writes return the flat persisted row, including `matchId` and
  `winnerTournamentTeamId`; only the composite read returns the enriched tree.
- In the composite read, `match` carries the linked match's `id`, `status`,
  `date` (`scheduled_at`), and both scores, or `null` when nothing is linked or
  the linked match was soft-deleted. `homeScore`/`awayScore` come from
  `match_teams.final_score` exactly as persisted — nothing is derived — and
  follow the **match's** `HOME`/`AWAY` sides, which are not required to align
  with the slot's `home`/`away`.
- A round must have no active slots before deletion (`ROUND_NOT_EMPTY`); a slot
  must have no linked match (`SLOT_HAS_MATCH`). Deletes set `isDeleted: true`
  and return `204 No Content`.
- Placing a registration in a slot makes `PATCH /tournament-teams/:id` reject
  `seed` edits for it with `REGISTRATION_IN_USE`. That guard already exists and
  is unchanged.

## Linking a match and recording the winner

- `POST /link-match` attaches an existing match and returns `200` with the flat
  slot row. The match must belong to the slot's tournament
  (`INVALID_BRACKET_ASSIGNMENT`), sit outside the group stage
  (`MATCH_IN_GROUP_STAGE`), not be `CANCELLED` (`MATCH_CANCELLED`), and not be
  linked to another slot (`MATCH_ALREADY_LINKED`). A slot that already holds a
  match returns `SLOT_HAS_MATCH` — linking never silently replaces.
  `SCHEDULED`, `LIVE`, `POSTPONED`, and `FINISHED` matches are all linkable.
  Two concurrent requests linking the same match to different slots race on
  the partial unique index on `matchId`; the loser's write fails with Prisma
  `P2002`, which is mapped to the same `MATCH_ALREADY_LINKED` response as the
  pre-check.

  Link validation and the slot write run in a Serializable transaction. Prisma
  `P2034` serialization conflicts retry up to three times after the first
  attempt; a fourth conflict returns `CONCURRENT_MODIFICATION`. Every retry
  re-reads the slot, match, current link, and participant pair.

- When the slot has **both** participants set, the match's active `match_teams`
  must be exactly those two registrations, compared as an unordered set;
  otherwise `MATCH_TEAMS_MISMATCH`. A bye slot or an undecided slot links with
  no check, and nothing is ever auto-filled from the match.
- The same unordered-pair check runs on
  `PATCH /tournament-bracket-slots/:id`. A patch containing either participant
  key uses the same Serializable retry path as match linking; position/label-only
  patches retain the existing bounded compare-and-set path.
- `DELETE /link-match` runs in a transaction and returns `204`. It only
  cancels the linked match if it is still `SCHEDULED`, `LIVE`, or `POSTPONED`,
  using a compare-and-set write; a `FINISHED` match cannot be unlinked
  (`MATCH_ALREADY_FINISHED`), and a match that changed status underneath the
  request (other than finishing) returns `CONCURRENT_MODIFICATION`. Only after
  the match state is settled does the slot's own link get cleared, again by
  compare-and-set against the match id read at the start of the request; a
  slot with no link returns `SLOT_HAS_NO_MATCH` (`404`), and a slot already
  relinked to a different match returns `SLOT_HAS_MATCH`.
- `PUT /winner` requires the key `winnerTournamentTeamId`; the value must be one
  of the slot participants or `null` to clear, otherwise `INVALID_SLOT_WINNER`.
  It is never cross-checked against a linked match's score — the winner of a
  slot and the result of a match are separate curated facts. Displacing a
  participant with `PATCH /tournament-bracket-slots/:id` does not auto-clear a
  winner recorded for the side being replaced; that stays the caller's
  responsibility.
- Writing the winner already stored is a `200` no-op: nothing is written and no
  cascade fires. Any real change runs inside a `Serializable` transaction, so a
  concurrent winner write and a concurrent tournament completion cannot both
  succeed against stale state: one of the two transactions aborts with Prisma
  `P2034` and is retried, up to three times, fully re-reading and
  re-validating the slot and tournament on every attempt. A fourth conflict
  returns `CONCURRENT_MODIFICATION`. A real winner change in a `COMPLETED`
  tournament reopens it in the same transaction (`status → IN_PROGRESS`,
  champion cleared). The response is the slot row and does not report the
  reopen; clients refetch the tournament. `POST /tournaments/:id/complete`
  uses the same `Serializable` retry so a concurrent winner write cannot
  crown a champion against a bracket state that no longer matches what was
  validated.
- `POST /link-match`, `DELETE /link-match`, and `PUT /winner` accept no query
  parameters; `DELETE /link-match` also accepts no request body. Any unknown
  key on any of the three is rejected with `400` by the global
  `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`).

The existing Prisma schema and partial unique indexes are reused unchanged.
