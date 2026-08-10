# Module: Auth (`AuthModule`)

Session and identity entrypoints: JWT access tokens, opaque refresh tokens in `httpOnly` cookies, org context on the JWT, guards and decorators for other modules.

## Components

- `AuthController` / `AuthService`
- `JwtStrategy` + `JwtAuthGuard`
- `OrgRoleGuard` — requires `@OrgRoles(...)` on handlers that use it
- `SystemAdminGuard` — requires `@SystemAdmin()` where used
- Decorators: `@CurrentUser()`, `@OrgRoles()`, `@SystemAdmin()`
- JWT payload type: `src/auth/interfaces/jwt-payload.interface.ts` — `OrgRole` is the Prisma-generated enum from `@prisma/client` (same type as in the schema).

```ts
import type { OrgRole } from '@prisma/client';

interface JwtPayload {
  sub: number;
  email: string;
  isSystemAdmin: boolean;
  organizationId: number | null;
  role: OrgRole | null;
}
```

**`OrgRole` values (from `@prisma/client`):** `ORG_ADMIN`, `TEAM_ADMIN`, `ATHLETE`, `COACHING_STAFF` — use as `OrgRole.ORG_ADMIN`, etc. Session-scoped in the JWT, not a global profile role.

## Endpoints

| Method | Path                        | Auth   | Purpose                                                                                                                                                                                                          |
| ------ | --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/register`            | —      | Creates an `ACTIVE` non-system-admin user with `email`, `name`, `password`, required `birthDate`, and optional nullable `heightCm`; returns `accessToken`; stores hashed refresh token and sets `httpOnly` cookie |
| `POST` | `/auth/login`               | —      | Authenticates; returns `accessToken`; refresh cookie                                                                                                                                                             |
| `POST` | `/auth/refresh`             | Cookie | Rotates refresh token; new `accessToken`; preserves org context when still valid                                                                                                                                 |
| `POST` | `/auth/logout`              | Cookie | Revokes current refresh token and clears cookie (no bearer required)                                                                                                                                             |
| `GET`  | `/auth/me`                  | Bearer | Current user and session context                                                                                                                                                                                 |
| `GET`  | `/auth/org`                 | Bearer | User’s organization affiliations; optional `name` query filters organization names                                                                                                                               |
| `POST` | `/auth/org`                 | Bearer | Chooses organization; rotates refresh with org context; org-scoped JWT                                                                                                                                           |
| `POST` | `/auth/change-password`     | Bearer | Changes password; revokes active refresh tokens                                                                                                                                                                  |
| `GET`  | `/auth/invites`             | Bearer | Lists pending invites for the current user; no active org context required                                                                                                                                       |
| `POST` | `/auth/invites/:id/respond` | Bearer | Accepts or rejects a pending invite for the current user; no active org context required                                                                                                                         |

Rate limiting is enforced globally (`ThrottlerGuard` in `src/app.module.ts`). Register, login, refresh, choose-org, and change-password use **stricter** `@Throttle` limits than the global default. See [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md#rate-limiting).

## Current-user invite inbox

`GET /auth/invites` and `POST /auth/invites/:id/respond` require only a Bearer JWT and do not require active organization context. `organizationId` and `role` in the token are ignored for these endpoints. They list and act on `organization_user_affiliations` rows with `status = PENDING` that belong to the current user. Expired invites (`inviteExpiresAt < now`) appear in the listing with `isExpired: true`; accepting an expired invite returns `422`; rejecting one is allowed. These endpoints never expose `inviteToken`.

## Register profile fields

`POST /auth/register` accepts `birthDate` as a required date-only string (`YYYY-MM-DD`) and `heightCm` as an optional nullable integer in centimeters. `birthDate` must be a real past date within the last 120 years (`IsBirthDate`, `src/common/validators/is-birth-date.validator.ts`) and is persisted as PostgreSQL `DATE`; `heightCm` is persisted as `users.height_cm`. Request bodies use camelCase across the whole API — snake_case is a database column convention only.

## Session and refresh token

- Access token: short-lived JWT (`JwtModule` / env).
- Refresh token: opaque, sent as `httpOnly` cookie; stored hashed in `refresh_tokens` (see [DATABASE.md](../../../docs/DATABASE.md)).
- `refresh_tokens.organization_id` optionally pins org; `role` is not stored on the row and is resolved from active affiliation on refresh.
- Each `POST /auth/refresh` rotates the refresh token.
- `POST /auth/org` also rotates the refresh token to bind the session to the chosen org.
- Logout revokes the cookie’s token; password change revokes all active refresh tokens for the user.
- Login and refresh require `ACTIVE` user and not soft-deleted.
- Login, org listing, org choice, and org-scoped refresh only consider active, non-deleted affiliations, organizations, and teams.
- If org-scoped refresh finds org/affiliation/team no longer valid, the backend rotates session back to global context instead of failing the user (global refresh fallback — `organizationId: null`, `role: null`, no error).
- Refresh tokens are also revoked on email change, user deactivation, system-admin flag changes, and user soft delete (see `AuthService` / `UsersService` coordination).

### What counts as a usable organization affiliation

`AuthService.findUsableOrgAffiliations` is the single query behind login, `GET /auth/org`, `POST /auth/org`, and org-scoped refresh. A row only counts as usable when:

- `status: ACTIVE`, non-deleted, on the `OrganizationUserAffiliation` itself;
- the user is non-deleted and `status: ACTIVE`;
- the organization is non-deleted and `status: ACTIVE`;
- for `role: ORG_ADMIN`, `teamId` must be `null`;
- for every other role (`TEAM_ADMIN`, `ATHLETE`, `COACHING_STAFF`), the affiliated `Team` must be non-deleted, globally `status: ACTIVE`, **and** hold an `ACTIVE`, non-deleted `OrganizationTeamAffiliation` with that same organization.

`AffiliationStatus.PENDING` and `AffiliationStatus.INACTIVE` rows are never usable — including a `TEAM_ADMIN`/`ATHLETE`/`COACHING_STAFF` row that is itself `ACTIVE` but whose team's organization affiliation has been deactivated. This is the hardening this plan adds: a team going `INACTIVE` at the organization level now transitively locks out org-context selection for its members, without touching their own `OrganizationUserAffiliation.status`.

### JWT claims are unchanged

`JwtPayload` still carries only `sub`, `email`, `isSystemAdmin`, `organizationId`, `role` — no `teamId` claim was added. Team-scoped authorization (own-team checks in `TeamsModule` and `OrganizationUserAffiliationsService`) derives the actor's current team from a live `OrganizationUserAffiliation` query at request time instead of trusting a JWT claim, precisely because the JWT has no team context and is not re-issued when a team affiliation changes.

### Already-issued token TTL window

An organization JWT already issued before a team affiliation is deactivated (or the user's own affiliation is deactivated) remains usable for the rest of its configured lifetime — 15 minutes by default (`JWT_EXPIRES_IN`). There is no per-request database revalidation, denylisting, or session versioning. The next `POST /auth/refresh` (or a fresh `POST /auth/org`) is what re-evaluates usability and either preserves org context or falls back to global context; until then, guards continue to trust the token's `organizationId`/`role` claims as issued.

## Authorization layers

**`OrgRoleGuard`** — org-scoped operations; reads `role` from JWT and checks `@OrgRoles(...)`. Pass **`OrgRole` enum members** from `@prisma/client`, not string literals (TypeScript and the decorator signature require `OrgRole`).

Handlers protected by `@OrgRoles(...)` must run inside an active organization context. `OrgRoleGuard` rejects JWTs with `organizationId: null` with `403 FORBIDDEN` and `Active organization context required.`.

```typescript
import { OrgRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, OrgRoleGuard)
@OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
```

For org-scoped endpoints, use this contract consistently:

- Guard with `JwtAuthGuard` plus `OrgRoleGuard` and declare the allowed org roles with `@OrgRoles(...)`.
- Read the full JWT payload in the controller with `@CurrentUser() user: JwtPayload`.
- Treat `user.organizationId` as the single source of truth for organization scope.
- Do not accept `orgId` or `organizationId` in route params, query params, or request body only to decide active org scope.
- Keep resource ids in routes only when they identify the resource itself, such as `/organizations/:id`, system-admin overrides, or global lookup endpoints.
- Controllers may still pass a numeric `orgId` into services; the controller is responsible for translating JWT session context into that service argument.
- Do not create shared org-scope helpers unless real duplication emerges beyond straightforward controller usage.

**`SystemAdminGuard`** — platform-level operations; reads `isSystemAdmin` from JWT.

```typescript
@UseGuards(JwtAuthGuard, SystemAdminGuard)
```

**Separation:** system admin does not bypass `OrgRoleGuard`. `isSystemAdmin` is loaded from `users` at login and embedded in the JWT (no per-request user table lookup for that flag).

## Hardening backlog

- Evaluate refresh-token reuse detection and family/session revocation before production or full frontend integration.
