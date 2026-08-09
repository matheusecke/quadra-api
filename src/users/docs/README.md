# Module: Users (`UsersModule`)

Platform-admin user lifecycle and identity/profile fields (`email`, `name`, optional `birthDate`, optional `height`). Not the primary API for roster, coaching staff, or stats screens — those should eventually live on organization/team/affiliation endpoints with user data as relations.

## Endpoints

| Method   | Path                      | Guards                                                | Purpose                                                                                                                  |
| -------- | ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/users`                  | `JwtAuthGuard`, `SystemAdminGuard`                    | Create global user; optional `birthDate`, optional nullable `height`, optional `isSystemAdmin`; does not log the user in |
| `GET`    | `/users`                  | `JwtAuthGuard`, `SystemAdminGuard`                    | Paginated list; identity filters; optional `organizationId`, `teamId`, `role` for admin search                           |
| `GET`    | `/users/lookup`           | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Exact, case-insensitive active-user lookup by `email` query param; returns `{ id, name, email }`                         |
| `GET`    | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`                    | Get by id                                                                                                                |
| `PATCH`  | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`                    | Update `email`, `name`; revokes refresh tokens on email change                                                           |
| `PATCH`  | `/users/:id/status`       | `JwtAuthGuard`, `SystemAdminGuard`                    | Status update; revokes refresh tokens when set to `INACTIVE`                                                             |
| `PATCH`  | `/users/:id/system-admin` | `JwtAuthGuard`, `SystemAdminGuard`                    | Promote/demote platform admin; revokes refresh tokens                                                                    |
| `DELETE` | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`                    | Soft delete, `INACTIVE`, revoke refresh tokens                                                                           |

`GET /users` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Rules

- Every route except `GET /users/lookup` is system-admin only.
- Self-delete, self-deactivation, and self-demotion are rejected to avoid lockout.
- Administrative filters on `GET /users` are not a substitute for future affiliation-based roster APIs.

## Lookup (`GET /users/lookup`)

Used by org-scoped invite flows (invite composers in `organization-user-affiliations` and `organization-team-affiliations`) to resolve an email to a user id before creating an invite, without exposing the full `GET /users` admin listing to non-system-admins.

- `email` is matched with `mode: insensitive` and must match exactly (no partial/`contains` search).
- Only a user that is `status: ACTIVE` and not soft-deleted is returned.
- No match — wrong email, inactive user, or soft-deleted user — returns the same `404 User not found`; the endpoint never distinguishes "does not exist" from "exists but inactive" (non-enumerating).
- Response is the minimal `UserLookupResponseDto`: `id`, `name`, `email`. No `status`, no affiliation data.
- Allowed roles: `ORG_ADMIN`, `TEAM_ADMIN`. Requires an active organization context (`OrgRoleGuard`), but the lookup itself is not organization-scoped — any active user in the system can be found by exact email.
