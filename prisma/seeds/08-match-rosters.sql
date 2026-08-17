-- =============================================================================
-- LAP / FUPE — seed principal, etapa 8: elencos de partida (MatchRoster)
-- =============================================================================
--
-- Escopo desta etapa: MatchRoster dos 5 atletas ativos de cada lado das 60
-- partidas da etapa 5, usando os TournamentRoster ativos da etapa 7.
--
-- Semântica real de MatchRoster confirmada na codebase antes de escrever
-- este seed (ver src/matches/matches.service.ts,
-- MatchesService.replacePlayerStatistics/resolvePlayerStatistics — não há
-- controller/módulo dedicado a MatchRoster, é inteiramente um efeito
-- colateral da súmula):
--   - Uma linha só é criada quando uma PlayerMatchStatistic é gravada para
--     aquele (match, tournament_roster); resolvePlayerStatistics EXIGE
--     roster.role = ATHLETE e lança INVALID_MATCH_ROSTER caso contrário — a
--     aplicação nunca cria MatchRoster para COACHING_STAFF nem TEAM_ADMIN.
--     Excluir comissão técnica aqui não é uma regra nova inventada para o
--     seed: é o mesmo domínio já imposto pelo service.
--   - status é sempre gravado como AVAILABLE nos dois pontos de criação do
--     service (linha 1339 ao reativar, linha 1360 ao criar). MatchRosterStatus
--     também define DNP, mas nenhum caminho de código deste projeto grava
--     esse valor — não inventamos um fluxo de "quem não jogou" aqui.
--   - role / jersey_number_snapshot / display_name_snapshot são copiados
--     literalmente do TournamentRoster de origem (tournamentRoster.role,
--     .jerseyNumberSnapshot, .displayNameSnapshot em replacePlayerStatistics).
--   - docs/DATABASE.md descreve match_rosters como "quem foi relacionado
--     para a partida (distinto do elenco do campeonato)" — exatamente a
--     intenção pedida aqui: os 5 atletas titulares/relacionados de cada
--     equipe, sem estatística ainda (PlayerMatchStatistic é etapa futura).
--
-- NÃO cria (fora de escopo mesmo nesta etapa): PlayerMatchStatistic, novos
-- usuários, novas afiliações, novos TournamentRoster, partidas, períodos,
-- resultados, MVP, qualquer alteração em placares.
--
-- Execução (psql, local ou produção; requer 01, 02, 03, 04, 05, 06 e 07 já
-- aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/08-match-rosters.sql
--
-- Resolução: nenhum ID hardcoded, nenhum usuário listado à mão. Para cada
-- MatchTeam das 60 partidas (resolvidas por slug de campeonato), o elenco é
-- montado juntando tournament_rosters pelo MESMO tournament_team_id do
-- MatchTeam, restrito a role = ATHLETE e status = ACTIVE — os 5 atletas do
-- TournamentRoster daquela inscrição específica, nunca do adversário.
--
-- Quantidades esperadas (5 atletas × 2 lados × 60 partidas = 600):
--   Taça LAP 26: 7 partidas × 10 = 70
--   Taça LAP 27: 7 partidas × 10 = 70
--   JUBs 2026:  31 partidas × 10 = 310
--   CPU 2026:   15 partidas × 10 = 150
--   Total: 600 MatchRoster (600 ATHLETE, 0 COACHING_STAFF, 0 TEAM_ADMIN).
--
-- Idempotente: o INSERT usa WHERE NOT EXISTS com o mesmo par (match_id,
-- user_id) do índice único parcial match_rosters(match_id, user_id) WHERE
-- is_deleted = false (ver docs/DATABASE.md — match_rosters não tem
-- @unique/@@unique no Prisma). Esse mesmo par também garante, por
-- construção, o índice único parcial match_rosters(match_id,
-- tournament_roster_id) WHERE is_deleted = false: nesta massa cada usuário
-- tem no máximo um TournamentRoster ATHLETE ativo por tournament_team_id, e
-- cada match_team_id resolve um único tournament_team_id, então
-- (match_id, user_id) e (match_id, tournament_roster_id) nunca divergem.
-- Nenhum ON CONFLICT é possível aqui pelo mesmo motivo das etapas anteriores.
--
-- Pré-condição: as 60 partidas/120 MatchTeam da etapa 5 e os TournamentRoster
-- ativos da etapa 7 (5 ATHLETE por TournamentTeam) já existem, e nenhuma das
-- 60 partidas tem ainda um MatchRoster vivo (is_deleted = false) em status
-- diferente de AVAILABLE. Os blocos DO abaixo falham explicitamente (RAISE
-- EXCEPTION, aborta a transação inteira) se qualquer uma dessas condições
-- não bater — nunca cria dados pertencentes a etapas anteriores nem corrige
-- silenciosamente um estado incompatível.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda 1: as 60 partidas e os 120 MatchTeam (exatamente 2 por partida,
-- HOME e AWAY) da etapa 5 precisam existir.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_match_count INTEGER;
  v_matchteam_count INTEGER;
  v_bad_side_count INTEGER;
BEGIN
  SELECT count(*) INTO v_match_count FROM matches m
  JOIN tournaments t ON t.id = m.tournament_id
  WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND m.is_deleted = false;
  IF v_match_count <> 60 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 60 partidas ativas, encontradas %. Rode 05-matches-and-results.sql primeiro.', v_match_count;
  END IF;

  SELECT count(*) INTO v_matchteam_count FROM match_teams mte
  JOIN matches m ON m.id = mte.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mte.is_deleted = false;
  IF v_matchteam_count <> 120 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 120 MatchTeam ativos (2 por partida), encontrados %. Rode 05-matches-and-results.sql primeiro.', v_matchteam_count;
  END IF;

  SELECT count(*) INTO v_bad_side_count FROM (
    SELECT mte.match_id,
      count(*) AS sides,
      count(DISTINCT mte.side) AS distinct_sides
    FROM match_teams mte
    JOIN matches m ON m.id = mte.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE mte.is_deleted = false
    GROUP BY mte.match_id
  ) s WHERE sides <> 2 OR distinct_sides <> 2;
  IF v_bad_side_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) sem exatamente 2 MatchTeam (HOME e AWAY) ativos.', v_bad_side_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 2: cada MatchTeam precisa resolver um TournamentTeam ativo da
