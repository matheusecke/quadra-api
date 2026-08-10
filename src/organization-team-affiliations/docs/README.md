# Module: OrganizationTeamAffiliations (`OrganizationTeamAffiliationsModule`)

Manages the affiliation lifecycle between organizations and teams. An organization invites a team; the team accepts or rejects via a token-based handshake.

## Endpoints

| Method   | Path                                                 | Guards                                    | Purpose                                                                                                                      |
| -------- | ---------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/organization-team-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Create or reuse a team affiliation and invite one `TEAM_ADMIN`; returns affiliation + user invite bundle + raw `inviteToken` |
| `GET`    | `/organization-team-affiliations`                    | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Paginated list in the active JWT organization; filters: `status`, `q`, `inviteExpired`                                       |
| `GET`    | `/organization-team-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Get single affiliation in the active JWT organization                                                                        |
| `POST`   | `/organization-team-affiliations/invite-response`    | `JwtAuthGuard`                            | Accept or reject invite via token; independent legacy flow (no composite side effects)                                       |
| `POST`   | `/organization-team-affiliations/:id/resend`         | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Rotate **every** pending `TEAM_ADMIN` invite for the affiliation's team                                                      |
| `PATCH`  | `/organizations/:orgId/team-affiliations/:id/status` | `JwtAuthGuard`, `SystemAdminGuard`        | Override status (system admin only)                                                                                          |
| `DELETE` | `/organization-team-affiliations/:id`                | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Cancel one `PENDING` team onboarding; cascades to pending admin invites and B1                                               |
| `POST`   | `/organization-team-affiliations/:id/deactivate`     | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Move an `ACTIVE` affiliation to `INACTIVE`; cascades to member affiliations                                                  |
| `POST`   | `/organization-team-affiliations/:id/activate`       | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN)` | Move an `INACTIVE` affiliation back to `ACTIVE`                                                                              |
| `GET`    | `/teams/:teamId/affiliations`                        | `JwtAuthGuard`, `SystemAdminGuard`        | Paginated list of org affiliations for a team (system admin only)                                                            |

