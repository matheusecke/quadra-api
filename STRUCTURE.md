# Estrutura da API — tcc-api

Mapeamento da estrutura de arquivos do projeto NestJS + Prisma.
Baseado nos padrões do `kampus-web-api`, com simplificações documentadas.

---

## Simplificações em relação ao kampus

| Kampus | TCC | Motivo |
|---|---|---|
| TypeORM + `AbstractEntity` | Prisma — sem entidade TS | Prisma gera os tipos do schema; sem decorators de ORM nas classes |
| `InjectRepository` + `Repository<T>` | `PrismaService` injetado diretamente | Padrão do Prisma |
| `PostgresQueryFailedFilter` (TypeORM) | `PrismaExceptionFilter` | Captura `PrismaClientKnownRequestError` com códigos `P2002`, `P2003`, `P2025` |
| `nestjs-i18n` + `TranslatorStorage` + middlewares de linguagem | Sem i18n — campo `code` no erro para o frontend mapear | Ver seção "Estratégia de mensagens de erro" |
| `roles[]` no JWT + `RolesGuard` + `PermissionsGuard` (read/write por role type) | `role` único no JWT + `OrgRoleGuard` simples | Um único papel por org; sem sistema read/write granular |
| `require-permission.decorator.ts` | `require-org-role.decorator.ts` | Reflete o modelo de papéis do domínio |
| `common/store/` | removido | Era exclusivo do i18n |
| `common/validators/` | a avaliar | Incluir só se houver validadores customizados necessários |
| `common/services/PasswordPolicyService` | a avaliar | Incluir só se houver política de senha definida |
| `lambda-arns/` + invocação de Lambda direta | fora do escopo inicial | Lambda/SES será acionado separadamente quando necessário |

---

## Estrutura de diretórios

```
src/
├── main.ts
├── app.module.ts
│
├── prisma/                              # módulo compartilhado do Prisma
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── common/
│   ├── base/
│   │   ├── abstract.dto.ts              # base com Object.assign(this, partial) — idêntico ao kampus
│   │   └── abstract-response.dto.ts    # { data: T, statusCode } — idêntico ao kampus
│   │
│   ├── dto/
│   │   ├── pagination-defaults.dto.ts  # base abstrata com page + limit — idêntico ao kampus
│   │   └── pagination-response.dto.ts  # PaginationMeta + PaginationLinks + data[] — idêntico ao kampus
│   │
│   ├── exceptions/
│   │   └── api.exception.ts            # { error: { title, message, code, data }, statusCode }
│   │                                   # campo `code` adicionado: string estável p/ o frontend mapear (ex: ATHLETE_ALREADY_ENROLLED)
│   │
│   ├── filters/
│   │   └── prisma-exception.filter.ts  # substitui postgres-query-failed.filter.ts
│   │                                   # captura PrismaClientKnownRequestError
│   │                                   # P2002 (unique) → 409 DUPLICATE_RECORD
│   │                                   # P2003 (foreign key) → 400 INVALID_REFERENCE
│   │                                   # P2025 (not found) → 404 RECORD_NOT_FOUND
│   │
│   ├── interceptors/
│   │   ├── pagination.interceptor.ts   # transforma { count, data[] } em resposta paginada — idêntico ao kampus
│   │   └── response-transform.interceptor.ts  # wraps data em AbstractResponseDto — idêntico ao kampus
│   │
│   ├── pipes/
│   │   └── validation-exception.factory.ts   # converte erros class-validator em ApiException
│   │                                         # strings estáticas em inglês; code: VALIDATION_ERROR
│   │
│   └── decorators/
│       ├── generic-api-response.decorator.ts # @GenericApiResponses() p/ Swagger — idêntico ao kampus
│       └── error-api-response.decorator.ts   # ErrorResponseDto p/ Swagger — idêntico ao kampus
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   │
│   ├── strategies/
│   │   └── jwt.strategy.ts             # valida JWT + carrega role do OrganizationMember
│   │                                   # retorna JwtPayload com organizationId e role
│   │
│   ├── guards/
│   │   ├── jwt-auth.guard.ts           # thin wrapper sobre AuthGuard('jwt') — idêntico ao kampus
│   │   ├── org-role.guard.ts           # substitui RolesGuard + PermissionsGuard
│   │   │                               # lê organizationId do JWT, busca OrganizationMember,
│   │   │                               # verifica se role está nos papéis permitidos pelo decorator
│   │   └── admin-secret.guard.ts       # valida header x-admin-secret contra ADMIN_SECRET env
│   │                                   # usado apenas em POST /organizations
│   │
│   ├── decorators/
│   │   ├── current-user.decorator.ts   # @CurrentUser() e @CurrentUser('campo') — idêntico ao kampus
│   │   └── require-org-role.decorator.ts  # @RequireOrgRole('ORG_ADMIN', 'TEAM_ADMIN', ...)
│   │                                      # substitui @Roles() e @RequirePermission()
│   │
│   ├── interfaces/
│   │   └── jwt-payload.interface.ts    # { id, email, organizationId: string | null, role: OrgRole | null }
│   │                                   # organizationId null = usuário autenticado mas sem org selecionada
│   │
│   └── dto/
│       ├── login.dto.ts
│       ├── access-token.dto.ts
│       └── select-organization.dto.ts  # payload para POST /auth/select-organization
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
│       ├── create-user.dto.ts
│       └── user-response.dto.ts
│
├── organizations/
│   ├── organizations.module.ts
│   ├── organizations.controller.ts     # POST protegido por AdminSecretGuard
│   ├── organizations.service.ts
│   └── dto/
│       ├── create-organization.dto.ts
│       └── organization-response.dto.ts
│
├── organization-members/               # relação usuário <-> organização (papel + teamId opcional)
│   ├── organization-members.module.ts
│   ├── organization-members.service.ts
│   └── dto/
│       └── organization-member-response.dto.ts
│
├── teams/
│   ├── teams.module.ts
│   ├── teams.controller.ts
│   ├── teams.service.ts
│   └── dto/
│
├── organization-team-affiliations/     # relação equipe <-> organização (pending/active/rejected)
│   ├── organization-team-affiliations.module.ts
│   ├── organization-team-affiliations.service.ts
│   └── dto/
│
├── tournaments/
│   ├── tournaments.module.ts
│   ├── tournaments.controller.ts
│   ├── tournaments.service.ts
│   └── dto/
│
├── matches/
│   ├── matches.module.ts
│   ├── matches.controller.ts
│   ├── matches.service.ts
│   └── dto/
│
└── statistics/
    ├── statistics.module.ts
    ├── statistics.controller.ts
    ├── statistics.service.ts
    └── dto/
```

