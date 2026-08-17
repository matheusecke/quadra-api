-- =============================================================================
-- LAP / FUPE — seed principal, etapa 9: estatísticas de partida (PlayerMatchStatistic)
-- =============================================================================
--
-- Escopo desta etapa: 1 PlayerMatchStatistic para cada um dos 600 MatchRoster
-- ATHLETE criados na etapa 8 (60 partidas × 10 atletas), reaproveitando o
-- MatchRoster já existente (não cria nem altera MatchRoster).
--
-- Semântica real de PlayerMatchStatistic confirmada na codebase antes de
-- escrever este seed (ver src/matches/matches.service.ts,
-- MatchesService.resolvePlayerStatistics/replacePlayerStatistics,
-- src/matches/dto/match-scoresheet.dto.ts, src/statistics/statistics.service.ts):
--   - Todos os campos numéricos (pts, fgm, fga, three_fgm, three_fga, ftm,
--     fta, reb, ast, stl, blk, tov, pf, minutes_seconds) são Int? no Prisma —
--     nullable no schema porque o rascunho da súmula (SaveMatchDraftDto)
--     permite estatística parcial. Nesta massa de demonstração, porém, cada
--     estatística é "medida": preenchemos todos os campos com inteiros reais
--     (nunca NULL), como pedido — NULL só faria sentido para uma súmula
--     incompleta, que não é o caso aqui.
--   - matches.service.ts normalizePlayerStatistics exige que cada métrica
--     rastreada esteja presente para TODOS os jogadores da partida ou NULL
--     para todos ('Each tracked statistic must be provided for every player
--     or be null for every player') — satisfeito trivialmente aqui porque
--     todo campo é preenchido para as 600 linhas.
--   - resolvePlayerStatistics exige role = ATHLETE (nunca COACHING_STAFF/
--     TEAM_ADMIN) e rejeita usuário duplicado na mesma partida — a origem
--     (MatchRoster da etapa 8) já garante as duas coisas por construção.
--   - replacePlayerStatistics é o único ponto do código que grava
--     PlayerMatchStatistic; ele sempre preenche match_roster_id com o
--     MatchRoster correspondente. Aqui apontamos match_roster_id para o
--     MatchRoster já existente da etapa 8 (mesmo match_id + tournament_roster_id).
--   - Os únicos check constraints do banco (player_match_stats_non_negative_chk
--     e player_match_stats_made_vs_attempted_chk — ver
--     prisma/schema/player-match-statistic.prisma e docs/DATABASE.md) exigem
--     apenas: nenhuma métrica negativa; fgm<=fga; three_fgm<=three_fga;
--     ftm<=fta. Não existe nenhuma constraint de banco nem validação de
--     serviço ligando points a fgm/three_fgm/ftm — a fórmula
--     points = 2×(fgm-three_fgm) + 3×three_fgm + ftm não é imposta pelo
--     domínio. Ainda assim, ela é respeitada por construção neste seed (ver
--     estratégia abaixo) para produzir uma massa de demonstração coerente,
--     sem inventar nenhuma regra que o domínio contradiga.
--   - src/statistics/statistics.service.ts (efficiency()) só calcula EFF
--     quando NENHUMA das dez métricas usadas (pts, reb, ast, stl, blk, fga,
--     fgm, fta, ftm, tov) é NULL — outro motivo para preencher todos os
--     campos com inteiro real em vez de NULL, garantindo que os agregados de
--     liderança/eficiência do Quadra fiquem populados para as 600 linhas.
--
-- NÃO cria/altera (fora de escopo mesmo nesta etapa): usuários, afiliações,
-- TournamentRoster, MatchRoster, partidas, períodos, placares, vencedores,
-- grupos, brackets, campeão, MVP.
--
-- Execução (psql, local ou produção; requer 01..08 já aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/09-player-statistics.sql
--
-- ---------------------------------------------------------------------------
-- Estratégia determinística (sem random(), 100% reprodutível):
-- ---------------------------------------------------------------------------
-- 1) Pontuação por jogador fecha exatamente o final_score do MatchTeam:
--    - Cada posição (PG/SG/SF/PF/C, lida de organization_user_affiliations
--      via tournament_rosters.organization_user_affiliation_id — cada equipe
--      tem exatamente um atleta por posição, ver 06-users-and-affiliations.sql)
--      recebe um peso de participação no placar por "padrão de jogo".
--    - Existem 5 padrões (tmp_point_patterns), cada um somando exatamente
--      5.0 entre as 5 posições, o que torna share = peso/5.0 uma fração
--      exata do placar da equipe. O padrão usado por MatchTeam é escolhido
--      deterministicamente por (match_id, lado) — pattern_index = (match_id*2
--      + (0 se HOME, 1 se AWAY)) % 5 — de forma que a mesma equipe, em
--      partidas diferentes, normalmente cai em padrões diferentes (o
--      match_id muda a cada partida), e os dois lados da mesma partida quase
--      sempre caem em padrões distintos entre si.
--    - raw_points (fracionário) é convertido em pontos inteiros por jogador
--      via floor + "maior resto" (largest remainder method): o resto entre
--      final_score e a soma dos floors é distribuído, um ponto de cada vez,
--      aos jogadores com a maior parte fracionária (ROW_NUMBER determinístico,
--      desempate por tournament_roster_id) — a soma dos 5 fecha exatamente
--      final_score, sempre, para os 120 MatchTeam.
--
-- 2) Composição de arremessos preserva points = 2×(fgm-three_fgm)
--    + 3×three_fgm + ftm por construção, não por arredondamento:
--    - ftm_base = participação de lance-livre nos pontos do jogador
--      (ft_share por posição), limitado a [0, pontos].
--    - three_pts = participação de 3 pontos nos pontos restantes
--      (three_share por posição), arredondado para baixo ao múltiplo de 3
--      mais próximo (garante three_fgm inteiro) e limitado ao restante
--      disponível.
--    - two_pts_raw = pontos restantes após FT e 3PT; se for ímpar, 1 ponto
--      "migra" para ftm (ftm += 1, two_pts -= 1) até virar par — a soma final
--      (ftm + two_pts + three_pts) permanece igual a points em qualquer caso,
--      então a fórmula fecha exatamente, sem NULL nem exceção especial.
--    - three_fgm = three_pts/3 (exato, three_pts já é múltiplo de 3);
--      two_fgm = two_pts/2 (exato, two_pts já é par); fgm = two_fgm+three_fgm
--      — logo three_fgm <= fgm vale sempre, por construção.
--
-- 3) Percentuais/arremessos: cada posição tem FG%/3P%/FT% base (mais alto
--    para pivôs no FG% geral — é um modelo simplificado de percentual
--    combinado 2P+3P, não um modelo por tipo de arremesso — e mais alto para
--    armadores/alas-armadores no 3P%). O lado vencedor de cada partida recebe
--    um pequeno bônus de eficiência (+0.03 FG%/+0.02 3P%/+0.02 FT%) e o
--    perdedor uma pequena penalidade (-0.02/-0.02/-0.01), sempre dentro de
--    limites plausíveis (LEAST/GREATEST) — efeito pequeno, não obrigatório,
--    só para tornar vencedores levemente mais eficientes. fga/fta são
--    derivados de fgm/ftm dividido pelo percentual efetivo (sempre
--    GREATEST(makes, ...), nunca menor que os acertos); three_fga é uma fração
--    de fga (three_attempt_share por posição), sempre entre three_fgm e fga.
--
-- 4) Rebotes/assistências/roubos/tocos/faltas: valor-base por posição (pivôs
--    com mais REB/BLK, armadores com mais AST/STL, alas equilibrados,
--    turnovers moderados) mais uma variação pequena e determinística
--    derivada de (match_id, tournament_roster_id) — nunca random(), sempre a
--    mesma variação na segunda execução — mais um pequeno efeito
--    vencedor/perdedor em turnovers (perdedor comete ligeiramente mais).
--    Faltas usam (match_id, tournament_roster_id) mod 6, sempre entre 0 e 5.
--
-- 5) Minutos: 5 atletas disponíveis por equipe, sem banco extra e sem
--    prorrogação (todas as partidas da etapa 5 são LossType.NORMAL/4 períodos
--    REGULAR) — minutes_seconds = 2400 (40 minutos) para os 5 titulares de
--    cada lado, em todas as partidas.
--
-- Idempotente: o INSERT usa WHERE NOT EXISTS com o mesmo par (match_id,
-- user_id) do índice único parcial player_match_statistics(match_id, user_id)
-- WHERE is_deleted = false (ver docs/DATABASE.md — sem @unique/@@unique no
-- Prisma). Como a estratégia inteira é determinística (sem random()), uma
-- segunda execução recalcula os mesmos 600 candidatos e insere zero linhas.
-- Nenhum ON CONFLICT é usado, pelo mesmo motivo das etapas anteriores.
--
-- Pré-condição: os 600 MatchRoster ATHLETE da etapa 8 já existem, cada um
-- resolve uma posição válida via organization_user_affiliations, e nenhuma
-- das 60 partidas está empatada. Os blocos DO abaixo falham explicitamente
-- (RAISE EXCEPTION, aborta a transação inteira) se qualquer uma dessas
-- condições não bater — nunca cria dados pertencentes a etapas anteriores
-- nem corrige silenciosamente um estado incompatível.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda 1: exatamente 600 MatchRoster ATHLETE/AVAILABLE da etapa 8, 10 por
-- partida e 5 por MatchTeam.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INTEGER;
  v_bad_match_size INTEGER;
  v_bad_team_size INTEGER;
