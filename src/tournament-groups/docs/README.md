# Tournament groups

Manual group-stage structure and assignment of existing `TournamentTeam`
registrations.

## Routes

- `GET /tournaments/:id/groups`
- `POST /tournaments/:id/groups`
- `PATCH /tournament-groups/:id`
- `DELETE /tournament-groups/:id`
- `GET /tournaments/:id/group-teams`
- `POST /tournament-group-teams`
- `DELETE /tournament-group-teams/:id`

All reads accept any active organization role. Writes require `ORG_ADMIN`.
Tenant scope comes from the JWT; missing, deleted, and cross-tenant targets
return `404`.

## Rules

- Lists are complete and unpaginated; no query parameters are accepted.
- Group writes support `GROUP_STAGE` and `GROUP_STAGE_KNOCKOUT`.
- Writes support `DRAFT`, `REGISTRATION`, and `IN_PROGRESS`; `COMPLETED` and
  `CANCELLED` return `TOURNAMENT_NOT_MUTABLE`.
- `sortOrder` is server-owned. Groups sort by order (null last), name, and id.
- Memberships sort by group id, tournament-team id, and id.
- An assignment requires an active registration from the same tournament.
- A registration has at most one active membership in a tournament.
- A group must have no active memberships before deletion.
- Deletes set `isDeleted: true` and return `204 No Content`.
- Moving a team is `DELETE` of the old membership followed by `POST`.

The existing Prisma schema and partial unique indexes are reused unchanged.
