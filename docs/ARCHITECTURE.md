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
│   │   ├── register.dto.ts
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
│       ├── list-users-query.dto.ts
│       ├── set-system-admin.dto.ts
│       ├── update-user-status.dto.ts
│       ├── update-user.dto.ts
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
- `PaginationInterceptor` is applied by paginated endpoints such as `GET /users`.
- Paginated services return `{ count, data }`; the interceptor exposes `{ data, meta, links, statusCode }`.

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

- `POST /auth/register` — creates an `ACTIVE`, non-system-admin user, returns `accessToken`, and stores `refreshToken` in an `httpOnly` cookie
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
- Login and refresh require the user to be `ACTIVE` and not soft-deleted.
- Refresh tokens are revoked after password change, email change, user deactivation, platform-admin flag changes, and user soft delete.

**TODO — hardening do fluxo de auth/session:**

- alinhar expiração do cookie de refresh token com a configuração real de expiração
- tornar a rotação de refresh token transacional
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

The `users` module provides account identity operations. It is not the primary source for future roster, coaching staff, or stats screens; those should use organization/team/affiliation domain endpoints and include user identity as related data.

### Current endpoints

| Method | Path | Guards | Purpose |
| --- | --- | --- | --- |
| `POST` | `/users` | `JwtAuthGuard`, `SystemAdminGuard` | Create a global user; accepts optional `isSystemAdmin`; does not log in the created user |
| `GET` | `/users` | `JwtAuthGuard`, `SystemAdminGuard` | Admin paginated list; supports identity filters and optional affiliation filters |
| `GET` | `/users/:id` | `JwtAuthGuard`, `SystemAdminGuard` | Admin lookup by ID |
| `PATCH` | `/users/:id` | `JwtAuthGuard`, `SystemAdminGuard` | Admin profile update for `email` and `name`; revokes refresh tokens when email changes |
| `PATCH` | `/users/:id/status` | `JwtAuthGuard`, `SystemAdminGuard` | Update user status; revokes refresh tokens when status becomes `INACTIVE` |
| `PATCH` | `/users/:id/system-admin` | `JwtAuthGuard`, `SystemAdminGuard` | Promote or demote platform admin access; revokes refresh tokens |
| `DELETE` | `/users/:id` | `JwtAuthGuard`, `SystemAdminGuard` | Soft delete user, set `status=INACTIVE`, and revoke refresh tokens |

### Admin user management rules

- User CRUD endpoints are platform-admin operations.
- `GET /users` keeps optional `organizationId`, `teamId`, and `role` filters for administrative searches, but user-facing roster/team views should be implemented through affiliation endpoints.
- Self-delete, self-deactivation, and self-demotion are rejected to prevent account lockout.

## Testes

**Escopo atual:** testes unitários cobrem apenas **services** (`*.service.spec.ts`).

- Jest configurado em [jest.config.ts](/home/matheusecke/tcc/tcc-api/jest.config.ts:1)
- Pattern: `testMatch: ['<rootDir>/**/*.service.spec.ts']`
- Coverage: apenas `*.service.ts`
- Guards, decorators, strategies e controllers ainda não têm cobertura dedicada

Rodar: `npm test`

## O que ainda não existe

Apesar de a base da aplicação já estar funcional, ainda não existem nesta fase:

- CRUD completo para `organizations`, `teams` e affiliations
- endpoints administrativos de plataforma para recursos além de users (`/admin/*`)
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

2. **Expandir CRUDs básicos**
   - `organizations` e `teams`: criação, busca, atualização e desativação

3. **Implementar endpoints org-scoped**
   - `POST /organizations/:orgId/teams`
   - `GET /organizations/:orgId/teams`
   - protegidos por `OrgRoleGuard`

4. **Implementar affiliations**
   - endpoints para adicionar/remover users e teams de orgs
   - validar role/team consistency com DB constraints
   - endpoints de listagem de elenco, atletas e comissão técnica devem partir de affiliations, não de `/users`

5. **Só depois reintroduzir módulos esportivos**
   - tournaments
   - matches
   - statistics
