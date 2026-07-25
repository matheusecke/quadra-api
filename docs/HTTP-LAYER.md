# HTTP layer: errors, responses, pagination

Cross-cutting behavior shared by all controllers. Load this doc when changing API response shape, validation errors, or Prisma error mapping. This file is **project-wide** (`docs/`). Per-module API details (routes, guards, domain rules) live next to the module under `src/<domain>/docs/README.md` — see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Route naming

Every resource has exactly one canonical path segment: the kebab-case plural of its entity name (`teams`, `organization-user-affiliations`, `tournament-bracket-slots`). That segment never shortens or gets renamed depending on where it appears.

Two shapes only:

1. **Flat, addressed by the resource's own id** — the default. Every direct CRUD operation and every action on one specific record: `/<resource>/:id[/<action>]`. Use this whenever the record has its own primary key, which is every table in this schema — a child belonging to a parent does not need the parent in the path to be addressed unambiguously.
2. **Nested, scoped to a parent instance** — only for listing/creating *within* that parent, or a composite read model that only exists in that parent's context: `/<parent-resource>/:parentId/<resource>`. The child segment is mechanical, not a judgment call: if the parent's singular noun is a literal leading prefix of the child's canonical name, drop exactly that prefix (`tournaments/:id/teams`, from `tournament-teams`); otherwise keep the child's full canonical name unchanged (`teams/:teamId/organization-team-affiliations`, not `teams/:teamId/affiliations` — `team-` is not a leading prefix of `organization-team-affiliations`, so nothing gets dropped). Never abbreviate by guessing what reads fine in context — apply the prefix test.

Never put the organization in the path for an operation scoped to the caller's own organization — that scope always comes from the JWT (`user.organizationId`), never the URL. A tenant id in the path is reserved for genuinely cross-tenant operations (`SYSTEM_ADMIN` acting outside its own org), and even then only when the target has no id of its own to address by; if it does, the cross-tenant confirmation belongs in the request body, not the path.

Don't invent a path segment for a resource that has no table. If the schema has no `Bracket` entity, no route gets a `/brackets/` segment — nest directly under the entity that actually exists, and keep a singular segment for a composite read model that isn't itself a collection (`/tournaments/:id/bracket`, not `/tournaments/:id/brackets`).

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

## Rate limiting

Configured in `src/app.module.ts` (see the file header comment next to `ThrottlerModule` / `ThrottlerGuard`). This section is the **canonical** reference for behavior, trade-offs, and how limits evolve with infrastructure. For a short pointer from the architecture hub, see [ARCHITECTURE.md](./ARCHITECTURE.md) (Implemented today).

### HTTP contract

- Excess requests receive **429 Too Many Requests** from `@nestjs/throttler` (Nest default body/message unless customized elsewhere).
- Clients should treat **429** generically: exponential backoff; honor **`Retry-After`** when present.
- Some routes use **`@Throttle`** with a **lower** limit than the global default (for example login, refresh, invite resend). Those limits apply to the same default tracker unless `getTracker` is customized.

### Global default and Swagger exclusion

- **Global guard:** `ThrottlerGuard` is registered as `APP_GUARD` in `src/app.module.ts`.
- **Default bucket:** `120` requests per `60_000` ms (60s) per **tracker** (library default: client **IP** as seen by the Node process), unless a route overrides with `@Throttle`.
- **Skipped paths:** requests whose URL starts with **`/api`** are **not** throttled (`skipIf`), so Swagger UI and OpenAPI JSON under `SwaggerModule.setup('api', …)` in `src/main.ts` do not consume the global budget.

### Semantics: what “per IP” really means

The throttler’s default **tracker is IP-based**. The IP is whatever the HTTP adapter reports (for example Express `req.ip`). That value depends on deployment:

