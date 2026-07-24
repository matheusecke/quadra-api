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
DELETE FROM users WHERE id != 1;
DELETE FROM teams;
DELETE FROM organizations;

COMMIT;

-- Verificação esperada após execução:
-- SELECT count(*) FROM users;                    -- 1
-- SELECT count(*) FROM organizations;            -- 0
-- SELECT count(*) FROM teams;                    -- 0
-- SELECT count(*) FROM organization_user_affiliations; -- 0
-- SELECT count(*) FROM tournaments;              -- 0
-- SELECT count(*) FROM player_match_statistics;  -- 0
