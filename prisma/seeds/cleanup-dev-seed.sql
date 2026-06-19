-- =============================================================================
-- DEV CLEANUP — remove todos os dados de seed/dev, preserva user id = 1
-- =============================================================================
--
-- Execução direta no PostgreSQL / DBeaver:
--   psql "$DATABASE_URL" -f prisma/seeds/cleanup-dev-seed.sql
--
-- Hard delete intencional para ambiente de desenvolvimento local.
-- Mantém apenas o usuário real (id = 1) e seus refresh tokens pessoais.
-- =============================================================================

BEGIN;

DELETE FROM refresh_tokens
WHERE user_id != 1 OR organization_id IS NOT NULL;

DELETE FROM organization_user_affiliations;
DELETE FROM organization_team_affiliations;
DELETE FROM users WHERE id != 1;
DELETE FROM teams;
DELETE FROM organizations;

COMMIT;

-- Verificação esperada após execução:
-- SELECT count(*) FROM users;                    -- 1
-- SELECT count(*) FROM organizations;            -- 0
-- SELECT count(*) FROM teams;                    -- 0
-- SELECT count(*) FROM organization_user_affiliations; -- 0