-- mesma partida/campeonato.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_tt_count INTEGER;
BEGIN
  SELECT count(*) INTO v_bad_tt_count
  FROM match_teams mte
  JOIN matches m ON m.id = mte.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mte.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM tournament_teams tt
    WHERE tt.id = mte.tournament_team_id AND tt.tournament_id = m.tournament_id
      AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
  );
  IF v_bad_tt_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchTeam sem TournamentTeam ativo correspondente à mesma partida/campeonato.', v_bad_tt_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 3: cada TournamentTeam tocado por essas 120 MatchTeam precisa ter
-- exatamente 5 atletas ativos no TournamentRoster (etapa 7).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_roster_shape INTEGER;
BEGIN
  SELECT count(*) INTO v_bad_roster_shape FROM (
    SELECT touched.tournament_team_id,
      count(*) FILTER (WHERE tr.role = 'ATHLETE'::roster_role) AS athletes
    FROM (
      SELECT DISTINCT mte.tournament_team_id
      FROM match_teams mte
      JOIN matches m ON m.id = mte.match_id
      JOIN tournaments t ON t.id = m.tournament_id
        AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
      WHERE mte.is_deleted = false
    ) touched
    LEFT JOIN tournament_rosters tr
      ON tr.tournament_team_id = touched.tournament_team_id
     AND tr.is_deleted = false AND tr.status = 'ACTIVE'::roster_status
    GROUP BY touched.tournament_team_id
  ) shape
  WHERE athletes <> 5;
  IF v_bad_roster_shape > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % TournamentTeam(s) sem exatamente 5 atletas ativos no TournamentRoster. Rode 07-tournament-rosters.sql primeiro.', v_bad_roster_shape;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 4: nenhum atleta pode pertencer ao TournamentRoster dos dois lados
