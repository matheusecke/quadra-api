# Module: OrganizationUserAffiliations (`OrganizationUserAffiliationsModule`)

Manages the affiliation lifecycle between organizations and users. An organization invites a user with a specific role; the invited user accepts or rejects via a token-based handshake.

## Endpoints

| Method   | Path                                                         | Guards                               | Purpose |
| -------- | ------------------------------------------------------------ | ------------------------------------ | ------- |
| `POST`   | `/organizations/:orgId/user-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Invite a user; returns affiliation + raw `inviteToken` |
| `GET`    | `/organizations/:orgId/user-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Paginated list; filters: `status`, `role`, `teamId` |
| `GET`    | `/organizations/:orgId/user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Get single affiliation |
| `POST`   | `/organization-user-affiliations/invite-response`            | `JwtAuthGuard`                       | Accept or reject invite (only the invited user) |
| `PATCH`  | `/organizations/:orgId/user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Update role, teamId, or jerseyNumber (ACTIVE only) |
| `PATCH`  | `/organizations/:orgId/user-affiliations/:id/status`         | `JwtAuthGuard`, `SystemAdminGuard`   | Override status (system admin only) |
| `POST`   | `/organizations/:orgId/user-affiliations/:id/resend`         | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Regenerate and resend invite token |
| `DELETE` | `/organizations/:orgId/user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Soft delete; cannot remove own affiliation |

Paginated routes use `PaginationInterceptor` — see [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Business Rules

### Invite flow
1. ORG_ADMIN calls `POST /organizations/:orgId/user-affiliations` with `{ userId, role, teamId?, jerseyNumber? }`.
2. Service validates the invited user exists and is ACTIVE.
3. If the user already has a PENDING or ACTIVE affiliation in that org, `409 CONFLICT` is returned.
4. Role/teamId consistency is enforced:
   - `ORG_ADMIN`: `teamId` must be absent.
   - All other roles (`TEAM_ADMIN`, `ATHLETE`, `COACHING_STAFF`): `teamId` is required and the team must have an ACTIVE affiliation with the org.
5. Raw 64-char hex token returned once; SHA-256 hash stored.
6. The invited user (identified by JWT `sub`) submits the token to `POST /organization-user-affiliations/invite-response`.
7. ACCEPT → status `ACTIVE`, token fields cleared.
8. REJECT → soft delete, token fields cleared.

### Ownership check on invite-response
Only the user whose `userId` matches `aff.userId` may respond. Any other JWT returns `403 FORBIDDEN`.

### Update (`PATCH /organizations/:orgId/user-affiliations/:id`)
- Only ACTIVE affiliations can be updated.
- Role/teamId consistency is re-validated after applying the change.
- Switching to `ORG_ADMIN` automatically clears `teamId` and `jerseyNumber`.

### Self-removal prevention
An ORG_ADMIN cannot soft-delete their own affiliation (returns `422 UNPROCESSABLE`). System admins bypass this restriction.

### Token lifecycle
Same as [OrganizationTeamAffiliations](../../organization-team-affiliations/docs/README.md): `AffiliationToken.generate()`, 7-day default expiry, SHA-256 hash stored, raw returned once.

### Auth integration
`auth.service.ts` scopes all `OrganizationUserAffiliation` queries to `status: ACTIVE`. PENDING affiliations are invisible to the auth flow (login, `GET /auth/org`, `POST /auth/org`, refresh).
