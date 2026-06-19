# Module: Users (`UsersModule`)

Platform-admin user lifecycle and identity/profile fields (`email`, `name`, optional `birthDate`, optional `height`). Not the primary API for roster, coaching staff, or stats screens — those should eventually live on organization/team/affiliation endpoints with user data as relations.

## Endpoints

| Method   | Path                      | Guards                              | Purpose |
| -------- | ------------------------- | ----------------------------------- | ------- |
| `POST`   | `/users`                  | `JwtAuthGuard`, `SystemAdminGuard`  | Create global user; optional `birthDate`, optional nullable `height`, optional `isSystemAdmin`; does not log the user in |
| `GET`    | `/users`                  | `JwtAuthGuard`, `SystemAdminGuard`  | Paginated list; identity filters; optional `organizationId`, `teamId`, `role` for admin search |
| `GET`    | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`  | Get by id |
| `PATCH`  | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`  | Update `email`, `name`; revokes refresh tokens on email change |
| `PATCH`  | `/users/:id/status`       | `JwtAuthGuard`, `SystemAdminGuard`  | Status update; revokes refresh tokens when set to `INACTIVE` |
| `PATCH`  | `/users/:id/system-admin` | `JwtAuthGuard`, `SystemAdminGuard`  | Promote/demote platform admin; revokes refresh tokens |
| `DELETE` | `/users/:id`              | `JwtAuthGuard`, `SystemAdminGuard`  | Soft delete, `INACTIVE`, revoke refresh tokens |

`GET /users` uses `PaginationInterceptor` — response shape in [HTTP-LAYER.md](../../../docs/HTTP-LAYER.md).

## Rules

- All routes are system-admin only.
- Self-delete, self-deactivation, and self-demotion are rejected to avoid lockout.
- Administrative filters on `GET /users` are not a substitute for future affiliation-based roster APIs.
