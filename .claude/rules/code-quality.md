---
alwaysApply: true
---

# Code Quality

## Anti-defaults (counter common Claude tendencies)

- No premature abstractions. Three similar lines beats a helper used once.
- Don't add features or improvements beyond what was asked.
- Don't refactor adjacent code while fixing a bug.
- No dead code or commented-out blocks. Git has history.
- WHY comments, never WHAT. If code needs a "what" comment, rename instead.
- API docs at module boundaries only, not every internal function.

## Naming

- Files: kebab-case for directories and filenames (`users.controller.ts`, `create-user.dto.ts`).
- Classes: PascalCase (`UsersController`, `CreateUserDto`, `JwtAuthGuard`). Role suffixes: `Controller`, `Service`, `Guard`, `Interceptor`, `Pipe`, `Decorator`.
- Booleans: `is` / `has` / `should` / `can` prefix (`isActive`, `hasPermission`). Functions: verb-first (`getUser`, `createUser`).
- Methods on classes: camelCase with clear intent (`create`, `findById`, `update`).
- DTOs: PascalCase ending with `Dto` (`CreateUserDto`, `UserResponseDto`, `ListUsersQueryDto`).
- Interfaces: PascalCase ending with `Interface` (`JwtPayload`) or use `type` for type aliases.
- Factories: `create*`. Converters: `to*`. Predicates: `is*` / `has*`. Constants: `SCREAMING_SNAKE`.
- Abbreviations only when universally known (`id`, `url`, `api`, `db`, `auth`). Acronyms as words: `userId`, not `userID`.

## Code Markers

`TODO(author): desc (#issue)` for planned work. `FIXME(author): desc (#issue)` for known bugs. `HACK(author): desc (#issue)` for ugly workarounds (explain the proper fix). `NOTE: desc` for non-obvious context. Owner and issue link required. Never `XXX`, `TEMP`, `REMOVEME`.

## File Organization

- Imports: builtins, external, internal, relative, types. Blank line between groups.
- Exports: named over default. One class or service per file.
- Method order in classes: constructor, public API first, then private helpers.
- NestJS modules: one controller/service/module per domain (e.g., `users.controller.ts`, `users.service.ts`, `users.module.ts`).
