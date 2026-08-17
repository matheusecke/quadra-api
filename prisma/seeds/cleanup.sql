-- =============================================================================
-- DEV CLEANUP — remove todos os dados de seed/dev, preserva um usuário
-- =============================================================================
--
-- Execução direta no PostgreSQL / DBeaver:
--   psql "$DATABASE_URL" -f prisma/seeds/cleanup.sql
--
-- Hard delete intencional para ambiente de desenvolvimento local.
-- Mantém apenas o usuário real (matheusecke@gmail.com, resolvido por
-- e-mail — nunca por id hardcoded) e seus refresh tokens pessoais.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Resolve o usuário preservado uma única vez, por e-mail. Falha antes de
-- qualquer DELETE se ele não existir — nunca cria o usuário, nunca assume um
-- id fixo.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE preserved_user (id INTEGER NOT NULL) ON COMMIT DROP;

INSERT INTO preserved_user (id)
SELECT id FROM users WHERE email = 'matheusecke@gmail.com' AND is_deleted = false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM preserved_user) THEN
    RAISE EXCEPTION 'Cleanup abortado: nenhum usuário ativo encontrado com email matheusecke@gmail.com. Nenhum dado foi removido.';
  END IF;
END $$;

DELETE FROM refresh_tokens
WHERE user_id != (SELECT id FROM preserved_user) OR organization_id IS NOT NULL;

-- Sports tables first, child-before-parent. Their FKs are ON DELETE RESTRICT
-- (competition history must not be silently destroyed), so deleting teams or
-- organizations while any sports row exists would fail. Order matters: each
-- table is removed before anything it depends on.
DELETE FROM player_match_statistics;
DELETE FROM match_rosters;
DELETE FROM match_periods;
DELETE FROM match_teams;
DELETE FROM matches;
DELETE FROM tournament_bracket_slots;
DELETE FROM tournament_bracket_rounds;
DELETE FROM tournament_group_teams;
DELETE FROM tournament_groups;
DELETE FROM tournament_rosters;
DELETE FROM tournament_teams;
DELETE FROM tournaments;
DELETE FROM tournament_categories;
DELETE FROM seasons;

DELETE FROM organization_user_affiliations;
DELETE FROM organization_team_affiliations;
DELETE FROM users WHERE id != (SELECT id FROM preserved_user);
DELETE FROM teams;
DELETE FROM organizations;

COMMIT;

-- Verificação esperada após execução:
-- SELECT count(*) FROM users;                    -- 1
-- SELECT email FROM users;                       -- matheusecke@gmail.com
-- SELECT count(*) FROM organizations;            -- 0
-- SELECT count(*) FROM teams;                    -- 0
-- SELECT count(*) FROM organization_user_affiliations; -- 0
-- SELECT count(*) FROM tournaments;              -- 0
-- SELECT count(*) FROM player_match_statistics;  -- 0
