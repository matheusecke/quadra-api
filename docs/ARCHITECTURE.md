# Estrutura da API — tcc-api

Visão atual do backend NestJS + Prisma, alinhada ao estado real do projeto e ao escopo inicial reduzido.

## Estado atual

- Backend em NestJS com `ConfigModule` global, `PrismaModule` global e `AuthModule` já registrados em [src/app.module.ts](/home/matheusecke/tcc/tcc-api/src/app.module.ts:1).
- Bootstrap com `ValidationPipe`, filtros globais para exceções da API e Prisma, `cookie-parser` e Swagger em `/api`, conforme [src/main.ts](/home/matheusecke/tcc/tcc-api/src/main.ts:1).
- Prisma configurado com multi-file schema em `prisma/schema/`.
- Escopo atual do banco reduzido ao núcleo:
- `User`
- `Organization`
- `Team`
- `OrganizationUserAffiliation`
- `OrganizationTeamAffiliation`
- Módulos de campeonato, partida e estatísticas foram removidos do schema nesta fase inicial.

## Estrutura de diretórios

```text
src/
├── main.ts
├── app.module.ts
│
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── common/
│   ├── dto/
│   │   ├── pagination-defaults.dto.ts
│   │   └── pagination-response.dto.ts
│   ├── exceptions/
│   │   └── api.exception.ts
│   ├── filters/
│   │   ├── api-exception.filter.ts
│   │   └── prisma-exception.filter.ts
│   ├── interceptors/
│   │   ├── pagination.interceptor.ts
│   │   └── response-transform.interceptor.ts
│   └── pipes/
│       └── validation.factory.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── org-roles.decorator.ts
│   │   └── system-admin.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── org-role.guard.ts
│   │   └── system-admin.guard.ts
│   ├── interfaces/
│   │   └── jwt-payload.interface.ts
│   └── strategies/
│       └── jwt.strategy.ts
```

```text
prisma/
├── schema/
│   ├── enums.prisma
│   ├── schema.prisma
│   ├── user.prisma
│   ├── organization.prisma
│   ├── team.prisma
│   ├── organization-user-affiliation.prisma
│   └── organization-team-affiliation.prisma
└── migrations/
```

## Banco atual

### Modelos centrais

| Model Prisma | Tabela no banco | Função |
| --- | --- | --- |
| `User` | `users` | Identidade global do usuário |
| `Organization` | `organizations` | Tenant raiz |
| `Team` | `teams` | Identidade global da equipe |
| `OrganizationUserAffiliation` | `organization_user_affiliations` | Papel do usuário e vínculo opcional com time dentro da organização |
| `OrganizationTeamAffiliation` | `organization_team_affiliations` | Relação contextual de equipe com organização |

### Convenções

- Models Prisma em singular `PascalCase`.
- Fields Prisma em `camelCase`.
- Tabelas do banco em plural `snake_case`.
- Colunas do banco em `snake_case`.
- IDs sequenciais com `Int @default(autoincrement())`.
- `status` apenas em `users`, `organizations` e `teams`.
- `is_deleted` em todas as 5 tabelas centrais.
- Itens PostgreSQL não mapeados diretamente pelo Prisma são tratados como `DB-only` e documentados com comentário no schema.

Mais detalhes estão em [docs/database.md](/home/matheusecke/tcc/tcc-api/docs/database.md:1).

## Prisma

O Prisma é acessado por um único serviço global:

- [src/prisma/prisma.service.ts](/home/matheusecke/tcc/tcc-api/src/prisma/prisma.service.ts:1) estende `PrismaClient`
- conecta no `onModuleInit`
- desconecta no `onModuleDestroy`

Esse serviço é exportado por [src/prisma/prisma.module.ts](/home/matheusecke/tcc/tcc-api/src/prisma/prisma.module.ts:1).

## Erros e respostas

### PrismaExceptionFilter

[src/common/filters/prisma-exception.filter.ts](/home/matheusecke/tcc/tcc-api/src/common/filters/prisma-exception.filter.ts:1) traduz:

| Código Prisma | Resposta da API |
| --- | --- |
| `P2002` | `409 DUPLICATE_RECORD` |
| `P2003` | `422 FOREIGN_KEY_VIOLATION` |
| `P2025` | `404 RECORD_NOT_FOUND` |

### ApiException

[src/common/exceptions/api.exception.ts](/home/matheusecke/tcc/tcc-api/src/common/exceptions/api.exception.ts:1) centraliza o formato de erro:

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