-- da mesma partida.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cross_side_count INTEGER;
BEGIN
  SELECT count(*) INTO v_cross_side_count FROM (
    SELECT home_mte.match_id, home_tr.user_id
    FROM match_teams home_mte
    JOIN match_teams away_mte
      ON away_mte.match_id = home_mte.match_id
     AND away_mte.side = 'AWAY'::match_side AND away_mte.is_deleted = false
    JOIN matches m ON m.id = home_mte.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    JOIN tournament_rosters home_tr
      ON home_tr.tournament_team_id = home_mte.tournament_team_id
     AND home_tr.role = 'ATHLETE'::roster_role AND home_tr.status = 'ACTIVE'::roster_status
     AND home_tr.is_deleted = false
    WHERE home_mte.side = 'HOME'::match_side AND home_mte.is_deleted = false
    AND EXISTS (
      SELECT 1 FROM tournament_rosters away_tr
      WHERE away_tr.tournament_team_id = away_mte.tournament_team_id
        AND away_tr.user_id = home_tr.user_id
        AND away_tr.role = 'ATHLETE'::roster_role AND away_tr.status = 'ACTIVE'::roster_status
        AND away_tr.is_deleted = false
    )
  ) x;
  IF v_cross_side_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % atleta(s) presente(s) no TournamentRoster dos dois lados da mesma partida.', v_cross_side_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 5: nenhuma das 60 partidas pode ter um MatchRoster vivo (is_deleted
-- = false) em estado diferente de AVAILABLE — estado inesperado nunca é
-- reparado em silêncio.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unexpected_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unexpected_count
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mr.is_deleted = false AND mr.status <> 'AVAILABLE'::match_roster_status;

  IF v_unexpected_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % elenco(s) de partida vivo(s) em estado inesperado (is_deleted = false, status <> AVAILABLE) encontrado(s) entre as partidas desta etapa.', v_unexpected_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- MatchRoster (600) — 5 ATHLETE por MatchTeam, só para pares (match_id,
-- user_id) sem nenhuma linha viva ainda.
-- ---------------------------------------------------------------------------
INSERT INTO match_rosters
  (organization_id, match_id, match_team_id, tournament_roster_id, user_id,
   role, jersey_number_snapshot, display_name_snapshot, status,
   is_deleted, created_at, updated_at)
SELECT
  mte.organization_id,
  mte.match_id,
  mte.id,
  tr.id,
  tr.user_id,
  tr.role,
  tr.jersey_number_snapshot,
  tr.display_name_snapshot,
  'AVAILABLE'::match_roster_status,
  false,
  NOW(),
  NOW()
FROM match_teams mte
JOIN matches m ON m.id = mte.match_id
JOIN tournaments t ON t.id = m.tournament_id
  AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
JOIN tournament_rosters tr
  ON tr.tournament_team_id = mte.tournament_team_id
 AND tr.role = 'ATHLETE'::roster_role
 AND tr.status = 'ACTIVE'::roster_status
 AND tr.is_deleted = false
WHERE mte.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM match_rosters mr
  WHERE mr.match_id = mte.match_id AND mr.user_id = tr.user_id AND mr.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Guarda final: as contagens totais precisam bater exatamente com o
-- esperado antes do commit.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INTEGER;
  v_lap26 INTEGER;
  v_lap27 INTEGER;
  v_jubs INTEGER;
  v_cpu INTEGER;
  v_non_athlete INTEGER;
  v_bad_match_size INTEGER;
  v_bad_team_size INTEGER;
  v_dup_user INTEGER;
  v_bad_roster_link INTEGER;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE t.slug = 'taca-lap-26-2026'),
    count(*) FILTER (WHERE t.slug = 'taca-lap-27-2027'),
    count(*) FILTER (WHERE t.slug = 'jubs-2026'),
    count(*) FILTER (WHERE t.slug = 'cpu-2026')
  INTO v_total, v_lap26, v_lap27, v_jubs, v_cpu
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status;

  IF v_total <> 600 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 600 match_rosters ativos ao final, encontrados %.', v_total;
  END IF;
  IF v_lap26 <> 70 OR v_lap27 <> 70 OR v_jubs <> 310 OR v_cpu <> 150 THEN
    RAISE EXCEPTION 'Seed abortado: distribuição final inesperada (LAP26=%, LAP27=%, JUBs=%, CPU=%; esperado 70/70/310/150).', v_lap26, v_lap27, v_jubs, v_cpu;
  END IF;

  SELECT count(*) INTO v_non_athlete
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    AND mr.role <> 'ATHLETE'::roster_role;
  IF v_non_athlete > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % match_roster(s) com role diferente de ATHLETE (COACHING_STAFF/TEAM_ADMIN não pertencem a este elenco).', v_non_athlete;
  END IF;

  SELECT count(*) INTO v_bad_match_size FROM (
    SELECT mr.match_id, count(*) AS members
    FROM match_rosters mr
    JOIN matches m ON m.id = mr.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    GROUP BY mr.match_id
  ) s WHERE members <> 10;
  IF v_bad_match_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) sem exatamente 10 atletas no elenco.', v_bad_match_size;
  END IF;

  SELECT count(*) INTO v_bad_team_size FROM (
    SELECT mr.match_team_id, count(*) AS members
    FROM match_rosters mr
    JOIN matches m ON m.id = mr.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    GROUP BY mr.match_team_id
  ) s WHERE members <> 5;
  IF v_bad_team_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchTeam sem exatamente 5 atletas no elenco.', v_bad_team_size;
  END IF;

  SELECT count(*) INTO v_dup_user FROM (
    SELECT mr.match_id, mr.user_id, count(*) AS c
    FROM match_rosters mr
    JOIN matches m ON m.id = mr.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    GROUP BY mr.match_id, mr.user_id
  ) d WHERE c > 1;
  IF v_dup_user > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % usuário(s) duplicado(s) na mesma partida.', v_dup_user;
  END IF;

  SELECT count(*) INTO v_bad_roster_link
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  JOIN match_teams mte ON mte.id = mr.match_team_id
  JOIN tournament_rosters tr ON tr.id = mr.tournament_roster_id
  WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    AND (tr.tournament_team_id <> mte.tournament_team_id
      OR tr.tournament_id <> m.tournament_id
      OR tr.user_id <> mr.user_id);
  IF v_bad_roster_link > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % match_roster(s) cujo TournamentRoster não pertence ao mesmo campeonato/equipe da partida.', v_bad_roster_link;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- SELECT t.slug, count(*) FROM match_rosters mr
