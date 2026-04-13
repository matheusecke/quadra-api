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
│   │   └── require-org-role.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── org-role.guard.ts
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
- `JwtAuthGuard`
- `OrgRoleGuard`
- decorators `@CurrentUser()` e `@RequireOrgRole()`

O payload JWT atual está tipado em [src/auth/interfaces/jwt-payload.interface.ts](/home/matheusecke/tcc/tcc-api/src/auth/interfaces/jwt-payload.interface.ts:1):

```ts
{
  sub: number;
  email: string;
  organizationId: number | null;
  role: OrgRole | null;
}
```

## O que ainda não existe

Apesar de a estrutura base de NestJS estar pronta, o projeto ainda não possui nesta fase:

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

1. Subir o Postgres local e aplicar a migration inicial.
2. Implementar os CRUDs básicos de `users`, `organizations` e `teams`.
3. Implementar as regras de negócio das affiliations.
4. Só depois reintroduzir módulos esportivos como tournaments, matches e statistics.