BEGIN
  SELECT count(*) INTO v_total
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    AND mr.role = 'ATHLETE'::roster_role;
  IF v_total <> 600 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 600 MatchRoster ATHLETE ativos, encontrados %. Rode 08-match-rosters.sql primeiro.', v_total;
  END IF;

  SELECT count(*) INTO v_bad_match_size FROM (
    SELECT mr.match_id, count(*) AS members
    FROM match_rosters mr
    JOIN matches m ON m.id = mr.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
      AND mr.role = 'ATHLETE'::roster_role
    GROUP BY mr.match_id
  ) s WHERE members <> 10;
  IF v_bad_match_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) sem exatamente 10 atletas no MatchRoster.', v_bad_match_size;
  END IF;

  SELECT count(*) INTO v_bad_team_size FROM (
    SELECT mr.match_team_id, count(*) AS members
    FROM match_rosters mr
    JOIN matches m ON m.id = mr.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
      AND mr.role = 'ATHLETE'::roster_role
    GROUP BY mr.match_team_id
  ) s WHERE members <> 5;
  IF v_bad_team_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchTeam sem exatamente 5 atletas no MatchRoster.', v_bad_team_size;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 2: todo MatchRoster precisa resolver exatamente uma posição válida
-- via tournament_rosters.organization_user_affiliation_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_position INTEGER;
BEGIN
  SELECT count(*) INTO v_bad_position
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  JOIN tournament_rosters tr ON tr.id = mr.tournament_roster_id
  LEFT JOIN organization_user_affiliations oua ON oua.id = tr.organization_user_affiliation_id
  WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    AND mr.role = 'ATHLETE'::roster_role
    AND (tr.organization_user_affiliation_id IS NULL OR oua.position IS NULL);
  IF v_bad_position > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchRoster sem posição resolvível via organization_user_affiliations.', v_bad_position;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 3: nenhuma das 60 partidas pode estar empatada, e os dois lados
