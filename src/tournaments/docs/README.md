# Tournaments module

The spine of the sports domain: every later phase (enrollment, groups, standings, bracket, matches, statistics) hangs off a `tournamentId`.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/tournaments` | any org role — paginated, `q`, `ids`, `seasonId`, `categoryId`, `status` |
| `POST` | `/tournaments` | `ORG_ADMIN` |
| `GET` | `/tournaments/:id` | any org role |
| `PATCH` | `/tournaments/:id` | `ORG_ADMIN` |
| `POST` | `/tournaments/:id/complete` | `ORG_ADMIN` — declares the champion and closes the tournament |
| `POST` | `/tournaments/:id/reopen` | `ORG_ADMIN` — the inverse of `/complete` |
| `GET` | `/tournaments/:id/champion-suggestion` | any org role — a suggestion, never a fact |

No `DELETE` route. A tournament is `CANCELLED` via `PATCH`, never deleted.

## Rules

- **Tenant scope** comes from the JWT (`organizationId`), never from the request. This also covers every id arriving in the **body** — `seasonId`, `categoryId`, `championTournamentTeamId` — none of which are guaranteed by their database FK to belong to the caller's organization. A tournament, season, category, or champion outside the caller's organization returns `404`/`422`, not `403`.

- **Child-table queries scoped by `tournamentId` do not repeat `organizationId`.** The tournament was already checked against the JWT one query earlier, so it is the tenancy authority and the child inherits it. The `organization_id` column on `tournament_bracket_slots`, `matches` and friends is denormalized — no composite foreign key ties it to the parent's organization — so filtering on it adds no isolation and can silently hide rows that legitimately belong to the tournament, turning a data-integrity bug into an unexplainable `422`. Pinned by a test in `tournaments.service.spec.ts`.

- **Slug** is derived from `name` + the selected season's `label` (`/` replaced with `-` locally, since `slugify()` would strip it): `slugify("${name} ${label.replace('/', '-')}")`. Uniqueness is per organization, not per season — the same tournament name run again next season would otherwise collide with itself. A derived collision is disambiguated with a numeric suffix (`-2`, `-3`, …); an **explicit** slug is never disambiguated — a collision there is a real `409 DUPLICATE_RECORD`. An explicit slug that `slugify()` reduces to an empty string (`"!!!"`, `"   "`) is rejected with `422 INVALID_SLUG`, since the empty string satisfies the lowercase check constraint and would then collide invisibly. On `PATCH`, the slug changes only when the body sends one; renaming the tournament or moving it to another season leaves the stored slug alone.

- **`isRegistrationOpen`** is derived, never persisted, from `registrationStartsAt`/`registrationEndsAt` only — not from `status`. Both bounds `null` means no registration window was ever configured, which reads as **closed**, not "open forever".

- **Counters** (`enrolledTeamCount`, `matchCount`, `finishedMatchCount`) are derived on every read (list and detail) so the frontend never issues a request per row. `enrolledTeamCount` filters `TournamentTeam.status = ACTIVE`. `matchCount` excludes `CANCELLED` matches (they will never be played, so counting them would freeze progress); `finishedMatchCount` counts only `FINISHED`.

- **`POST /:id/complete`** runs five ordered validations inside one transaction: tournament exists and is `IN_PROGRESS` (`409 INVALID_STATUS_TRANSITION` otherwise) → `GROUP_STAGE` forbids a champion (`422 CHAMPION_NOT_ALLOWED`) → every other format requires one (`422 CHAMPION_REQUIRED`) → the champion must be an actively enrolled `TournamentTeam` of this tournament (`422 INVALID_CHAMPION`) → `KNOCKOUT`/`GROUP_STAGE_KNOCKOUT` additionally require the champion to have won **some** non-deleted bracket slot, not necessarily in the highest round (`422 INVALID_CHAMPION`). This last check keys off the **format**, not the current bracket structure — an empty or undecided bracket cannot wave through an arbitrary enrolled team. Returns `200`, not `201`.

- **`POST /:id/reopen`** requires the tournament to be `COMPLETED` (`409 INVALID_STATUS_TRANSITION` otherwise) and writes `status → IN_PROGRESS` and `championTournamentTeamId → null` in the same update — the two fields never move apart. Returns `200`.

- **`PATCH` cannot change the status of a `COMPLETED` tournament** (`409 INVALID_STATUS_TRANSITION`, pointing at `/reopen`). Editing other fields (name, regulation, dates) of a completed tournament stays allowed. `seasonId` remains freely editable in this phase, and so does `format` — **except while a champion is declared** (`422 INVALID_CHAMPION`): the champion was validated against the old format, so `GROUP_STAGE_KNOCKOUT → GROUP_STAGE` would strand a title `/complete` refuses to grant. Reopen first. No document defines a guard for changing the format once groups or bracket rounds exist; neither has an endpoint yet.

- **`GET /:id/champion-suggestion`** suggests, never asserts: `GROUP_STAGE` is always `null` (no champion concept); `LEAGUE` is `null` for now — the suggestion does not yet read the classification table (see the `TODO` in the service); `KNOCKOUT`/`GROUP_STAGE_KNOCKOUT` return the winner of the single slot in the highest round with non-deleted slots, or `null` when that round has zero or more than one slot, or the single slot has no winner yet.

- **`mvpTournamentRosterId`** is read-only for now — always `null`, never accepted in `POST`/`PATCH`, because no screen sets a tournament MVP yet.

Contract and domain rules: `../../../../docs/sports-api-contract.md` §4, `../../../../docs/sports-domain-rules.md` §1–§3.
