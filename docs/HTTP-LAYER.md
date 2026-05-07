# HTTP layer: errors, responses, pagination

Cross-cutting behavior shared by all controllers. Load this doc when changing API response shape, validation errors, or Prisma error mapping. This file is **project-wide** (`docs/`). Per-module API details (routes, guards, domain rules) live next to the module under `src/<domain>/docs/README.md` — see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Global filters

Registered in `src/main.ts` (order matters: last registered runs first):

- `ApiExceptionFilter` — formats `ApiException` and validation failures
- `PrismaExceptionFilter` — maps Prisma errors to HTTP status and stable codes

## Prisma error mapping

`src/common/filters/prisma-exception.filter.ts`:

| Prisma code | HTTP | Typical API code        |
| ----------- | ---- | ----------------------- |
| `P2002`     | 409  | `DUPLICATE_RECORD`      |
| `P2003`     | 422  | `FOREIGN_KEY_VIOLATION` |
| `P2025`     | 404  | `RECORD_NOT_FOUND`      |

## `ApiException`

`src/common/exceptions/api.exception.ts` — use static helpers only; do not throw raw `HttpException`.

Example error body:

```json
{
  "error": {
    "title": "Conflict",
    "message": "A record with this value already exists.",
    "code": "DUPLICATE_RECORD",
    "data": {}
  },
  "statusCode": 409
}
```

Validation uses `ApiException.badRequest` with `code: 'VALIDATION_ERROR'` and field details in `data` (factory in `src/common/pipes/validation.factory.ts`).

## Success responses

`ResponseTransformInterceptor` is registered globally in `src/app.module.ts`.

- Normal success: `{ data, statusCode }`
- Paginated endpoints: service returns `{ count, data }`; `PaginationInterceptor` (per route) builds `{ data, meta, links, statusCode }` — passed through without wrapping again
- Opt out: `@SkipResponseTransform()` where used

## Pagination pattern

1. Query DTO extends `PaginationDefaultsDto` (`page`, `limit`)
2. Service returns `{ count: number; data: T[] }`
3. Controller applies `@UseInterceptors(PaginationInterceptor)` (see `UsersController` list handler)

Convention details also appear in root `CLAUDE.md`.
