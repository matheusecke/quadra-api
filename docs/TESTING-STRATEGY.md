# Testing strategy

How automated tests are scoped in this repository (intentionally narrow). This is a **project-wide** doc in `docs/`; see [ARCHITECTURE.md](./ARCHITECTURE.md) for how documentation is split between `docs/` and `src/<domain>/docs/`.

## Unit tests

- Only **service** classes are unit-tested: `*.service.spec.ts` next to `*.service.ts`.
- `jest.config.ts` uses `testMatch: ['<rootDir>/**/*.service.spec.ts']`.
- Coverage targets service files; controllers, guards, decorators, strategies, and pipes are not covered by dedicated unit tests in this phase.

## Running tests

```bash
npm test
npm run test:cov
```

## Mocking

Mock `PrismaService` with `jest.fn()` — no real database in unit tests. Pattern:

```ts
const mockPrisma = { user: { findFirst: jest.fn(), create: jest.fn() } };
// { provide: PrismaService, useValue: mockPrisma }
```
