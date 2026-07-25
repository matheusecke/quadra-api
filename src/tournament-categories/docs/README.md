# Tournament categories module

Controlled division vocabulary per organization (`Sub-19`, `Adulto Masculino`, …). A tournament optionally references one via `categoryId`.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/tournament-categories` | any org role — paginated, `q`, `ids`, `status` |
| `POST` | `/tournament-categories` | `ORG_ADMIN` — `name`, `sortOrder?` |
| `PATCH` | `/tournament-categories/:id` | `ORG_ADMIN` — `name`, `sortOrder` |
| `PATCH` | `/tournament-categories/:id/status` | `ORG_ADMIN` — `EntityStatus` |

## Rules

- **Tenant scope** comes from the JWT. A category of another organization returns `404`.
- **`slug` is derived, never sent.** `slugify(name)` on create, recomputed on rename. Two distinct names can collide on one slug (`Sub 17` and `Sub-17`), so name and slug are checked separately — both raise `409 DUPLICATE_RECORD`, with different messages.
- **`sortOrder` is optional and stays `NULL`** when omitted. Listing orders by `sortOrder` ascending with **nulls last**, then `name`, then `id`: manually ordered categories first, unordered ones alphabetically after them. `PATCH` with `sortOrder: null` clears the manual ordering.
- **No delete route.** A category referenced by an existing tournament is deactivated via `PATCH /:id/status`, never removed.

Contract: `../../../../docs/sports-api-contract.md` §3.
