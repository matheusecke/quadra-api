# Module: OrganizationUserAffiliations (`OrganizationUserAffiliationsModule`)

Manages the affiliation lifecycle between organizations and users. An organization invites a user with a specific role; the invited user accepts or rejects via a token-based handshake.

## Endpoints

| Method   | Path                                                 | Guards                                                | Purpose                                                                                                           |
| -------- | ---------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/organization-user-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)`             | Invite an `ORG_ADMIN` co-administrator to the active JWT organization; returns affiliation + raw `inviteToken`    |
| `POST`   | `/teams/:teamId/organization-user-affiliations`      | `JwtAuthGuard`, `OrgRoleGuard(TEAM_ADMIN)`            | Invite an `ATHLETE`/`COACHING_STAFF` member to `:teamId`; restricted to the caller's own actively affiliated team |
| `GET`    | `/organization-user-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Paginated list in the active JWT organization; filters: `status`, `role`, `teamId`, `q`, `inviteExpired`          |
| `GET`    | `/organization-user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)`             | Get single affiliation in the active JWT organization                                                             |
| `POST`   | `/organization-user-affiliations/invite-response`    | `JwtAuthGuard`                                        | Accept or reject invite by raw token (only the invited user); legacy/compatibility path                           |
| `PATCH`  | `/organization-user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(TEAM_ADMIN)`            | Update `jerseyNumber`/`position` of an `ACTIVE` `ATHLETE`/`COACHING_STAFF` on the caller's own team               |
| `PATCH`  | `/organizations/:orgId/user-affiliations/:id/status` | `JwtAuthGuard`, `SystemAdminGuard`                    | Override status (system admin only)                                                                               |
| `POST`   | `/organization-user-affiliations/:id/resend`         | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Regenerate and resend one `PENDING` invite the caller can manage                                                  |
| `DELETE` | `/organization-user-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Cancel one `PENDING` invite the caller can manage                                                                 |
| `POST`   | `/organization-user-affiliations/:id/deactivate`     | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Move an `ACTIVE` affiliation the caller can manage to `INACTIVE`                                                  |
| `POST`   | `/organization-user-affiliations/:id/activate`       | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Move an `INACTIVE` affiliation the caller can manage back to `ACTIVE`                                             |

Paginated routes use `PaginationInterceptor` — see [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

For org-admin routes in this module, the active organization comes only from `@CurrentUser().organizationId`. Controllers translate that JWT value into the numeric `orgId` argument expected by the service. The only route that still keeps an explicit `:orgId` is the system-admin status override endpoint.

## Business Rules

### Invite creation (two contracts)

1. `POST /organization-user-affiliations` (`ORG_ADMIN` only) — body `{ userId }` (`CreateUserAffiliationDto`). Always creates a `PENDING` `ORG_ADMIN` affiliation with `teamId: null`.
2. `POST /teams/:teamId/organization-user-affiliations` (`TEAM_ADMIN` only) — body `{ userId, role: ATHLETE | COACHING_STAFF, jerseyNumber?, position? }` (`CreateTeamMemberAffiliationDto`). The caller must hold an `ACTIVE` `TEAM_ADMIN` affiliation on `:teamId` itself, otherwise `403 You can only manage users from your own team`. `:teamId`'s `OrganizationTeamAffiliation` must be `ACTIVE`, otherwise `422 Team affiliation is inactive; activate it before inviting users`. `role: ATHLETE` requires both `jerseyNumber` and `position`, otherwise `400 Athlete jerseyNumber and position are required`.

Both share `createPendingInvite` (`OrganizationUserAffiliationsService`, also used by team onboarding — see [OrganizationTeamAffiliations](../../organization-team-affiliations/docs/README.md)):

- The invited user must exist, be non-deleted, and `status: ACTIVE`, otherwise `404 User not found`.
- An existing `ACTIVE` affiliation for that user in the org → `409 User already has an active affiliation`. An existing `PENDING` one → `409 User already has a pending invite`.
- Any existing `INACTIVE` affiliation for that user/org is soft-deleted first, so the new `PENDING` row becomes the sole live row.
- A raw 64-char hex token is returned once (`AffiliationToken.generate()`); only its SHA-256 hash is persisted, in `inviteToken`.
- Runs inside a `Serializable` transaction with up to 3 retries on `P2034`; a lost race surfaces as `409 CONCURRENT_MODIFICATION`.

### Invite response

`POST /organization-user-affiliations/invite-response` is the raw-token path, kept for compatibility. The canonical frontend path is `POST /auth/invites/:id/respond` (id-based, no token in the body) — see [auth docs](../../auth/docs/README.md). Both funnel into the same `transitionUserInvite` transition.

### Ownership check on invite-response

For the raw-token path, only the user whose `userId` matches the affiliation's `userId` may respond; any other JWT returns `403 You can only respond to your own invites`. The id-based `/auth/invites/:id/respond` path is already scoped to the caller by construction (it only ever looks up the caller's own pending invites).

### Invite response transition rules

- Affiliation must currently be `PENDING`, otherwise `422 Invite is no longer pending`.
- `ACCEPT` on an expired invite (`inviteExpiresAt < now`) → `422 Invite has expired`. `REJECT` is allowed regardless of expiry.
- `ACCEPT` on a team-scoped role additionally requires a usable team affiliation: `ACTIVE` for `ATHLETE`/`COACHING_STAFF`, `PENDING` or `ACTIVE` for `TEAM_ADMIN` — otherwise `422 Team affiliation is inactive; activate it before inviting users`. Accepting a `TEAM_ADMIN` invite while its team affiliation is still `PENDING` activates that team affiliation in the same transaction (the second step of composite team onboarding).
- `ACCEPT` → `status: ACTIVE`, `inviteToken`/`inviteExpiresAt` cleared. `REJECT` → soft delete, same fields cleared.
- Rejecting a `TEAM_ADMIN` invite runs the B1 team-closing cascade if it was the last pending admin invite for that team (see [DATABASE.md](../../../docs/DATABASE.md)).

### List (`GET /organization-user-affiliations`)

- `ORG_ADMIN`: sees every affiliation in the organization; `canManage` is `true` for every row except the actor's own.
- `TEAM_ADMIN`: forced to their own actively affiliated team — no qualifying own `TEAM_ADMIN` affiliation → `403 You can only manage users from your own team`. `canManage` is `true` only for `ATHLETE`/`COACHING_STAFF` rows on that same team.
- Filters: `status`, `role`, `teamId`, `q` (name/email, case-insensitive), `inviteExpired` (when `true`, overrides `status` and returns only `PENDING` rows whose `inviteExpiresAt` has passed).
- Each row is a `UserAffiliationListItemDto`: the full affiliation plus derived `isInviteExpired` and `canManage`.

### Resend / cancel (individual)

Both act on exactly one affiliation the caller can manage (see restrictions below):

- `POST /organization-user-affiliations/:id/resend`: target must be `PENDING`, otherwise `422 Affiliation must be PENDING to resend`. Rotates token/expiry in place and returns the new raw token.
- `DELETE /organization-user-affiliations/:id`: target must be `PENDING`, otherwise `422 Affiliation must be PENDING to cancel`. Soft-deletes the invite; if it was the last pending `TEAM_ADMIN` invite for its team, runs the same B1 cascade as a rejection (see [DATABASE.md](../../../docs/DATABASE.md)).

### Explicit activate / deactivate

- `POST /organization-user-affiliations/:id/deactivate`: target must be `ACTIVE`, otherwise `422 Affiliation must be ACTIVE to deactivate`. Flips `status` to `INACTIVE` on the same row — see [DATABASE.md](../../../docs/DATABASE.md) for why it is the same row rather than a new one.
- `POST /organization-user-affiliations/:id/activate`: target must be `INACTIVE`, otherwise `422 Affiliation must be INACTIVE to activate`. For a team-scoped affiliation, the team's `OrganizationTeamAffiliation` must be `ACTIVE`, otherwise `422 Team affiliation is inactive; activate it before inviting users`. Also re-checks for a conflicting live `ACTIVE` affiliation for the same user/org, otherwise `409 User already has an active affiliation`.

### Update (`PATCH /organization-user-affiliations/:id`)

- `TEAM_ADMIN` only. Editable fields: `jerseyNumber`, `position` — at least one is required, otherwise `400`. Role and `teamId` are **not** editable through this endpoint.
- Target must be `ACTIVE` and manageable by the caller (see restrictions below), otherwise `404 Affiliation not found`.
- Re-validates that an `ATHLETE` row keeps both `jerseyNumber` and `position` non-null after the change, otherwise `400 Athlete jerseyNumber and position are required`.

### Self / co-admin management restrictions

Shared by update, resend, cancel, deactivate, and activate (`assertCanManage`):

- `ORG_ADMIN` actor: can manage any affiliation **except their own `ORG_ADMIN` row** — acting on it returns `403 You cannot change your own organization administrator affiliation`.
- `TEAM_ADMIN` actor: must hold an `ACTIVE` `TEAM_ADMIN` affiliation on that exact team (team globally `ACTIVE`, its org link `ACTIVE`); the target must be on that same team and be `ATHLETE` or `COACHING_STAFF`. Anything else — a different team, an `ORG_ADMIN`/`TEAM_ADMIN` target, or no qualifying own-team affiliation — returns `403 You can only manage users from your own team`.

### Self-removal prevention

An `ORG_ADMIN` cannot cancel, deactivate, or resend their own `ORG_ADMIN` affiliation — see restrictions above. System admins bypass this restriction via the platform status-override endpoint.

### Token lifecycle

Same as [OrganizationTeamAffiliations](../../organization-team-affiliations/docs/README.md): `AffiliationToken.generate()`, 7-day default expiry, SHA-256 hash stored, raw returned once.

### Auth integration

`auth.service.ts` scopes all `OrganizationUserAffiliation` queries to `status: ACTIVE`, and — for non-`ORG_ADMIN` roles — additionally requires the affiliated team to be globally `ACTIVE`, non-deleted, and hold an `ACTIVE` `OrganizationTeamAffiliation` with that same organization. `PENDING` and `INACTIVE` affiliations are invisible to the auth flow (login, `GET /auth/org`, `POST /auth/org`, refresh).

PENDING affiliations also back the current-user invite inbox under `/auth/invites`. `GET /auth/invites` and `POST /auth/invites/:id/respond` expose PENDING rows to the invited user via `AuthService` delegation to `OrganizationUserAffiliationsService.findPendingInvitesForUser` and `respondToInviteForUser`. These methods do not require org context in the JWT.
