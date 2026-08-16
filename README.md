# Quadra API

REST API for Quadra, a multi-tenant platform for organizing and tracking basketball championships: organizations, teams, tournaments, matches, and statistics.

Built with NestJS 11, TypeScript, Prisma 7, and PostgreSQL.

## Installation

Requires Node.js 22+ and a reachable PostgreSQL instance.

```bash
npm install
npm run prisma:generate
```

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quadra?schema=public
JWT_SECRET=change-me
PORT=3001
```

Production receives `DATABASE_SECRET` as the RDS-managed JSON secret, which
carries only `username` and `password`; the host, port, database, and schema
come from the environment. To test
that parsing path locally, remove `DATABASE_URL` and use synthetic values only:

```env
DATABASE_SECRET={"username":"postgres","password":"postgres"}
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=quadra
DATABASE_SCHEMA=public
```

Never copy the production secret to a local file. The two database variables
are mutually exclusive.

Apply pending migrations:

```bash
npm run prisma:migrate:deploy
```

## Usage

```bash
npm run start:dev
```

The API runs on `http://localhost:3001`.

```bash
npm test          # unit tests
npm run lint
```

### Docker

This is how the API currently runs day to day. The repo has its own `docker-compose.yml`, which builds the image from `Dockerfile.local`. It expects the `quadra-network` Docker network and the `quadra-postgres` container to already exist — start those first from [quadra-infra](https://github.com/matheusecke/quadra-infra) (`docker compose up -d`), then:

```bash
docker compose up --build
```

The container reads `.env` and reaches Postgres over the Docker network at `quadra-postgres:5432`, still published on `http://localhost:3001`.

### Deployment

On pushes to `main`, `.github/workflows/ci.yml` publishes the immutable image to
Amazon ECR tagged with the full Git SHA, runs pending migrations in an isolated
ECS task (`npm run prisma:migrate:deploy`), deploys that same image to the API
Service, waits for ECS service stability, and requires HTTP 200 from the public
`/health` endpoint before the job succeeds.

## Examples

Interactive API docs (Swagger UI):

```text
http://localhost:3001/api
```

Health check:

```bash
curl http://localhost:3001/health
```

## License

All rights reserved — see [LICENSE](LICENSE). Public for academic evaluation and portfolio purposes (TCC); not licensed for external use.
