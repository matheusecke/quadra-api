# Module: Users (`UsersModule`)

Platform-admin user lifecycle and identity/profile fields (`email`, `name`, optional `birthDate`, optional `heightCm`). Not the primary API for roster, coaching staff, or stats screens — those should eventually live on organization/team/affiliation endpoints with user data as relations.

## Endpoints

| Method   | Path                      | Guards                                                | Purpose                                                                                                                  |
| -------- | ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/users`                  | `JwtAuthGuard`, `SystemAdminGuard`                    | Create global user; optional `birthDate`, optional nullable `heightCm`, optional `isSystemAdmin`; does not log the user in |
| `GET`    | `/users`                  | `JwtAuthGuard`, `SystemAdminGuard`                    | Paginated list; identity filters; optional `organizationId`, `teamId`, `role` for admin search                           |
| `GET`    | `/users/lookup`           | `JwtAuthGuard`, `OrgRoleGuard(ORG_ADMIN, TEAM_ADMIN)` | Exact, case-insensitive active-user lookup by `email` query param; returns `{ id, name, email }`                         |
| `GET`    | `/users/me`               | `JwtAuthGuard`                                        | Current user own profile: `id`, `email`, `name`, `birthDate`, `heightCm`. No organization context required |
| `PATCH`  | `/users/me`               | `JwtAuthGuard`                                        | Update own `name`, `birthDate`, `heightCm`; `heightCm: null` clears it; empty body returns `EMPTY_UPDATE`; never touches `email` or refresh tokens |
| `GET`    | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`                    | Get by id                                                                                                                |
| `PATCH`  | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`                    | Update `email`, `name`; revokes refresh tokens on email change                                                           |
| `PATCH`  | `/users/:id/status`       | `JwtAuthGuard`, `SystemAdminGuard`                    | Status update; revokes refresh tokens when set to `INACTIVE`                                                             |
| `PATCH`  | `/users/:id/system-admin` | `JwtAuthGuard`, `SystemAdminGuard`                    | Promote/demote platform admin; revokes refresh tokens                                                                    |
| `DELETE` | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`                    | Soft delete, `INACTIVE`, revoke refresh tokens                                                                           |

`GET /users` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Rules

- Every route is system-admin only, except `GET /users/lookup` (org roles) and the self-service routes under `/users/me`, which any authenticated user may call for their own account.
- Self-delete, self-deactivation, and self-demotion are rejected to avoid lockout.
- Administrative filters on `GET /users` are not a substitute for future affiliation-based roster APIs.

## Lookup (`GET /users/lookup`)

Used by org-scoped invite flows (invite composers in `organization-user-affiliations` and `organization-team-affiliations`) to resolve an email to a user id before creating an invite, without exposing the full `GET /users` admin listing to non-system-admins.

- `email` is matched with `mode: insensitive` and must match exactly (no partial/`contains` search).
- Only a user that is `status: ACTIVE` and not soft-deleted is returned.
- No match — wrong email, inactive user, or soft-deleted user — returns the same `404 User not found`; the endpoint never distinguishes "does not exist" from "exists but inactive" (non-enumerating).
- Response is the minimal `UserLookupResponseDto`: `id`, `name`, `email`. No `status`, no affiliation data.
- Allowed roles: `ORG_ADMIN`, `TEAM_ADMIN`. Requires an active organization context (`OrgRoleGuard`), but the lookup itself is not organization-scoped — any active user in the system can be found by exact email.

## Self-service profile (`/users/me`)

The two `/users/me` routes are the only non-administrative writes in this module. They are scoped by `@CurrentUser().sub` — no user id is accepted from route, query or body — and require no organization context, so any authenticated user reaches them regardless of role. `email`, `status` and `isSystemAdmin` are not editable here; changing an email remains `PATCH /users/:id`, which also revokes refresh tokens. Both routes must stay declared before `:id` handlers, otherwise `me` is parsed as an id.