--   JOIN matches m ON m.id = mr.match_id
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND mr.is_deleted = false AND mr.status = 'AVAILABLE'
--   GROUP BY t.slug ORDER BY t.slug;
--   -- cpu-2026: 150, jubs-2026: 310, taca-lap-26-2026: 70, taca-lap-27-2027: 70 (total 600)
--
-- 10 atletas por partida:
-- SELECT mr.match_id, count(*) FROM match_rosters mr
--   JOIN matches m ON m.id = mr.match_id
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND mr.is_deleted = false AND mr.status = 'AVAILABLE'
--   GROUP BY mr.match_id HAVING count(*) <> 10;
--   -- 0 linhas
--
-- 5 atletas por MatchTeam:
-- SELECT mr.match_team_id, count(*) FROM match_rosters mr
--   JOIN matches m ON m.id = mr.match_id
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND mr.is_deleted = false AND mr.status = 'AVAILABLE'
--   GROUP BY mr.match_team_id HAVING count(*) <> 5;
--   -- 0 linhas
--
-- Nenhum COACHING_STAFF/TEAM_ADMIN no elenco de partida:
-- SELECT count(*) FROM match_rosters mr
--   WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE' AND mr.role <> 'ATHLETE';
--   -- 0
--
-- Nenhum usuário duplicado na mesma partida:
-- SELECT match_id, user_id, count(*) FROM match_rosters
--   WHERE is_deleted = false AND status = 'AVAILABLE'
--   GROUP BY match_id, user_id HAVING count(*) > 1;
--   -- 0 linhas
--
-- Todo MatchRoster referencia um TournamentRoster do mesmo campeonato/equipe:
-- SELECT count(*) FROM match_rosters mr
--   JOIN matches m ON m.id = mr.match_id
--   JOIN match_teams mte ON mte.id = mr.match_team_id
--   JOIN tournament_rosters tr ON tr.id = mr.tournament_roster_id
--   WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'
--     AND (tr.tournament_team_id <> mte.tournament_team_id
--       OR tr.tournament_id <> m.tournament_id OR tr.user_id <> mr.user_id);
--   -- 0
--
-- Nenhum atleta no lado adversário na mesma partida:
-- SELECT home.match_id, home.user_id FROM match_rosters home
--   JOIN match_teams home_mte ON home_mte.id = home.match_team_id AND home_mte.side = 'HOME'
--   JOIN match_rosters away ON away.match_id = home.match_id AND away.user_id = home.user_id
--   JOIN match_teams away_mte ON away_mte.id = away.match_team_id AND away_mte.side = 'AWAY'
--   WHERE home.is_deleted = false AND away.is_deleted = false;
--   -- 0 linhas
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima.
-- =============================================================================
