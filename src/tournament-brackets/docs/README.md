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
- When the slot has **both** participants set, the match's active `match_teams`
  must be exactly those two registrations, compared as an unordered set;
  otherwise `MATCH_TEAMS_MISMATCH`. A bye slot or an undecided slot links with
  no check, and nothing is ever auto-filled from the match.
- The same check runs on `PATCH /tournament-bracket-slots/:id` whenever the
  resulting slot has both participants and a linked match, so the consistency
  cannot be defeated by patching after linking.
- `DELETE /link-match` returns `204` and, in the same transaction, cancels a
  `SCHEDULED`, `LIVE`, or `POSTPONED` match — a knockout match does not exist
  without a slot. A `CANCELLED` match is only unlinked; a `FINISHED` one
  returns `MATCH_ALREADY_FINISHED`; a slot with no link returns
  `SLOT_HAS_NO_MATCH` (`404`).
- `PUT /winner` requires the key `winnerTournamentTeamId`; the value must be one
  of the slot participants or `null` to clear, otherwise `INVALID_SLOT_WINNER`.
  It is never cross-checked against a linked match's score — the winner of a
  slot and the result of a match are separate curated facts.
- Writing the winner already stored is a `200` no-op: nothing is written and no
  cascade fires. Any real change in a `COMPLETED` tournament reopens it in the
  same transaction (`status → IN_PROGRESS`, champion cleared). The response is
  the slot row and does not report the reopen; clients refetch the tournament.

The existing Prisma schema and partial unique indexes are reused unchanged.
