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

| Method | Path                    | Auth   | Purpose                                                                                                                  |
| ------ | ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/auth/register`        | —      | Creates an `ACTIVE` non–system-admin user; returns `accessToken`; stores hashed refresh token and sets `httpOnly` cookie |
| `POST` | `/auth/login`           | —      | Authenticates; returns `accessToken`; refresh cookie                                                                     |
| `POST` | `/auth/refresh`         | Cookie | Rotates refresh token; new `accessToken`; preserves org context when still valid                                         |
| `POST` | `/auth/logout`          | Cookie | Revokes current refresh token and clears cookie (no bearer required)                                                     |
| `GET`  | `/auth/me`              | Bearer | Current user and session context                                                                                         |
| `GET`  | `/auth/org`             | Bearer | User’s organization affiliations                                                                                         |
| `POST` | `/auth/org`             | Bearer | Chooses organization; rotates refresh with org context; org-scoped JWT                                                   |
| `POST` | `/auth/change-password` | Bearer | Changes password; revokes active refresh tokens                                                                          |

Rate limiting is enforced globally (`ThrottlerGuard` in `src/app.module.ts`). Register, login, refresh, choose-org, and change-password use **stricter** `@Throttle` limits than the global default. See [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md#rate-limiting).

## Session and refresh token

- Access token: short-lived JWT (`JwtModule` / env).
- Refresh token: opaque, sent as `httpOnly` cookie; stored hashed in `refresh_tokens` (see [DATABASE.md](../../../docs/DATABASE.md)).
- `refresh_tokens.organization_id` optionally pins org; `role` is not stored on the row and is resolved from active affiliation on refresh.
- Each `POST /auth/refresh` rotates the refresh token.
- `POST /auth/org` also rotates the refresh token to bind the session to the chosen org.
- Logout revokes the cookie’s token; password change revokes all active refresh tokens for the user.
- Login and refresh require `ACTIVE` user and not soft-deleted.
- Login, org listing, org choice, and org-scoped refresh only consider active, non-deleted affiliations, organizations, and teams.
- If org-scoped refresh finds org/affiliation/team no longer valid, the backend rotates session back to global context instead of failing the user.
- Refresh tokens are also revoked on email change, user deactivation, system-admin flag changes, and user soft delete (see `AuthService` / `UsersService` coordination).

## Authorization layers

**`OrgRoleGuard`** — org-scoped operations; reads `role` from JWT and checks `@OrgRoles(...)`. Pass **`OrgRole` enum members** from `@prisma/client`, not string literals (TypeScript and the decorator signature require `OrgRole`).

```typescript
import { OrgRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, OrgRoleGuard)
@OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
```

**`SystemAdminGuard`** — platform-level operations; reads `isSystemAdmin` from JWT.

```typescript
@UseGuards(JwtAuthGuard, SystemAdminGuard)
```

**Separation:** system admin does not bypass `OrgRoleGuard`. `isSystemAdmin` is loaded from `users` at login and embedded in the JWT (no per-request user table lookup for that flag).

## Hardening backlog

- Evaluate refresh-token reuse detection and family/session revocation before production or full frontend integration.