### Responses

- Respostas comuns passam pelo `ResponseTransformInterceptor`.
- Respostas paginadas usam `PaginationInterceptor`.
- Convenção atual para listas em services: retornar `{ count, data }`.

## Auth atual

O módulo de autenticação já contém a base estrutural:

- `JwtStrategy`
- `JwtAuthGuard` — valida JWT
- `OrgRoleGuard` — verifica papel dentro de uma organização
- `SystemAdminGuard` — verifica se usuário é admin de plataforma
- decorators `@CurrentUser()`, `@OrgRoles()` e `@SystemAdmin()`

O payload JWT atual está tipado em [src/auth/interfaces/jwt-payload.interface.ts](/home/matheusecke/tcc/tcc-api/src/auth/interfaces/jwt-payload.interface.ts:1):

```ts
{
  sub: number;
  email: string;
  isSystemAdmin: boolean;
  organizationId: number | null;
  role: OrgRole | null;
}
```

### Camadas de autorização

**OrgRoleGuard**: protege operações dentro de uma organização específica — lê `role` do JWT e valida contra `@OrgRoles()`.

```typescript
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
@Post('championships')
createChampionship() { ... }
```

**SystemAdminGuard**: protege operações de plataforma (criar/deletar orgs, gerenciar users globais, etc.) — lê `isSystemAdmin` do JWT. 

```typescript
@UseGuards(JwtAuthGuard, SystemAdminGuard)
@Post('organizations')
createOrganization() { ... }
```

**Separação de concerns:**
- Sistema admin NÃO bypassa `OrgRoleGuard`
- As duas camadas são completamente independentes
- Um system admin que precise operar dentro de uma org usa endpoints admin dedicados (`/admin/*`), não os endpoints org-user normais
- Campo `is_system_admin` vem da tabela `users` e é baked no JWT no login — sem lookup per-request

## Testes

**Escopo atual:** Testes unitários cobrem apenas **services** (`*.service.spec.ts`).

- Jest configurado em [jest.config.ts](/home/matheusecke/tcc/tcc-api/jest.config.ts:1)
- Pattern: `testMatch: ['<rootDir>/**/*.service.spec.ts']`
- Coverage: apenas `*.service.ts`
- Guards, decorators e strategies testam-se implicitamente via controllers (quando estes forem implementados)

Rodar: `npm test`

## O que ainda não existe

Apesar de a estrutura base de NestJS estar pronta, o projeto ainda não possui nesta fase:

- endpoint de login (que emitirá JWT com `isSystemAdmin` incluído)
- módulos de CRUD implementados para `users`, `organizations`, `teams` e affiliations
- services com regras de negócio do domínio
- controllers de operação além da base do módulo auth
- migrations aplicadas em banco real
- módulo de auditoria/logs com functions e triggers
- módulos de campeonato, partida e estatísticas

## Fluxo de migration adotado

- O schema Prisma descreve o que o ORM suporta diretamente.
- Quando houver `DB-only`:
- atualizar os comentários no schema
- gerar migration com `--create-only`
- complementar o `migration.sql` manualmente
- aplicar a migration depois

Esse fluxo está documentado em [docs/database.md](/home/matheusecke/tcc/tcc-api/docs/database.md:96).

## Próximos blocos naturais

1. **Implementar endpoint de login**
   - Gerar JWT com `isSystemAdmin: boolean` incluído no payload
   - Ler campo `is_system_admin` da tabela `users`
   - Retornar token com organização default (se houver) ou null

2. **Implementar endpoints de admin de plataforma** (`/admin/*`)
   - `POST /admin/organizations` — criar org (protegido por `SystemAdminGuard`)
   - `DELETE /admin/organizations/:id` — deletar org
   - `PATCH /admin/users/:id/set-system-admin` — promover/remover system admin
   - `GET /admin/users` — listar todos os usuários

3. **Implementar CRUDs básicos org-scoped**
   - `POST /organizations/:orgId/teams`
   - `GET /organizations/:orgId/teams`
   - `POST /organizations/:orgId/championships` — criar campeonato
   - Protegidos por `OrgRoleGuard`

4. **Implementar affiliations**
   - Endpoints para adicionar/remover users e teams de orgs
   - Validar role/team consistency com DB constraints

5. **Só depois reintroduzir módulos esportivos** (tournaments, matches, statistics)
