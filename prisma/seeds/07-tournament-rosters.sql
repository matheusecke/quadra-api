-- =============================================================================
-- LAP / FUPE — seed principal, etapa 7: elencos dos campeonatos (TournamentRoster)
-- =============================================================================
--
-- Escopo desta etapa: elenco (TournamentRoster) de cada uma das 40 inscrições
-- (TournamentTeam) da etapa 3, usando os usuários e afiliações
-- (OrganizationUserAffiliation) globais criados na etapa 6. Cada inscrição
-- recebe exatamente 6 membros: 5 ATHLETE + 1 COACHING_STAFF. O TEAM_ADMIN
-- criado na etapa 6 para cada equipe nunca entra no elenco.
--
-- Fora de escopo (não cria): novos usuários, novas afiliações, novas
-- equipes, novos TournamentTeam, grupos, partidas, MatchRoster,
-- PlayerMatchStatistic, MVP, novas estatísticas.
--
-- Execução (psql, local ou produção; requer 01, 02, 03, 04, 05 e 06 já aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/07-tournament-rosters.sql
--
-- Registros esperados (240 TournamentRoster ativos = 200 ATHLETE + 40 COACHING_STAFF):
--   Taça LAP 26 (8 equipes × 6 = 48)
--   Taça LAP 27 (8 equipes × 6 = 48; mesmas pessoas da Taça LAP 26, uma linha
--     de elenco nova por pessoa porque tournament_team_id é outro)
--   JUBs 2026 (16 equipes × 6 = 96)
--   CPU 2026 (8 equipes × 6 = 48; reaproveita, sem nova afiliação, as pessoas
--     de LEP, FACECA, Direito PUCCAMP — já usadas nas duas Taças LAP — e de
--     ESPM — já usada em JUBs)
--
-- Resolução: nenhum ID é hardcoded. Para cada TournamentTeam ativo dos quatro
-- campeonatos (resolvidos por slug), o elenco é montado juntando
-- organization_user_affiliations pela MESMA organização e MESMA equipe do
-- TournamentTeam (organization_id, team_id), restrito a role IN (ATHLETE,
-- COACHING_STAFF) — exatamente o mesmo par de colunas que
-- TournamentRostersService.resolveMember usa para validar um membro. Isso é
-- o que garante que LEP/FACECA/Direito PUCCAMP (afiliação em LAP e em FUPE)
-- e ESPM (afiliação única em FUPE, reaproveitada por JUBs e CPU) resolvam
-- para as pessoas certas em cada campeonato sem listar e-mails à mão.
--
-- Campos por linha, espelhando TournamentRostersService.create:
--   organization_id / tournament_id / tournament_team_id — do TournamentTeam.
--   user_id / organization_user_affiliation_id — da afiliação resolvida.
--   role — a mesma role da afiliação (org_role), convertida por texto para
--     roster_role (rótulos ATHLETE/COACHING_STAFF idênticos nos dois enums;
--     não há divergência de nomenclatura a preservar aqui).
--   jersey_number_snapshot — o jersey_number da própria afiliação (NULL para
--     COACHING_STAFF, como já gravado na etapa 6). Não redistribuído.
--   display_name_snapshot — o nome do usuário (users.name).
--   status — ACTIVE. joined_at — NOW(). left_at — NULL (omitido do INSERT).
--   TournamentRoster não tem coluna de posição (ver
--   prisma/schema/tournament-roster.prisma); a posição gravada na etapa 6
--   permanece só em organization_user_affiliations.position, sem duplicação aqui.
--
-- Idempotente: cada INSERT usa WHERE NOT EXISTS com o mesmo par
-- (tournament_team_id, user_id) que TournamentRostersService.create usa para
-- detectar duplicata (ver docs/DATABASE.md — tournament_rosters não tem
-- @unique/@@unique no Prisma; a unicidade real é o índice único parcial
-- tournament_rosters(tournament_id, user_id) WHERE is_deleted = false AND
-- role = 'ATHLETE' AND status = 'ACTIVE', mais estrito por role do que o
-- NOT EXISTS por tournament_team_id/user_id usado abaixo — o NOT EXISTS
-- cobre tanto ATHLETE quanto COACHING_STAFF). Nenhum ON CONFLICT é possível
-- aqui pelo mesmo motivo das etapas anteriores.
--
-- Pré-condição: as 40 inscrições ativas da etapa 3 e as afiliações ativas da
-- etapa 6 (5 ATHLETE + 1 COACHING_STAFF + 1 TEAM_ADMIN por equipe/organização)
-- já existem, e nenhuma das 40 inscrições tem ainda um elenco vivo
-- (is_deleted = false) em status diferente de ACTIVE. Os blocos DO abaixo
-- falham explicitamente (RAISE EXCEPTION, aborta a transação inteira) se
-- qualquer uma dessas condições não bater — nunca cria dados pertencentes a
-- etapas anteriores nem corrige silenciosamente um estado incompatível.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda 1: os 4 campeonatos e as 40 inscrições ativas da etapa 3 precisam
-- existir, com a distribuição correta por campeonato (8/8/16/8).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tournament_count INTEGER;
  v_lap26_count INTEGER;
  v_lap27_count INTEGER;
  v_jubs_count INTEGER;
  v_cpu_count INTEGER;
BEGIN
  SELECT count(*) INTO v_tournament_count FROM tournaments
  WHERE slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND is_deleted = false;
  IF v_tournament_count <> 4 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 4 campeonatos ativos, encontrados %. Rode 01-organizations-context.sql primeiro.', v_tournament_count;
  END IF;

  SELECT
    count(*) FILTER (WHERE t.slug = 'taca-lap-26-2026'),
    count(*) FILTER (WHERE t.slug = 'taca-lap-27-2027'),
    count(*) FILTER (WHERE t.slug = 'jubs-2026'),
    count(*) FILTER (WHERE t.slug = 'cpu-2026')
  INTO v_lap26_count, v_lap27_count, v_jubs_count, v_cpu_count
  FROM tournament_teams tt
  JOIN tournaments t ON t.id = tt.tournament_id
  WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;

  IF v_lap26_count <> 8 OR v_lap27_count <> 8 OR v_jubs_count <> 16 OR v_cpu_count <> 8 THEN
    RAISE EXCEPTION 'Seed abortado: distribuição de tournament_teams inesperada (LAP26=%, LAP27=%, JUBs=%, CPU=%; esperado 8/8/16/8). Rode 03-tournament-registrations.sql primeiro.', v_lap26_count, v_lap27_count, v_jubs_count, v_cpu_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 2: cada uma das 40 inscrições precisa ter, na mesma organização e
-- mesma equipe, exatamente 5 ATHLETE + 1 COACHING_STAFF + 1 TEAM_ADMIN ativos
-- (etapa 6). LEFT JOIN preserva as 40 inscrições mesmo se alguma não tiver
-- nenhuma afiliação (conta 0 nesse caso, falhando a comparação abaixo).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_shape_count INTEGER;
BEGIN
  SELECT count(*) INTO v_bad_shape_count FROM (
    SELECT tt.id,
      count(*) FILTER (WHERE oua.role = 'ATHLETE'::org_role) AS athletes,
      count(*) FILTER (WHERE oua.role = 'COACHING_STAFF'::org_role) AS staff,
      count(*) FILTER (WHERE oua.role = 'TEAM_ADMIN'::org_role) AS admins
    FROM tournament_teams tt
    JOIN tournaments t ON t.id = tt.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    LEFT JOIN organization_user_affiliations oua
      ON oua.organization_id = tt.organization_id
     AND oua.team_id = tt.team_id
     AND oua.is_deleted = false
     AND oua.status = 'ACTIVE'::affiliation_status
    WHERE tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
    GROUP BY tt.id
  ) shape
  WHERE athletes <> 5 OR staff <> 1 OR admins <> 1;

  IF v_bad_shape_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % inscrição(ões) sem exatamente 5 ATHLETE + 1 COACHING_STAFF + 1 TEAM_ADMIN ativos afiliados à mesma organização/equipe. Rode 06-users-and-affiliations.sql primeiro.', v_bad_shape_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 3: nenhum usuário com afiliação ativa de atleta/staff pode estar
-- afiliado a mais de uma equipe dentro da mesma organização entre as
-- equipes tocadas por esta etapa — garante que a resolução por
-- (organization_id, team_id) não misture pessoas de equipes diferentes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cross_team_count INTEGER;
BEGIN
  SELECT count(*) INTO v_cross_team_count FROM (
    SELECT oua.organization_id, oua.user_id
    FROM organization_user_affiliations oua
    JOIN tournament_teams tt
      ON tt.organization_id = oua.organization_id AND tt.team_id = oua.team_id
     AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
    JOIN tournaments t ON t.id = tt.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE oua.role IN ('ATHLETE'::org_role, 'COACHING_STAFF'::org_role)
      AND oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status
    GROUP BY oua.organization_id, oua.user_id
    HAVING count(DISTINCT oua.team_id) > 1
  ) dup;

  IF v_cross_team_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % usuário(s) com afiliação ativa de atleta/staff em mais de uma equipe na mesma organização.', v_cross_team_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 4: nenhuma das 40 inscrições pode ter um elenco vivo (is_deleted =
-- false) em estado diferente de ACTIVE — estado inesperado nunca é
-- reparado em silêncio.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unexpected_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unexpected_count
  FROM tournament_rosters tr
  JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
  JOIN tournaments t ON t.id = tt.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE tr.is_deleted = false AND tr.status <> 'ACTIVE'::roster_status;

  IF v_unexpected_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % elenco(s) vivo(s) em estado inesperado (is_deleted = false, status <> ACTIVE) encontrado(s) entre os campeonatos desta etapa.', v_unexpected_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Elencos (240) — 5 ATHLETE + 1 COACHING_STAFF por inscrição, só para pares
