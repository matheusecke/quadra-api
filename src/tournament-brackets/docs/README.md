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

The read accepts any active organization role and every tournament format and
status. All six writes require `ORG_ADMIN`. Tenant scope comes from the JWT;
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
  `CANCELLED` return `TOURNAMENT_NOT_MUTABLE`.
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
- In the composite read, `match` is always `null` until Phase 7 links matches
  to slots. Team `name` is the registration snapshot; `shortName` is read live
  from the team catalog, which has no snapshot column.
- A round must have no active slots before deletion (`ROUND_NOT_EMPTY`); a slot
  must have no linked match (`SLOT_HAS_MATCH`). Deletes set `isDeleted: true`
  and return `204 No Content`.
- Placing a registration in a slot makes `PATCH /tournament-teams/:id` reject
  `seed` edits for it with `REGISTRATION_IN_USE`. That guard already exists and
  is unchanged.

The existing Prisma schema and partial unique indexes are reused unchanged.