---

## Estratégia de mensagens de erro

A API não usa i18n. Mensagens de erro são strings estáticas em inglês. Para que o frontend exiba mensagens localizadas ao usuário sem depender do texto da API (frágil), todo erro inclui um campo `code` estável:

```ts
// api.exception.ts — campo code adicionado ao kampus
export class ApiException extends HttpException {
  constructor(
    title: string,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    code: string = 'ERROR',
    data: Record<string, unknown> = {},
  ) {
    super({ error: { title, message, code, data }, statusCode }, statusCode);
  }
}
```

O frontend mapeia pelo `code` e exibe a mensagem na língua do usuário. O campo `message` serve como aid de debug para o desenvolvedor.

**Exemplos de codes de domínio:**
- `ATHLETE_ALREADY_ENROLLED` — atleta já inscrito no torneio por outra equipe
- `TEAM_NOT_AFFILIATED` — equipe não afiliada à organização
- `TOURNAMENT_NOT_FOUND`
- `INVALID_MATCH_SCORE` — resultado inválido para a partida
- `DUPLICATE_RECORD` — violação de unique constraint (P2002)
- `RECORD_NOT_FOUND` — registro não encontrado (P2025)
- `VALIDATION_ERROR` — falha de validação de campos

---

## Estratégia de queries com Prisma

Sem query builder tradicional. Hierarquia de uso:

| Nível | Quando usar |
|---|---|
| API fluente (`findMany`, `findFirst`, `create`, `update`) | CRUD padrão e listagens com filtros simples |
| `groupBy` + `_sum` / `_avg` / `_count` | Agregações de estatísticas (§8.3 do TCC.md) |
| `aggregate()` | Totais simples sem agrupamento |
| `$queryRaw` | Fallback para casos com SQL condicional complexo ou window functions |

**Exemplo de estatísticas por atleta em um torneio (`groupBy`):**
```ts
prisma.matchStatistic.groupBy({
  by: ['athleteId'],
  where: { match: { tournamentId } },
  _sum: { pts: true, reb: true, ast: true, stl: true, blk: true, tov: true },
  _avg: { pts: true, reb: true, min: true },
  _count: { matchId: true }, // número de partidas jogadas
  orderBy: { _sum: { pts: 'desc' } },
})
```

---

## Fluxo de autenticação

```
POST /auth/login
  → valida credenciais
  → retorna access token (JWT sem organizationId) + refresh token (cookie HTTP-only)

POST /auth/select-organization/:orgId
  → requer JwtAuthGuard
  → verifica que usuário é OrganizationMember da org
  → retorna novo JWT com organizationId + role preenchidos

POST /auth/refresh
  → lê refreshToken do cookie
  → retorna novo access token + novo refresh token

POST /auth/logout
  → limpa cookie refreshToken
```

---

## Convenções de serviço para paginação

Serviços que retornam listas devem sempre retornar `{ count, data[] }` — o `PaginationInterceptor` cuida do wrapping:

```ts
// service
async list(dto: ListXxxDto): Promise<{ count: number; data: XxxResponseDto[] }> {
  const [data, count] = await Promise.all([
    this.prisma.xxx.findMany({ ... }),
    this.prisma.xxx.count({ where: ... }),
  ]);
  return { count, data: data.map(toDto) };
}

// controller
@Get()
@UseInterceptors(PaginationInterceptor)
list(@Query() dto: ListXxxDto) {
  return this.xxxService.list(dto);
}
```

---

## Formato de resposta padrão

**Sucesso (não paginado):**
```json
{ "data": { ... }, "statusCode": 200 }
```

**Sucesso (paginado):**
```json
{
  "data": [...],
  "meta": { "totalItems": 50, "itemCount": 10, "itemsPerPage": 10, "totalPages": 5, "currentPage": 1 },
  "links": { "next": "...", "previous": null, "first": "...", "last": "..." },
  "statusCode": 200
}
```

**Erro de negócio:**
```json
{
  "error": {
    "title": "Not Found",
    "message": "Tournament not found.",
    "code": "TOURNAMENT_NOT_FOUND",
    "data": {}
  },
  "statusCode": 404
}
```

**Erro de validação:**
```json
{
  "error": {
    "title": "Bad Request",
    "message": "Invalid data in request.",
    "code": "VALIDATION_ERROR",
    "data": { "email": ["must be an email"], "name": ["must not be empty"] }
  },
  "statusCode": 400
}
```