-- (tournament_team_id, user_id) sem nenhuma linha viva ainda.
-- ---------------------------------------------------------------------------
INSERT INTO tournament_rosters
  (organization_id, tournament_id, tournament_team_id, user_id,
   organization_user_affiliation_id, role, jersey_number_snapshot,
   display_name_snapshot, status, joined_at, is_deleted, created_at, updated_at)
SELECT
  tt.organization_id,
  tt.tournament_id,
  tt.id,
  oua.user_id,
  oua.id,
  oua.role::text::roster_role,
  oua.jersey_number,
  u.name,
  'ACTIVE'::roster_status,
  NOW(),
  false,
  NOW(),
  NOW()
FROM tournament_teams tt
JOIN tournaments t ON t.id = tt.tournament_id
  AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
JOIN organization_user_affiliations oua
  ON oua.organization_id = tt.organization_id
 AND oua.team_id = tt.team_id
 AND oua.role IN ('ATHLETE'::org_role, 'COACHING_STAFF'::org_role)
 AND oua.is_deleted = false
 AND oua.status = 'ACTIVE'::affiliation_status
JOIN users u ON u.id = oua.user_id AND u.is_deleted = false
WHERE tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
AND NOT EXISTS (
  SELECT 1 FROM tournament_rosters tr
  WHERE tr.tournament_team_id = tt.id AND tr.user_id = oua.user_id AND tr.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Guarda final: as contagens totais precisam bater exatamente com o
-- esperado antes do commit.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INTEGER;
  v_athletes INTEGER;
  v_staff INTEGER;
  v_lap26 INTEGER;
  v_lap27 INTEGER;
  v_jubs INTEGER;
  v_cpu INTEGER;
  v_bad_team_size INTEGER;
  v_admin_leak INTEGER;
  v_duplicate_athlete INTEGER;
  v_jersey_mismatch INTEGER;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE tr.role = 'ATHLETE'::roster_role),
    count(*) FILTER (WHERE tr.role = 'COACHING_STAFF'::roster_role),
    count(*) FILTER (WHERE t.slug = 'taca-lap-26-2026'),
    count(*) FILTER (WHERE t.slug = 'taca-lap-27-2027'),
    count(*) FILTER (WHERE t.slug = 'jubs-2026'),
    count(*) FILTER (WHERE t.slug = 'cpu-2026')
  INTO v_total, v_athletes, v_staff, v_lap26, v_lap27, v_jubs, v_cpu
  FROM tournament_rosters tr
  JOIN tournaments t ON t.id = tr.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE tr.is_deleted = false AND tr.status = 'ACTIVE'::roster_status;

  IF v_total <> 240 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 240 tournament_rosters ativos ao final, encontrados %.', v_total;
  END IF;
  IF v_athletes <> 200 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 200 ATHLETE, encontrados %.', v_athletes;
  END IF;
  IF v_staff <> 40 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 40 COACHING_STAFF, encontrados %.', v_staff;
  END IF;
  IF v_lap26 <> 48 OR v_lap27 <> 48 OR v_jubs <> 96 OR v_cpu <> 48 THEN
    RAISE EXCEPTION 'Seed abortado: distribuição final inesperada (LAP26=%, LAP27=%, JUBs=%, CPU=%; esperado 48/48/96/48).', v_lap26, v_lap27, v_jubs, v_cpu;
  END IF;

  SELECT count(*) INTO v_bad_team_size FROM (
    SELECT tr.tournament_team_id, count(*) AS members
    FROM tournament_rosters tr
    JOIN tournaments t ON t.id = tr.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE tr.is_deleted = false AND tr.status = 'ACTIVE'::roster_status
    GROUP BY tr.tournament_team_id
  ) s WHERE members <> 6;
  IF v_bad_team_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % inscrição(ões) sem exatamente 6 membros no elenco.', v_bad_team_size;
  END IF;

  SELECT count(*) INTO v_admin_leak
  FROM tournament_rosters tr
  JOIN tournaments t ON t.id = tr.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  JOIN organization_user_affiliations oua ON oua.id = tr.organization_user_affiliation_id
  WHERE tr.is_deleted = false AND tr.status = 'ACTIVE'::roster_status
    AND oua.role = 'TEAM_ADMIN'::org_role;
  IF v_admin_leak > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % TEAM_ADMIN vazou para tournament_rosters.', v_admin_leak;
  END IF;

  SELECT count(*) INTO v_duplicate_athlete FROM (
    SELECT tr.tournament_id, tr.user_id
    FROM tournament_rosters tr
    JOIN tournaments t ON t.id = tr.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE tr.role = 'ATHLETE'::roster_role AND tr.is_deleted = false AND tr.status = 'ACTIVE'::roster_status
    GROUP BY tr.tournament_id, tr.user_id
    HAVING count(DISTINCT tr.tournament_team_id) > 1
  ) d;
  IF v_duplicate_athlete > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % atleta(s) inscrito(s) por mais de uma equipe no mesmo campeonato.', v_duplicate_athlete;
  END IF;

  SELECT count(*) INTO v_jersey_mismatch
  FROM tournament_rosters tr
  JOIN tournaments t ON t.id = tr.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  JOIN organization_user_affiliations oua ON oua.id = tr.organization_user_affiliation_id
  WHERE tr.is_deleted = false AND tr.status = 'ACTIVE'::roster_status
    AND tr.jersey_number_snapshot IS DISTINCT FROM oua.jersey_number;
  IF v_jersey_mismatch > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % elenco(s) com jersey_number_snapshot divergente da afiliação de origem.', v_jersey_mismatch;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- SELECT t.slug, count(*) FROM tournament_rosters tr
