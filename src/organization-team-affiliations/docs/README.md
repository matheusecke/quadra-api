# Module: OrganizationTeamAffiliations (`OrganizationTeamAffiliationsModule`)

Manages the affiliation lifecycle between organizations and teams. An organization invites a team; the team accepts or rejects via a token-based handshake.

## Endpoints

| Method   | Path                                                         | Guards                               | Purpose |
| -------- | ------------------------------------------------------------ | ------------------------------------ | ------- |
| `POST`   | `/organizations/:orgId/team-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Invite a team; returns affiliation + raw `inviteToken` |
| `GET`    | `/organizations/:orgId/team-affiliations`                    | `JwtAuthGuard`                       | Paginated list; filter by `status` |
| `GET`    | `/organizations/:orgId/team-affiliations/:id`                | `JwtAuthGuard`                       | Get single affiliation |
| `POST`   | `/organization-team-affiliations/invite-response`            | `JwtAuthGuard`                       | Accept or reject invite via token |
| `POST`   | `/organizations/:orgId/team-affiliations/:id/resend`         | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Regenerate and resend invite token |
| `PATCH`  | `/organizations/:orgId/team-affiliations/:id/status`         | `JwtAuthGuard`, `SystemAdminGuard`   | Override status (system admin only) |
| `DELETE` | `/organizations/:orgId/team-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Soft delete |
| `GET`    | `/teams/:teamId/affiliations`                                | `JwtAuthGuard`                       | Paginated list of org affiliations for a team |

Paginated routes use `PaginationInterceptor` — see [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Business Rules

### Invite flow
1. ORG_ADMIN calls `POST /organizations/:orgId/team-affiliations` with `{ teamId }`.
2. Service validates the team exists and is not soft-deleted.
3. If the team already has a PENDING or ACTIVE affiliation with that org, `409 CONFLICT` is returned.
4. A raw 64-char hex token is returned once. Its SHA-256 hash is stored in `inviteToken`; the raw token is never stored.
5. An authenticated user (typically a team admin) submits the raw token to `POST /organization-team-affiliations/invite-response` with `decision: ACCEPT | REJECT`.
6. ACCEPT → status becomes `ACTIVE`, `inviteToken` and `inviteExpiresAt` are cleared.
7. REJECT → soft delete (`isDeleted: true`), token fields cleared.

### Token lifecycle
- Generated via `AffiliationToken.generate()` (`src/common/utils/affiliation-token.util.ts`): `crypto.randomBytes(32)` → 64-char hex.
- Default expiry: **7 days** (configurable via `INVITE_TOKEN_EXPIRES_DAYS` env var).
- Hash stored: SHA-256 via `createHash('sha256')`.
- Raw token returned **once** at creation and once on resend — never stored.

### Status transitions
| From    | Action         | To       |
| ------- | -------------- | -------- |
| PENDING | ACCEPT         | ACTIVE   |
| PENDING | REJECT         | deleted  |
| any     | status override| any      |

### Duplicate prevention
A partial unique index on `(organization_id, team_id) WHERE is_deleted = false` prevents duplicate active affiliations at the database level. The service also checks for PENDING/ACTIVE duplicates before creating.

## Token expiry check order
`respondToInvite` checks status before expiry: a PENDING-but-expired invite returns `422 UNPROCESSABLE`; an ACTIVE invite also returns `422 UNPROCESSABLE` (already responded).
