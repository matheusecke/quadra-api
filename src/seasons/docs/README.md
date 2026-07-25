# Seasons module

Time-bounded grouping of tournaments inside one organization. Every tournament requires a `seasonId`.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/seasons` | any org role — paginated, `q`, `ids`, `status` |
| `POST` | `/seasons` | `ORG_ADMIN` |
| `PATCH` | `/seasons/:id` | `ORG_ADMIN` — `label`, `startDate`, `endDate` |
| `PATCH` | `/seasons/:id/status` | `ORG_ADMIN` — `SeasonStatus` |

## Rules

- **Tenant scope** comes from the JWT (`organizationId`), never from the request. A season of another organization returns `404`, not `403`.
- **Dates are calendar days.** `startDate` / `endDate` are `@db.Date` and travel as `"YYYY-MM-DD"` strings in both directions — never as instants, so no timezone can shift the displayed day. Values that match the format but are not real dates (`2026-02-30`) return `422 INVALID_DATE`.
- **`startDate <= endDate`**, enforced in the service and by the `seasons_date_range_chk` check constraint. On `PATCH`, a partial payload is merged over the stored row before the check.
- **`label` is unique per organization** among non-deleted seasons → `409 DUPLICATE_RECORD`.
- **Ordering:** `startDate` descending, then `id` descending — the most recent season first, which is what the tournament form's selector needs.
- **No delete route.** A season is archived via `PATCH /:id/status`; `isDeleted` is never set by this module.

Contract and domain rules: `../../../../docs/sports-api-contract.md` §2, `../../../../docs/sports-domain-rules.md` §1.