--   JOIN tournaments t ON t.id = tr.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND tr.is_deleted = false AND tr.status = 'ACTIVE'
--   GROUP BY t.slug ORDER BY t.slug;
--   -- cpu-2026: 48, jubs-2026: 96, taca-lap-26-2026: 48, taca-lap-27-2027: 48 (total 240)
--
-- SELECT tr.role, count(*) FROM tournament_rosters tr
--   JOIN tournaments t ON t.id = tr.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND tr.is_deleted = false AND tr.status = 'ACTIVE'
--   GROUP BY tr.role ORDER BY tr.role;
--   -- ATHLETE: 200, COACHING_STAFF: 40
--
-- SELECT tr.tournament_team_id, count(*) FROM tournament_rosters tr
--   JOIN tournaments t ON t.id = tr.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND tr.is_deleted = false AND tr.status = 'ACTIVE'
--   GROUP BY tr.tournament_team_id HAVING count(*) <> 6;
--   -- 0 linhas (todas as 40 inscrições têm exatamente 6 membros)
--
-- Nenhum TEAM_ADMIN no elenco:
-- SELECT count(*) FROM tournament_rosters tr
--   JOIN organization_user_affiliations oua ON oua.id = tr.organization_user_affiliation_id
--   WHERE tr.is_deleted = false AND tr.status = 'ACTIVE' AND oua.role = 'TEAM_ADMIN';
--   -- 0
--
-- Nenhum atleta em duas equipes no mesmo campeonato:
-- SELECT tr.tournament_id, tr.user_id, count(DISTINCT tr.tournament_team_id)
--   FROM tournament_rosters tr
--   WHERE tr.role = 'ATHLETE' AND tr.is_deleted = false AND tr.status = 'ACTIVE'
--   GROUP BY tr.tournament_id, tr.user_id HAVING count(DISTINCT tr.tournament_team_id) > 1;
--   -- 0 linhas
--
-- Jersey numbers coerentes com a afiliação de origem (etapa 6):
-- SELECT count(*) FROM tournament_rosters tr
--   JOIN organization_user_affiliations oua ON oua.id = tr.organization_user_affiliation_id
--   WHERE tr.is_deleted = false AND tr.status = 'ACTIVE'
--     AND tr.jersey_number_snapshot IS DISTINCT FROM oua.jersey_number;
--   -- 0
--
-- LEP/FACECA/Direito PUCCAMP: mesmas pessoas nas duas Taças LAP e no CPU
-- (0 linhas = ninguém dessas equipes aparece em só 1 ou 2 desses 3 campeonatos):
-- SELECT u.email, count(DISTINCT t.slug) FROM tournament_rosters tr
--   JOIN tournaments t ON t.id = tr.tournament_id
--     AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'cpu-2026')
--   JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
--   JOIN teams te ON te.id = tt.team_id AND te.slug IN ('lep', 'faceca', 'direito-puccamp')
--   JOIN users u ON u.id = tr.user_id
--   WHERE tr.is_deleted = false AND tr.status = 'ACTIVE'
--   GROUP BY u.email HAVING count(DISTINCT t.slug) <> 3;
--   -- 0 linhas
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima.
-- =============================================================================
