# Estrutura da API — tcc-api

Visão atual do backend NestJS + Prisma, alinhada ao estado real do projeto neste momento.

## Estado atual

- Backend em NestJS com `ConfigModule` global, `ThrottlerModule`, `PrismaModule`, `AuthModule` e `UsersModule` registrados em [src/app.module.ts](/home/matheusecke/tcc/tcc-api/src/app.module.ts:1).
- Bootstrap com `ValidationPipe`, filtros globais para exceções da API e Prisma, `cookie-parser` e Swagger em `/api`, conforme [src/main.ts](/home/matheusecke/tcc/tcc-api/src/main.ts:1).
- Prisma configurado com multi-file schema em `prisma/schema/`.
- O schema atual cobre o núcleo multi-tenant e o fluxo de sessão/autenticação:
- `User`
- `Organization`
- `Team`
- `OrganizationUserAffiliation`
- `OrganizationTeamAffiliation`
- `RefreshToken`
- Módulos de campeonato, partida e estatísticas não fazem parte do schema atual.

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
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── org-roles.decorator.ts
│   │   └── system-admin.decorator.ts
│   ├── dto/
│   │   ├── change-password.dto.ts
│   │   ├── choose-org.dto.ts
│   │   ├── login-response.dto.ts
│   │   ├── login.dto.ts
│   │   ├── me-response.dto.ts
│   │   ├── org-affiliation.dto.ts
│   │   └── token-response.dto.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── org-role.guard.ts
│   │   └── system-admin.guard.ts
│   ├── interfaces/
│   │   └── jwt-payload.interface.ts
│   └── strategies/
│       └── jwt.strategy.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
│       ├── create-user.dto.ts
│       └── user-response.dto.ts
```

```text
prisma/
├── schema/
│   ├── enums.prisma
│   ├── schema.prisma
│   ├── user.prisma
│   ├── organization.prisma
│   ├── team.prisma
│   ├── refresh-token.prisma
│   ├── organization-user-affiliation.prisma
│   └── organization-team-affiliation.prisma
└── migrations/
```

## Banco atual

### Modelos atuais

| Model Prisma | Tabela no banco | Função |
| --- | --- | --- |
| `User` | `users` | Identidade global do usuário |
| `Organization` | `organizations` | Tenant raiz |
| `Team` | `teams` | Identidade global da equipe |
| `RefreshToken` | `refresh_tokens` | Sessão persistida para rotação e revogação de refresh token |
| `OrganizationUserAffiliation` | `organization_user_affiliations` | Papel do usuário e vínculo opcional com time dentro da organização |
| `OrganizationTeamAffiliation` | `organization_team_affiliations` | Relação contextual de equipe com organização |

### Convenções

- Models Prisma em singular `PascalCase`.
- Fields Prisma em `camelCase`.
- Tabelas do banco em plural `snake_case`.
- Colunas do banco em `snake_case`.
- IDs sequenciais com `Int @default(autoincrement())`.
- `status` existe em `users`, `organizations` e `teams`.
- `is_deleted` existe nas entidades centrais e affiliations; `refresh_tokens` usa revogação explícita via `is_revoked`.
- Itens PostgreSQL não mapeados diretamente pelo Prisma são tratados como `DB-only` e documentados com comentário no schema.

Mais detalhes estão em [DATABASE.md](/home/matheusecke/tcc/tcc-api/docs/DATABASE.md:1).

## Prisma

O Prisma é acessado por um único serviço global:

- [src/prisma/prisma.service.ts](/home/matheusecke/tcc/tcc-api/src/prisma/prisma.service.ts:1) estende `PrismaClient`
- conecta no `onModuleInit`
- desconecta no `onModuleDestroy`

Esse serviço é exportado por [src/prisma/prisma.module.ts](/home/matheusecke/tcc/tcc-api/src/prisma/prisma.module.ts:1) e registrado como módulo global.

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

- Respostas comuns passam pelo `ResponseTransformInterceptor`, registrado globalmente em [src/app.module.ts](/home/matheusecke/tcc/tcc-api/src/app.module.ts:19).
- `PaginationInterceptor` já existe na base, mas ainda não está aplicado em endpoints atuais.
- A convenção `{ count, data }` fica reservada para listas paginadas quando esse interceptor for adotado.

## Auth atual

O módulo de autenticação já possui controller, service e fluxo funcional de sessão:

- `AuthController`
- `AuthService`
- `JwtStrategy`
- `JwtAuthGuard` — valida JWT
- `OrgRoleGuard` — verifica papel dentro de uma organização
- `SystemAdminGuard` — verifica se usuário é admin de plataforma
- decorators `@CurrentUser()`, `@OrgRoles()` e `@SystemAdmin()`

### Endpoints atuais

- `POST /auth/login` — autentica usuário, retorna `accessToken` e grava `refreshToken` em cookie `httpOnly`
- `POST /auth/refresh` — rotaciona refresh token e emite novo `accessToken`
- `POST /auth/logout` — revoga o refresh token atual e limpa o cookie
- `GET /auth/me` — retorna contexto do usuário autenticado
- `GET /auth/org` — lista afiliações do usuário
- `POST /auth/org` — escolhe uma organização e emite JWT com contexto da org
- `POST /auth/change-password` — troca senha e revoga os refresh tokens ativos

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

### Sessão e refresh token

- `accessToken` é JWT assinado com expiração curta configurada no `JwtModule`.
- `refreshToken` é opaco, armazenado no client em cookie `httpOnly` e persistido no banco apenas como hash em `refresh_tokens`.
- O refresh token atual é rotacionado a cada uso do endpoint `POST /auth/refresh`.
- Logout revoga o token atual; troca de senha revoga todos os refresh tokens ativos do usuário.

**TODO — hardening do fluxo de auth/session:**

- alinhar expiração do cookie de refresh token com a configuração real de expiração
- tornar a rotação de refresh token transacional
- revalidar status/estado do usuário durante o refresh
- avaliar detecção de reuse de refresh token e revogação de sessão/família de tokens
- revisar esse fluxo antes de integrar front-end real ou preparar ambiente de produção

### Camadas de autorização

**OrgRoleGuard**: protege operações dentro de uma organização específica, lendo `role` do JWT e validando contra `@OrgRoles()`.

```typescript
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
@Post('organizations/:orgId/teams')
createTeam() { ... }
```

**SystemAdminGuard**: protege operações de plataforma, lendo `isSystemAdmin` do JWT.

```typescript
@UseGuards(JwtAuthGuard, SystemAdminGuard)
@Post('admin/organizations')
createOrganization() { ... }
```

**Separação de concerns:**

- Sistema admin não bypassa `OrgRoleGuard` automaticamente.
- As duas camadas são independentes.
- O campo `is_system_admin` vem da tabela `users` e é incorporado ao JWT no login, sem lookup per-request.

## Users atual

O módulo `users` já possui implementação inicial:

- `POST /users` — cria usuário com hash de senha
- `GET /users/:id` — busca usuário ativo por ID

Hoje esse módulo ainda não possui autenticação/autorização própria nem operações de listagem, atualização ou remoção.

## Testes

**Escopo atual:** testes unitários cobrem apenas **services** (`*.service.spec.ts`).

- Jest configurado em [jest.config.ts](/home/matheusecke/tcc/tcc-api/jest.config.ts:1)
- Pattern: `testMatch: ['<rootDir>/**/*.service.spec.ts']`
- Coverage: apenas `*.service.ts`
- Guards, decorators, strategies e controllers ainda não têm cobertura dedicada

Rodar: `npm test`

## O que ainda não existe

Apesar de a base da aplicação já estar funcional, ainda não existem nesta fase:

- CRUD completo para `users`, `organizations`, `teams` e affiliations
- endpoints administrativos de plataforma (`/admin/*`)
- endpoints org-scoped além dos fluxos atuais de auth
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

Esse fluxo está documentado em [DATABASE.md](/home/matheusecke/tcc/tcc-api/docs/DATABASE.md:96).

## Próximos blocos naturais

1. **Implementar endpoints de admin de plataforma** (`/admin/*`)
   - `POST /admin/organizations` — criar org
   - `DELETE /admin/organizations/:id` — deletar org
   - `PATCH /admin/users/:id/set-system-admin` — promover/remover system admin
   - `GET /admin/users` — listar usuários

2. **Expandir CRUDs básicos**
   - `users`: listagem, atualização e soft delete
   - `organizations` e `teams`: criação, busca, atualização e desativação

3. **Implementar endpoints org-scoped**
   - `POST /organizations/:orgId/teams`
   - `GET /organizations/:orgId/teams`
   - protegidos por `OrgRoleGuard`

4. **Implementar affiliations**
   - endpoints para adicionar/remover users e teams de orgs
   - validar role/team consistency com DB constraints

5. **Só depois reintroduzir módulos esportivos**
   - tournaments
   - matches
   - statistics
