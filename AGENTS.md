# AGENTS.md

This file supplements the repository-level `AGENTS.md` for work inside `quadra-api/`.

## Scope

- Treat this package as backend-only unless the task explicitly requires cross-project changes.
- Preserve the existing application structure and keep business logic out of controllers when a service layer already exists.

## Backend Conventions

- Follow existing NestJS or backend module boundaries: keep controllers, services, modules, guards, interceptors, and DTOs in their current patterns.
- Keep filenames and class names aligned with existing role-based naming such as `*.controller.ts`, `*.service.ts`, `*.module.ts`, and `*Dto`.
- Prefer named exports unless the existing file pattern clearly uses default exports.
- Keep imports grouped and ordered consistently with the surrounding code.

## Error Handling

- Use typed or project-specific errors when the codebase already has them; avoid generic `Error` when a clearer error type exists.
- Do not swallow errors. Re-throw with context or log them using the project's existing pattern.
- Handle rejected promises explicitly.
- Preserve consistent HTTP error behavior and do not expose stack traces, internal paths, or raw database errors in production responses.

## Security

- Validate request data at the system boundary. Never trust route params, query params, headers, or body input.
- Use parameterized queries and existing ORM patterns. Do not build SQL from string concatenation with user input.
- Never log secrets, tokens, passwords, or PII.
- Preserve existing authentication and authorization checks when touching protected endpoints.
- Keep auth tokens short-lived and follow existing refresh-token storage patterns.
- Rate-limit or preserve rate-limiting behavior on authentication-sensitive endpoints.

## Database and Migrations

- Never modify an existing migration that may already have run in another environment. Create a new migration instead.
- Keep migrations reversible when the project's migration tool supports it.
- Avoid destructive schema changes unless the task explicitly requires them.
- Do not bundle unrelated data changes into schema migrations.

## Code Quality

- Prefer explicit code over premature abstractions.
- Do not refactor adjacent code unless it directly supports the requested change.
- Use clear names: booleans with `is` / `has` / `should` / `can`, functions with verb-first names, DTOs with `Dto` suffix, and role-based class suffixes where already used.
- Keep public APIs stable unless the task explicitly requires a behavior change.

## Testing

- Test behavior, not implementation details.
- After changes, run the most specific relevant test file first, then broader validation only if needed.
- Do not rely on retries to pass flaky tests.
- Prefer real implementations and mock only at system boundaries.

## Commit Attribution

- Keep commit messages limited to the repository change.
- Do not add `Co-authored-by`, `Signed-off-by`, `Generated-by`, or equivalent authorship, provenance, or tool-identification trailers or commit-body metadata.