Paginated routes use `PaginationInterceptor` — see [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

For org-admin routes in this module, the active organization comes only from `@CurrentUser().organizationId`. Controllers translate that JWT value into the numeric `orgId` argument expected by the service. The explicit `:orgId` route remains only on the system-admin status override endpoint. `GET /teams/:teamId/affiliations` is a cross-tenant global lookup, not an active-org endpoint, so it requires `SystemAdminGuard` instead of an organization role. Its rename to `/teams/:teamId/organization-team-affiliations` remains pending in `docs/roadmaps-decisions.md`, item 1.

## Business Rules

### Composite team onboarding (`POST /organization-team-affiliations`)

Body (`CreateTeamAffiliationDto`): exactly one of `teamId` or `teamName`, plus `adminUserId` — otherwise `400 Exactly one of teamId or teamName is required`. One call does both:

1. **Resolve the team.** `teamName` creates a brand-new globally `ACTIVE` `Team` (slug and a derived `shortName` — up to 3 letters from initial words); a duplicate slug returns `409 A team with this name already exists.`. `teamId` looks up an existing globally `ACTIVE`, non-deleted team; missing/inactive → `404 Team not found`.
2. **Create or reuse the team affiliation.** If the team has no live `OrganizationTeamAffiliation` with this organization, one is created as `PENDING`. If it already has one: reusing a `PENDING` or `ACTIVE` row is allowed (a second admin can be invited onto an already-onboarded team); an `INACTIVE` row is not reusable here — `422 Team affiliation is inactive; activate it before inviting users` (deactivate/activate is a separate, explicit step). No new team invite token is issued at this step, and there is no second team-level acceptance step — the team side has already been decided (new `PENDING`, or an existing `PENDING`/`ACTIVE` reused as-is).
3. **Invite the `TEAM_ADMIN`.** Delegates to `OrganizationUserAffiliationsService.createPendingInvite` inside the same `Serializable` transaction (see [OrganizationUserAffiliations](../../organization-user-affiliations/docs/README.md) for its validation and error set — invited-user existence/status, duplicate `ACTIVE`/`PENDING` affiliation, `INACTIVE`-row cleanup, raw-token issuance).

The team side becomes `ACTIVE` only when the invited `TEAM_ADMIN` accepts (see [OrganizationUserAffiliations — invite response transition rules](../../organization-user-affiliations/docs/README.md)), which is why a `PENDING` team affiliation can be reused for a second admin invite without itself changing status.

### Invite response (legacy/independent path)

`POST /organization-team-affiliations/invite-response` responds to a **team**-level invite token directly — distinct from, and independent of, the user-level `TEAM_ADMIN` invite created above. It has no composite side effects on any `OrganizationUserAffiliation`.

1. Looks up the affiliation by hashed token; missing → `404 Invite not found`.
2. Must be `PENDING`, otherwise `422 Invite is no longer pending`; must not be expired, otherwise `422 Invite has expired`.
3. `ACCEPT` → status becomes `ACTIVE`, `inviteToken` and `inviteExpiresAt` are cleared.
4. `REJECT` → soft delete (`isDeleted: true`), token fields cleared. This legacy path does **not** run the B1 cascade or touch any `OrganizationUserAffiliation` — only the explicit cancel and user-invite-rejection paths do (see [DATABASE.md](../../../docs/DATABASE.md)).

### List (`GET /organization-team-affiliations`)

Filters: `status`, `q` (team name, case-insensitive), `inviteExpired` (overrides `status`, returns only `PENDING` rows past `inviteExpiresAt`). Each row (`TeamAffiliationListItemDto`) adds `activeUserCount` (members with `status: ACTIVE`) and `pendingAdminInviteCount` (`PENDING` `TEAM_ADMIN` invites) alongside the base affiliation fields.

### Resend (collective)

`POST /organization-team-affiliations/:id/resend` differs from the user-affiliation resend: it is not one invite but **every** `PENDING` `TEAM_ADMIN` `OrganizationUserAffiliation` for the affiliation's team, rotated in the same transaction. Requires the team affiliation itself to be `PENDING`, otherwise `422 Team affiliation must be PENDING to resend invites`. Returns a `TeamAdminInvitesBundleDto` (`invites[]`, one raw token per rotated admin invite) — not a single-affiliation response.

### Cancel (`DELETE /organization-team-affiliations/:id`)

Requires the team affiliation to be `PENDING`, otherwise `422 Team affiliation must be PENDING to cancel`. Soft-deletes every `PENDING` `TEAM_ADMIN` user affiliation for the team, soft-deletes the team affiliation itself, then runs B1: if the team has no other affiliation history at all, the global `Team` is soft-deleted too (see [DATABASE.md](../../../docs/DATABASE.md)).

### Explicit activate / deactivate

- `POST /organization-team-affiliations/:id/deactivate`: requires `ACTIVE`, otherwise `422 Team affiliation must be ACTIVE to deactivate`. Flips `status` to `INACTIVE` on the same row, then cascades: every `ACTIVE` `OrganizationUserAffiliation` on the team is set to `INACTIVE`, and every `PENDING` one is soft-deleted (invites cancelled outright, not left dangling against an inactive team).
- `POST /organization-team-affiliations/:id/activate`: requires `INACTIVE`, otherwise `422 Team affiliation must be INACTIVE to activate`. Also requires the global `Team` to still be `ACTIVE` and non-deleted, otherwise `404 Team not found`. Flips `status` back to `ACTIVE` on the same row; member affiliations are **not** auto-reactivated — each was individually cancelled or deactivated and needs its own explicit `activate` or a fresh invite.

### Token lifecycle

- Generated via `AffiliationToken.generate()` (`src/common/utils/affiliation-token.util.ts`): `crypto.randomBytes(32)` → 64-char hex.
- Default expiry: **7 days** (configurable via `INVITE_TOKEN_EXPIRES_DAYS` env var).
- Hash stored: SHA-256 via `createHash('sha256')`.
- Raw token returned **once** at creation and once on resend — never stored.

### Status transitions

| From     | Action          | To                          |
| -------- | --------------- | --------------------------- |
| —        | create/reuse    | PENDING or ACTIVE (reused)  |
| PENDING  | invite ACCEPT   | ACTIVE                      |
| PENDING  | invite REJECT   | deleted                     |
| PENDING  | cancel          | deleted (+ B1)              |
| ACTIVE   | deactivate      | INACTIVE (+ member cascade) |
| INACTIVE | activate        | ACTIVE                      |
| any      | status override | any                         |

### Duplicate prevention

A partial unique index on `(organization_id, team_id) WHERE is_deleted = false` allows only one **live** affiliation row per team/organization regardless of status — this is why deactivate/activate reuse the same row (see [DATABASE.md](../../../docs/DATABASE.md)). The service also checks status before creating/reusing (step 2 above) before relying on the index for the true race case (`409` on `P2002`).

## Token expiry check order

`respondToInvite` checks status before expiry: a PENDING-but-expired invite returns `422 UNPROCESSABLE`; an ACTIVE invite also returns `422 UNPROCESSABLE` (already responded).