-- precisam ter final_score preenchido.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tie_or_null_count INTEGER;
BEGIN
  SELECT count(*) INTO v_tie_or_null_count
  FROM match_teams home
  JOIN match_teams away ON away.match_id = home.match_id AND away.side = 'AWAY'::match_side AND away.is_deleted = false
  JOIN matches m ON m.id = home.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE home.side = 'HOME'::match_side AND home.is_deleted = false
    AND (home.final_score IS NULL OR away.final_score IS NULL OR home.final_score = away.final_score);
  IF v_tie_or_null_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) empatada(s) ou sem final_score — impossível fechar a soma de pontos por jogador.', v_tie_or_null_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda 4: nenhuma das 60 partidas pode ter já uma PlayerMatchStatistic
-- viva em par (match_id, user_id) fora do que esta etapa vai gerar — estado
-- inesperado nunca é reparado em silêncio (aqui apenas detectamos e travamos
-- se a contagem viva já for diferente de 0 e diferente do total esperado
-- pós-execução, o que indicaria uma execução parcial anterior incompatível).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  SELECT count(*) INTO v_existing_count
  FROM player_match_statistics pms
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false;
  IF v_existing_count NOT IN (0, 600) THEN
    RAISE EXCEPTION 'Seed abortado: % PlayerMatchStatistic viva(s) já existente(s) para estas partidas (esperado 0 ou 600 — estado parcial incompatível não corrigido em silêncio).', v_existing_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Padrões determinísticos de participação no placar (5 padrões × 5 posições,
-- cada padrão soma exatamente 5.0 — share = peso/5.0 é fração exata do
-- final_score do MatchTeam).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_point_patterns (
  pattern_index integer NOT NULL,
  position basketball_position NOT NULL,
  weight numeric(4,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_point_patterns (pattern_index, position, weight) VALUES
  (0, 'PG'::basketball_position, 1.0), (0, 'SG'::basketball_position, 1.5), (0, 'SF'::basketball_position, 1.1), (0, 'PF'::basketball_position, 0.8), (0, 'C'::basketball_position, 0.6),
  (1, 'PG'::basketball_position, 0.7), (1, 'SG'::basketball_position, 1.2), (1, 'SF'::basketball_position, 1.5), (1, 'PF'::basketball_position, 1.0), (1, 'C'::basketball_position, 0.6),
  (2, 'PG'::basketball_position, 0.6), (2, 'SG'::basketball_position, 0.8), (2, 'SF'::basketball_position, 1.0), (2, 'PF'::basketball_position, 1.5), (2, 'C'::basketball_position, 1.1),
  (3, 'PG'::basketball_position, 1.5), (3, 'SG'::basketball_position, 1.0), (3, 'SF'::basketball_position, 0.9), (3, 'PF'::basketball_position, 0.8), (3, 'C'::basketball_position, 0.8),
  (4, 'PG'::basketball_position, 0.6), (4, 'SG'::basketball_position, 0.8), (4, 'SF'::basketball_position, 1.0), (4, 'PF'::basketball_position, 1.1), (4, 'C'::basketball_position, 1.5);

-- ---------------------------------------------------------------------------
-- Perfis por posição: percentuais base de arremesso, participação de FT/3PT
-- nos pontos do jogador, fração de FGA que é de 3 pontos, e valor-base de
-- reb/ast/stl/blk/tov.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_position_profile (
  position basketball_position PRIMARY KEY,
  fg_pct numeric(4,3) NOT NULL,
  three_pct numeric(4,3) NOT NULL,
  ft_pct numeric(4,3) NOT NULL,
  three_attempt_share numeric(4,3) NOT NULL,
  ft_share numeric(4,3) NOT NULL,
  three_share numeric(4,3) NOT NULL,
  reb_base integer NOT NULL,
  ast_base integer NOT NULL,
  stl_base integer NOT NULL,
  blk_base integer NOT NULL,
  tov_base integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_position_profile VALUES
  ('PG'::basketball_position, 0.440, 0.340, 0.750, 0.420, 0.200, 0.250, 3, 7, 2, 0, 3),
  ('SG'::basketball_position, 0.460, 0.370, 0.780, 0.550, 0.150, 0.400, 4, 3, 1, 0, 2),
  ('SF'::basketball_position, 0.470, 0.330, 0.720, 0.380, 0.150, 0.250, 6, 3, 1, 1, 2),
  ('PF'::basketball_position, 0.500, 0.300, 0.680, 0.150, 0.150, 0.080, 9, 1, 1, 2, 2),
  ('C'::basketball_position,  0.540, 0.280, 0.620, 0.060, 0.200, 0.020, 11, 1, 0, 3, 2);

-- ---------------------------------------------------------------------------
-- PlayerMatchStatistic (600) — 1 por MatchRoster ATHLETE da etapa 8, só para
-- pares (match_id, user_id) sem nenhuma linha viva ainda.
-- ---------------------------------------------------------------------------
WITH base AS (
  SELECT
    mr.id AS match_roster_id,
    mr.organization_id,
    mr.match_id,
    mr.match_team_id,
    mr.tournament_roster_id,
    mr.user_id,
    mte.final_score,
    mte.is_winner,
    mte.side,
    oua.position
  FROM match_rosters mr
  JOIN matches m ON m.id = mr.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  JOIN match_teams mte ON mte.id = mr.match_team_id AND mte.is_deleted = false
  JOIN tournament_rosters tr ON tr.id = mr.tournament_roster_id
    AND tr.is_deleted = false AND tr.role = 'ATHLETE'::roster_role AND tr.status = 'ACTIVE'::roster_status
  JOIN organization_user_affiliations oua ON oua.id = tr.organization_user_affiliation_id
  WHERE mr.is_deleted = false AND mr.status = 'AVAILABLE'::match_roster_status
    AND mr.role = 'ATHLETE'::roster_role
),
weighted AS (
  SELECT b.*,
    ((b.match_id * 2 + CASE b.side WHEN 'HOME'::match_side THEN 0 ELSE 1 END) % 5) AS pattern_index
  FROM base b
),
scored AS (
  SELECT w.*, pw.weight,
    (w.final_score::numeric * pw.weight / 5.0) AS raw_points
  FROM weighted w
  JOIN tmp_point_patterns pw ON pw.pattern_index = w.pattern_index AND pw.position = w.position
),
floored AS (
  SELECT s.*,
    floor(s.raw_points)::int AS floor_points,
    (s.raw_points - floor(s.raw_points)) AS frac_points
  FROM scored s
),
remainder_calc AS (
  SELECT f.*,
    (f.final_score - SUM(f.floor_points) OVER (PARTITION BY f.match_team_id))::int AS team_remainder,
    ROW_NUMBER() OVER (PARTITION BY f.match_team_id ORDER BY f.frac_points DESC, f.tournament_roster_id ASC) AS remainder_rank
  FROM floored f
),
points_final AS (
  SELECT r.*,
    (r.floor_points + CASE WHEN r.remainder_rank <= r.team_remainder THEN 1 ELSE 0 END) AS pts
  FROM remainder_calc r
),
profiled AS (
  SELECT p.*, pp.fg_pct, pp.three_pct, pp.ft_pct, pp.three_attempt_share, pp.ft_share, pp.three_share,
    pp.reb_base, pp.ast_base, pp.stl_base, pp.blk_base, pp.tov_base
  FROM points_final p
  JOIN tmp_position_profile pp ON pp.position = p.position
),
shot_split AS (
  SELECT pf.*,
    LEAST(pf.pts, GREATEST(0, ROUND(pf.pts * pf.ft_share)::int)) AS ftm_base
  FROM profiled pf
),
shot_split2 AS (
  SELECT s.*,
    (s.pts - s.ftm_base) AS remaining1,
    LEAST(s.pts - s.ftm_base, GREATEST(0, ROUND(s.pts * s.three_share)::int)) AS three_capped
  FROM shot_split s
),
shot_split3 AS (
  SELECT s2.*,
    (s2.three_capped - (s2.three_capped % 3)) AS three_pts
  FROM shot_split2 s2
),
shot_split4 AS (
  SELECT s3.*,
    (s3.remaining1 - s3.three_pts) AS two_pts_raw
  FROM shot_split3 s3
),
shot_final AS (
  SELECT s4.*,
    (s4.ftm_base + CASE WHEN s4.two_pts_raw % 2 = 1 THEN 1 ELSE 0 END) AS ftm,
    (s4.two_pts_raw - CASE WHEN s4.two_pts_raw % 2 = 1 THEN 1 ELSE 0 END) AS two_pts
  FROM shot_split4 s4
),
makes AS (
  SELECT sf.*,
    (sf.two_pts / 2) AS two_fgm,
    (sf.three_pts / 3) AS three_fgm
  FROM shot_final sf
),
made_totals AS (
  SELECT mk.*, (mk.two_fgm + mk.three_fgm) AS fgm
  FROM makes mk
),
efficiency_adj AS (
  SELECT mt.*,
    LEAST(0.85, GREATEST(0.25, mt.fg_pct + CASE WHEN mt.is_winner THEN 0.03 ELSE -0.02 END)) AS eff_fg_pct,
    LEAST(0.85, GREATEST(0.15, mt.three_pct + CASE WHEN mt.is_winner THEN 0.02 ELSE -0.02 END)) AS eff_three_pct,
    LEAST(0.95, GREATEST(0.40, mt.ft_pct + CASE WHEN mt.is_winner THEN 0.02 ELSE -0.01 END)) AS eff_ft_pct
  FROM made_totals mt
),
attempts AS (
  SELECT ea.*,
    GREATEST(ea.fgm, ROUND(ea.fgm::numeric / ea.eff_fg_pct)::int) AS fga_calc,
    GREATEST(ea.ftm, ROUND(ea.ftm::numeric / ea.eff_ft_pct)::int) AS fta
  FROM efficiency_adj ea
),
attempts2 AS (
  SELECT a.*,
    LEAST(a.fga_calc, GREATEST(a.three_fgm, ROUND(a.fga_calc * a.three_attempt_share)::int)) AS three_fga
  FROM attempts a
),
other_stats AS (
  SELECT a2.*,
    GREATEST(0, a2.reb_base + ((a2.match_id + a2.tournament_roster_id) % 3) - 1) AS reb,
    GREATEST(0, a2.ast_base + ((a2.match_id * 3 + a2.tournament_roster_id) % 3) - 1) AS ast,
    GREATEST(0, a2.stl_base + ((a2.match_id + a2.tournament_roster_id * 2) % 3) - 1) AS stl,
    GREATEST(0, a2.blk_base + ((a2.match_id * 2 + a2.tournament_roster_id) % 3) - 1) AS blk,
    GREATEST(0, a2.tov_base + (CASE WHEN a2.is_winner THEN -1 ELSE 1 END) + ((a2.match_id + a2.tournament_roster_id * 3) % 3) - 1) AS tov,
    ((a2.match_id + a2.tournament_roster_id * 5) % 6) AS pf,
    2400 AS minutes_seconds
  FROM attempts2 a2
)
INSERT INTO player_match_statistics
  (organization_id, match_id, match_team_id, match_roster_id, tournament_roster_id, user_id,
   pts, fgm, fga, three_fgm, three_fga, ftm, fta, reb, ast, stl, blk, tov, pf, minutes_seconds,
   is_deleted, created_at, updated_at)
SELECT
  o.organization_id, o.match_id, o.match_team_id, o.match_roster_id, o.tournament_roster_id, o.user_id,
  o.pts, o.fgm, o.fga_calc, o.three_fgm, o.three_fga, o.ftm, o.fta, o.reb, o.ast, o.stl, o.blk, o.tov, o.pf, o.minutes_seconds,
  false, NOW(), NOW()
FROM other_stats o
WHERE NOT EXISTS (
  SELECT 1 FROM player_match_statistics pms
  WHERE pms.match_id = o.match_id AND pms.user_id = o.user_id AND pms.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Guarda final: quantidade, coerência de pontos, arremessos, equipe,
-- usuário e variedade da massa — tudo antes do commit.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INTEGER;
  v_bad_match_size INTEGER;
  v_bad_team_size INTEGER;
  v_score_mismatch INTEGER;
  v_shot_violation INTEGER;
  v_negative_count INTEGER;
  v_wrong_team INTEGER;
  v_dup_user INTEGER;
  v_distinct_pts INTEGER;
  v_distinct_lines INTEGER;
BEGIN
  SELECT count(*) INTO v_total
  FROM player_match_statistics pms
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false;
  IF v_total <> 600 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 600 PlayerMatchStatistic ativos ao final, encontrados %.', v_total;
  END IF;

  SELECT count(*) INTO v_bad_match_size FROM (
    SELECT pms.match_id, count(*) AS members
    FROM player_match_statistics pms
    JOIN matches m ON m.id = pms.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE pms.is_deleted = false
    GROUP BY pms.match_id
  ) s WHERE members <> 10;
  IF v_bad_match_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) sem exatamente 10 PlayerMatchStatistic.', v_bad_match_size;
  END IF;

  SELECT count(*) INTO v_bad_team_size FROM (
    SELECT pms.match_team_id, count(*) AS members
    FROM player_match_statistics pms
    JOIN matches m ON m.id = pms.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE pms.is_deleted = false
    GROUP BY pms.match_team_id
  ) s WHERE members <> 5;
  IF v_bad_team_size > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchTeam sem exatamente 5 PlayerMatchStatistic.', v_bad_team_size;
  END IF;

  SELECT count(*) INTO v_score_mismatch
  FROM match_teams mte
  JOIN matches m ON m.id = mte.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE mte.is_deleted = false
    AND mte.final_score <> (
      SELECT COALESCE(SUM(pms.pts), 0) FROM player_match_statistics pms
      WHERE pms.match_team_id = mte.id AND pms.is_deleted = false
    );
  IF v_score_mismatch > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchTeam com soma de pontos individuais divergente do final_score.', v_score_mismatch;
  END IF;

  SELECT count(*) INTO v_shot_violation
  FROM player_match_statistics pms
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false
    AND (pms.fgm > pms.fga OR pms.three_fgm > pms.three_fga OR pms.ftm > pms.fta
      OR pms.three_fgm > pms.fgm OR pms.three_fga > pms.fga
      OR pms.pts <> 2 * (pms.fgm - pms.three_fgm) + 3 * pms.three_fgm + pms.ftm);
  IF v_shot_violation > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % PlayerMatchStatistic com arremessos incoerentes (made>attempted, three_fgm>fgm/fga, ou pts fora da fórmula 2×(fgm-3fgm)+3×3fgm+ftm).', v_shot_violation;
  END IF;

  SELECT count(*) INTO v_negative_count
  FROM player_match_statistics pms
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false
    AND (pms.pts < 0 OR pms.fgm < 0 OR pms.fga < 0 OR pms.three_fgm < 0 OR pms.three_fga < 0
      OR pms.ftm < 0 OR pms.fta < 0 OR pms.reb < 0 OR pms.ast < 0 OR pms.stl < 0
      OR pms.blk < 0 OR pms.tov < 0 OR pms.pf < 0 OR pms.minutes_seconds < 0);
  IF v_negative_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % PlayerMatchStatistic com alguma métrica negativa.', v_negative_count;
  END IF;

  SELECT count(*) INTO v_wrong_team
  FROM player_match_statistics pms
  JOIN match_teams mte ON mte.id = pms.match_team_id
  JOIN tournament_rosters tr ON tr.id = pms.tournament_roster_id
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false
    AND (tr.tournament_team_id <> mte.tournament_team_id
      OR tr.tournament_id <> m.tournament_id
      OR tr.user_id <> pms.user_id);
  IF v_wrong_team > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % PlayerMatchStatistic atribuída ao MatchTeam/TournamentRoster errado (possível vazamento para o lado adversário).', v_wrong_team;
  END IF;

  SELECT count(*) INTO v_dup_user FROM (
    SELECT pms.match_id, pms.user_id, count(*) AS c
    FROM player_match_statistics pms
    JOIN matches m ON m.id = pms.match_id
    JOIN tournaments t ON t.id = m.tournament_id
      AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    WHERE pms.is_deleted = false
    GROUP BY pms.match_id, pms.user_id
  ) d WHERE c > 1;
  IF v_dup_user > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % usuário(s) duplicado(s) na mesma partida.', v_dup_user;
  END IF;

  SELECT count(DISTINCT pts) INTO v_distinct_pts
  FROM player_match_statistics pms
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false;
  IF v_distinct_pts < 15 THEN
    RAISE EXCEPTION 'Seed abortado: massa aparentemente degenerada — apenas % valores distintos de pontuação entre 600 linhas.', v_distinct_pts;
  END IF;

  SELECT count(DISTINCT (pms.pts, pms.reb, pms.ast, pms.stl, pms.blk, pms.tov, pms.fgm, pms.fga, pms.pf)) INTO v_distinct_lines
  FROM player_match_statistics pms
  JOIN matches m ON m.id = pms.match_id
  JOIN tournaments t ON t.id = m.tournament_id
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
  WHERE pms.is_deleted = false;
  IF v_distinct_lines < 400 THEN
    RAISE EXCEPTION 'Seed abortado: massa aparentemente degenerada — apenas % linhas estatísticas distintas (pts/reb/ast/stl/blk/tov/fgm/fga/pf) entre 600.', v_distinct_lines;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- 600 PlayerMatchStatistic, 10 por partida, 5 por MatchTeam:
-- SELECT count(*) FROM player_match_statistics pms
--   JOIN matches m ON m.id = pms.match_id JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND pms.is_deleted = false;
--   -- 600
-- SELECT match_id, count(*) FROM player_match_statistics WHERE is_deleted = false
--   GROUP BY match_id HAVING count(*) <> 10;  -- 0 linhas
-- SELECT match_team_id, count(*) FROM player_match_statistics WHERE is_deleted = false
--   GROUP BY match_team_id HAVING count(*) <> 5;  -- 0 linhas
--
-- Soma dos pontos individuais = placar oficial (0 divergências):
-- SELECT mte.id, mte.final_score, SUM(pms.pts) AS soma
--   FROM match_teams mte JOIN player_match_statistics pms ON pms.match_team_id = mte.id
--   WHERE pms.is_deleted = false AND mte.is_deleted = false
--   GROUP BY mte.id, mte.final_score HAVING mte.final_score <> SUM(pms.pts);  -- 0 linhas
--
-- Nenhuma violação de arremessos:
-- SELECT count(*) FROM player_match_statistics
--   WHERE is_deleted = false AND (fgm > fga OR three_fgm > three_fga OR ftm > fta OR three_fgm > fgm);
--   -- 0
--
-- Top 10 em pontos (total, entre os 4 campeonatos):
-- SELECT tr.display_name_snapshot, tt.display_name_snapshot AS team, SUM(pms.pts) AS total_pts, count(*) AS jogos
--   FROM player_match_statistics pms
--   JOIN tournament_rosters tr ON tr.id = pms.tournament_roster_id
--   JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
--   WHERE pms.is_deleted = false
--   GROUP BY tr.display_name_snapshot, tt.display_name_snapshot
--   ORDER BY total_pts DESC LIMIT 10;
--
-- Top 10 em rebotes / assistências / roubos / tocos (trocar SUM(pms.pts) e o
-- ORDER BY pela métrica desejada: reb, ast, stl, blk):
-- SELECT tr.display_name_snapshot, tt.display_name_snapshot AS team, SUM(pms.reb) AS total_reb
--   FROM player_match_statistics pms
--   JOIN tournament_rosters tr ON tr.id = pms.tournament_roster_id
--   JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
--   WHERE pms.is_deleted = false
--   GROUP BY tr.display_name_snapshot, tt.display_name_snapshot
--   ORDER BY total_reb DESC LIMIT 10;
--
-- Estatísticas agregadas por campeonato:
-- SELECT t.slug, count(*) AS linhas, SUM(pms.pts) AS pts_totais,
--     round(AVG(pms.pts), 2) AS pts_media, round(AVG(pms.reb), 2) AS reb_media,
--     round(AVG(pms.ast), 2) AS ast_media
--   FROM player_match_statistics pms
--   JOIN matches m ON m.id = pms.match_id JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND pms.is_deleted = false
--   GROUP BY t.slug ORDER BY t.slug;
--
-- Variedade da massa (não degenerada):
-- SELECT count(DISTINCT pts) FROM player_match_statistics WHERE is_deleted = false;  -- bem maior que 1
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima (todas as fórmulas são determinísticas, sem random()).
-- =============================================================================