| Scenario                                                                                                        | Typical behavior                                                                          | Risk if ignored                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client → Node directly                                                                                          | Socket / `req.ip` reflects the client                                                     | Low for identification                                                                                                                            |
| Reverse proxy / LB **without** `trust proxy` and without a custom `getTracker`                                  | Node may see **only the proxy’s IP** for everyone                                         | **High:** one shared bucket for all clients behind that hop                                                                                       |
| Proxy **with** `trust proxy` and **trusted** forwarded headers (`X-Forwarded-For`, `Forwarded`, PROXY protocol) | Tracker can reflect the **original client**                                               | Medium: the proxy must **append or replace** forwarded chains; do not trust raw `X-Forwarded-For` from the public internet without a trusted edge |
| **Multiple app replicas** (for example Kubernetes) with default **in-memory** storage                           | Each instance keeps **its own** counters                                                  | Effective ceiling ≈ **`N × limit`** per tracker across the fleet unless you add **shared storage** or rate limiting at the **edge**               |
| TLS terminates at the LB                                                                                        | Acceptable if the app still receives a correct client identifier via supported mechanisms | Depends on what the Node process sees after termination                                                                                           |

**NAT / CGNAT / corporate Wi-Fi:** several legitimate users may share one public IP; they **share** the same bucket. Mitigations include raising the global limit, using a different tracker (for example authenticated `userId` — design carefully on public routes), or moving stricter limits to an edge with richer signals.

### Trade-offs (in-app throttler)

| You gain                                                             | You accept                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Uniform protection in the app without tying to a specific CDN vendor | Not a substitute for **high-volume DDoS** protection (traffic can exhaust network or CPU before the guard runs)                  |
| Low operational cost (per-process memory)                            | With **N** replicas and in-memory storage, aggregate ceiling scales with **N** for the same tracker key                          |
| Per-route tuning via `@Throttle`                                     | Tuning `limit` / `ttl` needs real traffic data or you risk false positives on legitimate spikes                                  |
| Works without an API gateway                                         | Does **not** replace **WAF**, **bot management**, **CAPTCHA** on public login, **account lockout** after repeated failures, etc. |

### Operational questions that show up as you scale

1. **“Why are different users getting 429?”** — Shared public IP. See semantics above.
2. **“Attacker spreads load across pods.”** — Expected with per-instance memory; use **shared `ThrottlerStorage`** (for example Redis) or **edge / API Gateway** quotas.
3. **“We only see the load balancer IP.”** — Configure Express **`trust proxy`** and ensure the LB sets trusted forwarded headers (Nest/Express documentation).
4. **“TLS ends at the LB.”** — OK if the app still receives a correct client IP via PROXY protocol or trusted `X-Forwarded-For` / `Forwarded`.
5. **“We need limits per organization or API key.”** — Not covered by the default IP tracker; evolve with **`getTracker`**, a BFF, or provider quotas.
6. **“Server-to-server integrations hit the limit.”** — Product decision: allowlist routes, separate credentials, or `@SkipThrottle()` for specific integration paths — not automatic.
7. **“How many 429s are we returning?”** — Add metrics and alerts when an observability stack exists.
8. **“We also rate-limit at Cloudflare / API Gateway.”** — Two layers may return different bodies or ordering; clients should still treat **429** generically.

### Suggested evolution (layers)

```text
Current: ThrottlerGuard global + @Throttle on sensitive routes + skip /api
   ↓
Proxy/LB: trust proxy + validated forwarded headers on a trusted network
   ↓
Replicas: shared ThrottlerStorage (for example Redis) OR aggregate limits at the edge
   ↓
Mature production: WAF / bot rules / provider DDoS; per–API-key quotas; CAPTCHA or step-up on high-risk auth
```

Each step **complements** the previous. Removing in-app throttling solely because an edge exists can leave gaps for traffic that reaches the app from inside the network (mesh, debug bypass, etc.).

## Pagination pattern

1. Query DTO extends `PaginationDefaultsDto` (`page`, `limit`)
2. Service returns `{ count: number; data: T[] }`
3. Controller applies `@UseInterceptors(PaginationInterceptor)` (see `UsersController` list handler)

Convention details also appear in root `CLAUDE.md`.
