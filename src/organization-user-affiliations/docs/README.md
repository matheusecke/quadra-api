# Module: OrganizationUserAffiliations (`OrganizationUserAffiliationsModule`)

Manages the affiliation lifecycle between organizations and users. An organization invites a user with a specific role; the invited user accepts or rejects via a token-based handshake.

## Endpoints

| Method   | Path                                                 | Guards                                    | Purpose                                                                               |
| -------- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST`   | `/organization-user-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Invite a user in the active JWT organization; returns affiliation + raw `inviteToken` |
| `GET`    | `/organization-user-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Paginated list in the active JWT organization; filters: `status`, `role`, `teamId`    |
| `GET`    | `/organization-user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Get single affiliation in the active JWT organization                                 |
| `POST`   | `/organization-user-affiliations/invite-response`    | `JwtAuthGuard`                            | Accept or reject invite (only the invited user)                                       |
| `PATCH`  | `/organization-user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Update role, teamId, or jerseyNumber (ACTIVE only) in the active JWT organization     |
| `PATCH`  | `/organizations/:orgId/user-affiliations/:id/status` | `JwtAuthGuard`, `SystemAdminGuard`        | Override status (system admin only)                                                   |
| `POST`   | `/organization-user-affiliations/:id/resend`         | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Regenerate and resend invite token in the active JWT organization                     |
| `DELETE` | `/organization-user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Soft delete in the active JWT organization; cannot remove own affiliation             |

Paginated routes use `PaginationInterceptor` — see [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

For org-admin routes in this module, the active organization comes only from `@CurrentUser().organizationId`. Controllers translate that JWT value into the numeric `orgId` argument expected by the service. The only route that still keeps an explicit `:orgId` is the system-admin status override endpoint.

## Business Rules

### Invite flow

1. ORG_ADMIN calls `POST /organization-user-affiliations` with `{ userId, role, teamId?, jerseyNumber? }` while authenticated in the target organization context.
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

### Update (`PATCH /organization-user-affiliations/:id`)

- Only ACTIVE affiliations can be updated.
- Role/teamId consistency is re-validated after applying the change.
- Switching to `ORG_ADMIN` automatically clears `teamId` and `jerseyNumber`.

### Self-removal prevention

An ORG_ADMIN cannot soft-delete their own affiliation (returns `422 UNPROCESSABLE`). System admins bypass this restriction.

### Token lifecycle

Same as [OrganizationTeamAffiliations](../../organization-team-affiliations/docs/README.md): `AffiliationToken.generate()`, 7-day default expiry, SHA-256 hash stored, raw returned once.

### Auth integration

`auth.service.ts` scopes all `OrganizationUserAffiliation` queries to `status: ACTIVE`. PENDING affiliations are invisible to the auth flow (login, `GET /auth/org`, `POST /auth/org`, refresh).

PENDING affiliations also back the current-user invite inbox under `/auth/invites`. `GET /auth/invites` and `POST /auth/invites/:id/respond` expose PENDING rows to the invited user via `AuthService` delegation to `OrganizationUserAffiliationsService.findPendingInvitesForUser` and `respondToInviteForUser`. These methods do not require org context in the JWT.
