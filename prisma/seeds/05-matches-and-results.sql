-- =============================================================================
-- LAP / FUPE — seed principal, etapa 5: partidas e resultados
-- =============================================================================
--
-- Escopo desta etapa: Match, MatchTeam e MatchPeriod para as 60 partidas que
-- completam os quatro campeonatos (fase de grupos + mata-mata), sincronização
-- dos slots de bracket criados na etapa 4 (equipe, match_id, vencedor) e
-- finalização dos campeonatos (status COMPLETED + campeão).
--
-- NÃO cria (etapa futura, mesma pasta):
--   06-rosters-and-statistics.sql        — elencos e estatísticas
--
-- Fora de escopo mesmo nesta etapa: usuários, atletas, TournamentRoster,
-- MatchRoster, PlayerMatchStatistic, MVP. Todo resultado é LossType.NORMAL —
-- nenhuma partida usa DEFAULT, FORFEIT ou período de OVERTIME.
--
-- Execução (psql, local ou produção; requer 01, 02, 03 e 04 já aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/05-matches-and-results.sql
--
-- Fluxo real de resultado (ver src/matches/matches.service.ts,
-- MatchesService.saveResult/derivePlayedResult/buildDerivedResult): um
-- resultado NORMAL exige 4 períodos regulamentares cuja soma decide o
-- vencedor; o lado vencedor recebe result=WIN e loss_type=NULL, o perdedor
-- result=LOSS e loss_type=NORMAL (match_teams_result_loss_type_chk exige
-- loss_type IS NOT NULL exatamente quando result=LOSS); is_winner é
-- boolean para os dois lados. O slot de bracket associado a uma partida
-- guarda apenas match_id e winner_tournament_team_id — o vencedor não é
-- derivado automaticamente por nenhum trigger, é escrito aqui explicitamente
-- imitando o que MatchesService.synchronizeLinkedSlotWinner faz na aplicação.
-- O campeão do campeonato (tournaments.champion_tournament_team_id) também
-- não tem nenhum mecanismo automático: é sempre curado manualmente, e a
-- constraint tournaments_champion_requires_completed_chk apenas exige que o
-- campeonato já esteja COMPLETED quando um campeão é definido.
--
-- Identidade de partida usada para idempotência: como Match não tem nenhuma
-- chave de negócio única no schema (nem partial unique index — ver
-- docs/DATABASE.md), este script usa (tournament_id, match_number) como
-- identificador estável que ele mesmo controla, análogo ao papel do slug nos
-- scripts anteriores. Nenhuma outra parte do sistema depende desse número.
--
-- Placar e períodos são inteiramente determinísticos (nenhum random()):
--   - Fase de grupos: turno único, ranking estrito all-vitórias-sobre-quem-
--     está-abaixo (padrão explícito de JUBs Interior A, replicado nos outros
--     5 grupos com a mesma tabela fixa de placares por par de rank
--     vencedor/perdedor: (1º,2º)=78-70 (1º,3º)=82-64 (1º,4º)=90-55
--     (2º,3º)=74-68 (2º,4º)=80-60 (3º,4º)=71-65). A ordem em que as equipes
--     de cada grupo estão listadas no comentário abaixo da tabela temporária
--     É a classificação de 1º a 4º.
--   - Mata-mata: placares escolhidos à mão por partida, sempre com o
--     vencedor definido pelo enunciado (a "casa" nem sempre é quem vence —
--     ver JUBs Unicamp×USP→USP e a final do CPU LEP×ESPM→ESPM).
--   - Períodos: cada partida tem exatamente 4 períodos REGULAR. Em vez de
--     digitar 240 linhas à mão, os 4 períodos de cada partida são calculados
--     por divisão inteira do placar final (home_final_score/4 nos 3
--     primeiros períodos, o resto no 4º) — a soma bate exatamente com
--     final_score por construção, para as duas equipes, sempre.
--
-- Datas: cronologicamente coerentes com a temporada de cada campeonato
-- (2026 para Taça LAP 26/JUBs/CPU, 2027 para Taça LAP 27) e com a ordem
-- fase de grupos/quartas → semifinais → final. Nenhuma data de entidade
-- criada nas etapas anteriores é alterada.
--
-- Quantidades esperadas: Taça LAP 26 (7), Taça LAP 27 (7), JUBs (24 fase de
-- grupos + 4 quartas + 2 semifinais + 1 final = 31), CPU (12 fase de grupos
-- + 2 semifinais + 1 final = 15). Total: 60 partidas, 120 MatchTeam, 240
-- MatchPeriod.
--
-- Idempotente: a tabela temporária (ON COMMIT DROP) existe só durante esta
-- transação. Cada INSERT usa WHERE NOT EXISTS com o mesmo predicado do
-- índice único parcial que protege a linha (match_teams(match_id, side),
-- match_teams(match_id, tournament_team_id), match_periods(match_id,
-- period_number) — ver sports_module_constraints) ou, para matches, do
-- identificador (tournament_id, match_number) descrito acima. As duas
-- UPDATEs finais (slots de bracket e campeonatos) são idempotentes por
-- natureza — reescrevem sempre o mesmo valor final.
--
-- Pré-condição: a estrutura da etapa 4 (grupos, rounds e slots) já existe
-- para os quatro campeonatos. Os blocos DO abaixo falham explicitamente
-- (RAISE EXCEPTION, aborta a transação inteira) se qualquer confronto desta
-- massa não resolver para uma inscrição ativa, um grupo ativo ou um slot de
-- bracket ativo — nunca cria dados pertencentes às etapas anteriores nem
-- corrige silenciosamente um estado incompatível.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: os quatro campeonatos precisam existir com o formato correto e não
-- podem estar CANCELLED; nenhum já pode ter um campeão diferente do
-- esperado por este seed (estado incompatível, não corrigido em silêncio).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_knockout_count INTEGER;
  v_group_stage_count INTEGER;
  v_cancelled_count INTEGER;
  v_bad_champion_count INTEGER;
BEGIN
  SELECT count(*) INTO v_knockout_count FROM tournaments
  WHERE slug IN ('taca-lap-26-2026', 'taca-lap-27-2027') AND format = 'KNOCKOUT'::tournament_format AND is_deleted = false;
  IF v_knockout_count <> 2 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 2 campeonatos KNOCKOUT (Taça LAP 26, Taça LAP 27), encontrados %.', v_knockout_count;
  END IF;

  SELECT count(*) INTO v_group_stage_count FROM tournaments
  WHERE slug IN ('jubs-2026', 'cpu-2026') AND format = 'GROUP_STAGE_KNOCKOUT'::tournament_format AND is_deleted = false;
  IF v_group_stage_count <> 2 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 2 campeonatos GROUP_STAGE_KNOCKOUT (JUBs, CPU), encontrados %.', v_group_stage_count;
  END IF;

  SELECT count(*) INTO v_cancelled_count FROM tournaments
  WHERE slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND is_deleted = false AND status = 'CANCELLED'::tournament_status;
  IF v_cancelled_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % campeonato(s) estão CANCELLED e não podem ser finalizados por este seed.', v_cancelled_count;
  END IF;

  SELECT count(*) INTO v_bad_champion_count
  FROM tournaments t
  WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND t.is_deleted = false
    AND t.champion_tournament_team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tournament_teams tt
      JOIN teams te ON te.id = tt.team_id
      WHERE tt.id = t.champion_tournament_team_id
        AND te.slug = CASE t.slug
          WHEN 'taca-lap-26-2026' THEN 'direito-puccamp'
          WHEN 'taca-lap-27-2027' THEN 'lep'
          WHEN 'jubs-2026' THEN 'puccamp'
          WHEN 'cpu-2026' THEN 'espm'
        END
    );
  IF v_bad_champion_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % campeonato(s) já têm um campeão definido divergente do esperado por este seed. Estado incompatível não corrigido silenciosamente.', v_bad_champion_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Massa de dados (60 partidas) — tabela temporária, existe só durante esta
-- transação. phase='GROUP' usa group_name (round_number/position NULL);
-- phase='BRACKET' usa round_number/position (group_name NULL). match_number
-- é o identificador estável por campeonato usado para idempotência.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_matches (
  tournament_slug   text NOT NULL,
  phase             text NOT NULL,
  group_name        text,
  round_number      integer,
  position          integer,
  match_number      integer NOT NULL,
  home_team_slug    text NOT NULL,
  away_team_slug    text NOT NULL,
  home_score        integer NOT NULL,
  away_score        integer NOT NULL,
  scheduled_at      timestamptz NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_matches
  (tournament_slug, phase, group_name, round_number, position, match_number, home_team_slug, away_team_slug, home_score, away_score, scheduled_at)
VALUES
  -- ===== Taça LAP 26 (7) — mata-mata =====
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 1, 1, 'lep', 'fau-puccamp', 76, 68, '2026-03-07 09:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 2, 2, 'fisio-puccamp', 'psico-puccamp', 73, 66, '2026-03-07 11:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 3, 3, 'direito-puccamp', 'comunica-puccamp', 80, 71, '2026-03-07 14:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 4, 4, 'faceca', 'med-vet-puccamp', 75, 69, '2026-03-07 16:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 2, 1, 5, 'lep', 'fisio-puccamp', 79, 72, '2026-03-14 10:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 2, 2, 6, 'direito-puccamp', 'faceca', 84, 77, '2026-03-14 15:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 3, 1, 7, 'direito-puccamp', 'lep', 81, 75, '2026-03-21 16:00:00'),

  -- ===== Taça LAP 27 (7) — mata-mata =====
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 1, 1, 'lep', 'psico-puccamp', 77, 68, '2027-03-06 09:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 2, 2, 'faceca', 'fau-puccamp', 74, 67, '2027-03-06 11:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 3, 3, 'direito-puccamp', 'med-vet-puccamp', 79, 70, '2027-03-06 14:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 4, 4, 'comunica-puccamp', 'fisio-puccamp', 72, 65, '2027-03-06 16:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 2, 1, 5, 'lep', 'faceca', 80, 73, '2027-03-13 10:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 2, 2, 6, 'direito-puccamp', 'comunica-puccamp', 83, 76, '2027-03-13 15:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 3, 1, 7, 'lep', 'direito-puccamp', 82, 78, '2027-03-20 16:00:00'),

  -- ===== JUBs 2026 — fase de grupos (24) =====
  -- Os quatro grupos jogam em paralelo (times por grupo são disjuntos entre
  -- si, então não há choque de agenda entre grupos) ao longo de 3 dias
  -- (2026-06-05 a 2026-06-07), um turno de rodízio por dia — cada equipe
  -- entra em quadra uma única vez por dia. Rodada 1 (dia 1) = 1ºx4º e
  -- 2ºx3º; rodada 2 (dia 2) = 1ºx3º e 2ºx4º; rodada 3 (dia 3) = 1ºx2º e
  -- 3ºx4º (método do círculo para round-robin de 4 equipes).
  -- Interior A: 1º PUCCAMP, 2º UFSCar, 3º Anhanguera, 4º ESALQ
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 1, 'puccamp', 'ufscar', 78, 70, '2026-06-07 09:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 2, 'puccamp', 'anhanguera', 82, 64, '2026-06-06 09:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 3, 'puccamp', 'esalq', 90, 55, '2026-06-05 09:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 4, 'ufscar', 'anhanguera', 74, 68, '2026-06-05 14:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 5, 'ufscar', 'esalq', 80, 60, '2026-06-06 14:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 6, 'anhanguera', 'esalq', 71, 65, '2026-06-07 14:00:00'),
  -- Interior B: 1º Unicamp, 2º CAASO, 3º UNESP Rio Claro, 4º Mackenzie Campinas
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 7, 'unicamp', 'caaso', 78, 70, '2026-06-07 10:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 8, 'unicamp', 'unesp-rio-claro', 82, 64, '2026-06-06 10:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 9, 'unicamp', 'mackenzie-campinas', 90, 55, '2026-06-05 10:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 10, 'caaso', 'unesp-rio-claro', 74, 68, '2026-06-05 15:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 11, 'caaso', 'mackenzie-campinas', 80, 60, '2026-06-06 15:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 12, 'unesp-rio-claro', 'mackenzie-campinas', 71, 65, '2026-06-07 15:00:00'),
  -- Capital A: 1º ESPM, 2º USP, 3º FMU, 4º UniSant'Anna
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 13, 'espm', 'usp', 78, 70, '2026-06-07 11:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 14, 'espm', 'fmu', 82, 64, '2026-06-06 11:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 15, 'espm', 'unisantanna', 90, 55, '2026-06-05 11:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 16, 'usp', 'fmu', 74, 68, '2026-06-05 16:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 17, 'usp', 'unisantanna', 80, 60, '2026-06-06 16:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 18, 'fmu', 'unisantanna', 71, 65, '2026-06-07 16:00:00'),
  -- Capital B: 1º Mackenzie, 2º PUC-SP, 3º Insper, 4º FGV
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 19, 'mackenzie', 'puc-sp', 78, 70, '2026-06-07 12:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 20, 'mackenzie', 'insper', 82, 64, '2026-06-06 12:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 21, 'mackenzie', 'fgv', 90, 55, '2026-06-05 12:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 22, 'puc-sp', 'insper', 74, 68, '2026-06-05 17:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 23, 'puc-sp', 'fgv', 80, 60, '2026-06-06 17:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 24, 'insper', 'fgv', 71, 65, '2026-06-07 17:00:00'),

  -- ===== JUBs 2026 — mata-mata (7) =====
  ('jubs-2026', 'BRACKET', NULL, 1, 1, 25, 'puccamp', 'puc-sp', 74, 66, '2026-06-13 09:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 1, 2, 26, 'unicamp', 'usp', 68, 75, '2026-06-13 11:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 1, 3, 27, 'espm', 'caaso', 77, 69, '2026-06-13 14:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 1, 4, 28, 'mackenzie', 'ufscar', 73, 67, '2026-06-13 16:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 2, 1, 29, 'puccamp', 'usp', 78, 70, '2026-06-20 10:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 2, 2, 30, 'espm', 'mackenzie', 76, 71, '2026-06-20 15:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 3, 1, 31, 'puccamp', 'espm', 80, 74, '2026-06-27 16:00:00'),

  -- ===== CPU 2026 — fase de grupos (12) =====
  -- Os dois grupos jogam em paralelo (times disjuntos entre si) ao longo de
  -- 3 dias (2026-09-05 a 2026-09-07), um turno de rodízio por dia — mesma
  -- lógica de método do círculo usada nos grupos de JUBs acima.
  -- Grupo A: 1º LEP, 2º Engenharia Mackenzie, 3º Direito PUCCAMP, 4º FEA USP
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 1, 'lep', 'engenharia-mackenzie', 78, 70, '2026-09-07 09:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 2, 'lep', 'direito-puccamp', 82, 64, '2026-09-06 09:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 3, 'lep', 'fea-usp', 90, 55, '2026-09-05 09:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 4, 'engenharia-mackenzie', 'direito-puccamp', 74, 68, '2026-09-05 14:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 5, 'engenharia-mackenzie', 'fea-usp', 80, 60, '2026-09-06 14:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 6, 'direito-puccamp', 'fea-usp', 71, 65, '2026-09-07 14:00:00'),
  -- Grupo B: 1º ESPM, 2º EEFE USP, 3º LEU, 4º FACECA
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 7, 'espm', 'eefe-usp', 78, 70, '2026-09-07 10:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 8, 'espm', 'leu', 82, 64, '2026-09-06 10:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 9, 'espm', 'faceca', 90, 55, '2026-09-05 10:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 10, 'eefe-usp', 'leu', 74, 68, '2026-09-05 15:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 11, 'eefe-usp', 'faceca', 80, 60, '2026-09-06 15:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 12, 'leu', 'faceca', 71, 65, '2026-09-07 15:00:00'),

  -- ===== CPU 2026 — mata-mata (3) =====
  ('cpu-2026', 'BRACKET', NULL, 1, 1, 13, 'lep', 'eefe-usp', 79, 71, '2026-09-12 10:00:00'),
  ('cpu-2026', 'BRACKET', NULL, 1, 2, 14, 'espm', 'engenharia-mackenzie', 77, 70, '2026-09-12 15:00:00'),
  ('cpu-2026', 'BRACKET', NULL, 2, 1, 15, 'lep', 'espm', 72, 78, '2026-09-19 16:00:00');

-- ---------------------------------------------------------------------------
-- Guarda: cada linha da massa de dados precisa resolver para uma inscrição
-- ativa (mandante e visitante), e para a estrutura da etapa 4 (grupo ativo
-- nas partidas de fase de grupos; round+slot de bracket ativos no mata-mata).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INTEGER;
  v_unresolved_home INTEGER;
  v_unresolved_away INTEGER;
  v_unresolved_group INTEGER;
  v_unresolved_slot INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM tmp_matches;
  IF v_total <> 60 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 60 partidas na massa de dados, encontradas %.', v_total;
  END IF;

  SELECT count(*) INTO v_unresolved_home
  FROM tmp_matches m
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  WHERE NOT EXISTS (
    SELECT 1 FROM teams te
    JOIN tournament_teams tt ON tt.team_id = te.id AND tt.tournament_id = t.id
      AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
    WHERE te.slug = m.home_team_slug AND te.is_deleted = false
  );
  IF v_unresolved_home > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % confronto(s) com equipe mandante não resolvida para uma inscrição ativa. Rode 03-tournament-registrations.sql primeiro.', v_unresolved_home;
  END IF;

  SELECT count(*) INTO v_unresolved_away
  FROM tmp_matches m
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  WHERE NOT EXISTS (
    SELECT 1 FROM teams te
    JOIN tournament_teams tt ON tt.team_id = te.id AND tt.tournament_id = t.id
      AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
    WHERE te.slug = m.away_team_slug AND te.is_deleted = false
  );
  IF v_unresolved_away > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % confronto(s) com equipe visitante não resolvida para uma inscrição ativa. Rode 03-tournament-registrations.sql primeiro.', v_unresolved_away;
  END IF;

  SELECT count(*) INTO v_unresolved_group
  FROM tmp_matches m
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  WHERE m.phase = 'GROUP' AND NOT EXISTS (
    SELECT 1 FROM tournament_groups g
    WHERE g.tournament_id = t.id AND g.name = m.group_name AND g.is_deleted = false
  );
  IF v_unresolved_group > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) de fase de grupos sem grupo correspondente ativo. Rode 04-groups-and-brackets.sql primeiro.', v_unresolved_group;
  END IF;

  SELECT count(*) INTO v_unresolved_slot
  FROM tmp_matches m
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  WHERE m.phase = 'BRACKET' AND NOT EXISTS (
    SELECT 1 FROM tournament_bracket_rounds r
    JOIN tournament_bracket_slots s ON s.round_id = r.id AND s.position = m.position AND s.is_deleted = false
    WHERE r.tournament_id = t.id AND r.number = m.round_number AND r.is_deleted = false
  );
  IF v_unresolved_slot > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % confronto(s) de mata-mata sem slot de bracket correspondente ativo. Rode 04-groups-and-brackets.sql primeiro.', v_unresolved_slot;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Matches (60) — tournament_group_id só é preenchido nas partidas de fase de
-- grupos (LEFT JOIN falha por construção quando m.group_name é NULL).
-- ---------------------------------------------------------------------------
INSERT INTO matches
  (organization_id, tournament_id, tournament_group_id, match_number, scheduled_at, started_at, ended_at, status, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, g.id, m.match_number, m.scheduled_at, m.scheduled_at, m.scheduled_at + interval '2 hours',
  'FINISHED'::match_status, false, NOW(), NOW()
FROM tmp_matches m
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
LEFT JOIN tournament_groups g ON g.tournament_id = t.id AND g.name = m.group_name AND g.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM matches mm WHERE mm.tournament_id = t.id AND mm.match_number = m.match_number AND mm.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- MatchTeam — lado HOME (60).
-- ---------------------------------------------------------------------------
INSERT INTO match_teams
  (organization_id, match_id, tournament_team_id, side, final_score, result, loss_type, is_winner, is_deleted, created_at, updated_at)
SELECT t.organization_id, mt.id, home_tt.id, 'HOME'::match_side, m.home_score,
  (CASE WHEN m.home_score > m.away_score THEN 'WIN' ELSE 'LOSS' END)::match_result,
  (CASE WHEN m.home_score > m.away_score THEN NULL ELSE 'NORMAL' END)::loss_type,
  m.home_score > m.away_score,
  false, NOW(), NOW()
FROM tmp_matches m
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
JOIN matches mt ON mt.tournament_id = t.id AND mt.match_number = m.match_number AND mt.is_deleted = false
JOIN teams home_te ON home_te.slug = m.home_team_slug AND home_te.is_deleted = false
JOIN tournament_teams home_tt ON home_tt.tournament_id = t.id AND home_tt.team_id = home_te.id
  AND home_tt.is_deleted = false AND home_tt.status = 'ACTIVE'::tournament_team_status
WHERE NOT EXISTS (
  SELECT 1 FROM match_teams existing WHERE existing.match_id = mt.id AND existing.side = 'HOME'::match_side AND existing.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- MatchTeam — lado AWAY (60).
-- ---------------------------------------------------------------------------
INSERT INTO match_teams
  (organization_id, match_id, tournament_team_id, side, final_score, result, loss_type, is_winner, is_deleted, created_at, updated_at)
SELECT t.organization_id, mt.id, away_tt.id, 'AWAY'::match_side, m.away_score,
  (CASE WHEN m.away_score > m.home_score THEN 'WIN' ELSE 'LOSS' END)::match_result,
  (CASE WHEN m.away_score > m.home_score THEN NULL ELSE 'NORMAL' END)::loss_type,
  m.away_score > m.home_score,
  false, NOW(), NOW()
FROM tmp_matches m
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
JOIN matches mt ON mt.tournament_id = t.id AND mt.match_number = m.match_number AND mt.is_deleted = false
JOIN teams away_te ON away_te.slug = m.away_team_slug AND away_te.is_deleted = false
JOIN tournament_teams away_tt ON away_tt.tournament_id = t.id AND away_tt.team_id = away_te.id
  AND away_tt.is_deleted = false AND away_tt.status = 'ACTIVE'::tournament_team_status
WHERE NOT EXISTS (
  SELECT 1 FROM match_teams existing WHERE existing.match_id = mt.id AND existing.side = 'AWAY'::match_side AND existing.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- MatchPeriod (240 = 60 × 4) — 4 períodos REGULAR por partida, calculados por
-- divisão inteira do final_score de cada lado (os 3 primeiros períodos
-- recebem final_score/4, o 4º recebe o resto), garantindo por construção que
-- a soma dos períodos bate exatamente com o placar final dos dois lados.
-- Escopado às partidas dos quatro campeonatos desta massa.
-- ---------------------------------------------------------------------------
WITH match_scores AS (
  SELECT home.match_id, home.organization_id, home.final_score AS home_final_score, away.final_score AS away_final_score
  FROM match_teams home
  JOIN match_teams away ON away.match_id = home.match_id AND away.side = 'AWAY'::match_side AND away.is_deleted = false
  JOIN matches m ON m.id = home.match_id AND m.is_deleted = false
  JOIN tournaments t ON t.id = m.tournament_id AND t.is_deleted = false
  WHERE home.side = 'HOME'::match_side AND home.is_deleted = false
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
)
INSERT INTO match_periods
  (organization_id, match_id, period_number, period_type, home_points, away_points, started_at, ended_at, is_deleted, created_at, updated_at)
SELECT ms.organization_id, ms.match_id, p.period_number, 'REGULAR'::period_type,
  CASE WHEN p.period_number < 4 THEN ms.home_final_score / 4 ELSE ms.home_final_score - 3 * (ms.home_final_score / 4) END,
  CASE WHEN p.period_number < 4 THEN ms.away_final_score / 4 ELSE ms.away_final_score - 3 * (ms.away_final_score / 4) END,
  NULL, NULL, false, NOW(), NOW()
FROM match_scores ms
CROSS JOIN (VALUES (1), (2), (3), (4)) AS p(period_number)
WHERE NOT EXISTS (
  SELECT 1 FROM match_periods mp WHERE mp.match_id = ms.match_id AND mp.period_number = p.period_number AND mp.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Sincroniza os 24 slots de bracket do mata-mata: equipe mandante/visitante
-- (só muda algo nas quartas de JUBs e nas semifinais do CPU, que a etapa 4
-- deixou vazias), match_id e o vencedor. Idempotente por natureza — uma
-- segunda execução regrava os mesmos valores.
-- ---------------------------------------------------------------------------
UPDATE tournament_bracket_slots s
SET home_tournament_team_id = home_tt.id,
    away_tournament_team_id = away_tt.id,
    match_id = mt.id,
    winner_tournament_team_id = CASE WHEN m.home_score > m.away_score THEN home_tt.id ELSE away_tt.id END,
    updated_at = NOW()
FROM tmp_matches m
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
JOIN tournament_bracket_rounds r ON r.tournament_id = t.id AND r.number = m.round_number AND r.is_deleted = false
JOIN teams home_te ON home_te.slug = m.home_team_slug AND home_te.is_deleted = false
JOIN tournament_teams home_tt ON home_tt.tournament_id = t.id AND home_tt.team_id = home_te.id
  AND home_tt.is_deleted = false AND home_tt.status = 'ACTIVE'::tournament_team_status
JOIN teams away_te ON away_te.slug = m.away_team_slug AND away_te.is_deleted = false
JOIN tournament_teams away_tt ON away_tt.tournament_id = t.id AND away_tt.team_id = away_te.id
  AND away_tt.is_deleted = false AND away_tt.status = 'ACTIVE'::tournament_team_status
JOIN matches mt ON mt.tournament_id = t.id AND mt.match_number = m.match_number AND mt.is_deleted = false
WHERE m.phase = 'BRACKET'
  AND s.round_id = r.id AND s.position = m.position AND s.is_deleted = false;

-- ---------------------------------------------------------------------------
-- Finaliza os quatro campeonatos e define o campeão curado manualmente.
-- ---------------------------------------------------------------------------
UPDATE tournaments t
SET status = 'COMPLETED'::tournament_status,
    champion_tournament_team_id = champ_tt.id,
    updated_at = NOW()
FROM (VALUES
    ('taca-lap-26-2026', 'direito-puccamp'),
    ('taca-lap-27-2027', 'lep'),
    ('jubs-2026', 'puccamp'),
    ('cpu-2026', 'espm')
) AS c(tournament_slug, champion_team_slug)
JOIN teams champ_te ON champ_te.slug = c.champion_team_slug AND champ_te.is_deleted = false
JOIN tournament_teams champ_tt ON champ_tt.team_id = champ_te.id
  AND champ_tt.is_deleted = false AND champ_tt.status = 'ACTIVE'::tournament_team_status
WHERE t.slug = c.tournament_slug AND t.is_deleted = false
  AND champ_tt.tournament_id = t.id;

-- ---------------------------------------------------------------------------
-- Guarda final: nenhuma partida empatada, nenhum MatchTeam com soma de
-- períodos divergente do placar final, e a contagem total bate.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_match_count INTEGER;
  v_tie_count INTEGER;
  v_period_mismatch_count INTEGER;
BEGIN
  SELECT count(*) INTO v_match_count FROM matches m
  JOIN tournaments t ON t.id = m.tournament_id
  WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND m.is_deleted = false;
  IF v_match_count <> 60 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 60 partidas ativas ao final, encontradas %.', v_match_count;
  END IF;

  SELECT count(*) INTO v_tie_count
  FROM match_teams home
  JOIN match_teams away ON away.match_id = home.match_id AND away.side = 'AWAY'::match_side AND away.is_deleted = false
  JOIN matches m ON m.id = home.match_id
  JOIN tournaments t ON t.id = m.tournament_id
  WHERE home.side = 'HOME'::match_side AND home.is_deleted = false
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND home.final_score = away.final_score;
  IF v_tie_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % partida(s) empatada(s) encontrada(s).', v_tie_count;
  END IF;

  SELECT count(*) INTO v_period_mismatch_count
  FROM match_teams mte
  JOIN matches m ON m.id = mte.match_id
  JOIN tournaments t ON t.id = m.tournament_id
  WHERE mte.is_deleted = false
    AND t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND mte.final_score <> (
      SELECT COALESCE(SUM(CASE WHEN mte.side = 'HOME'::match_side THEN mp.home_points ELSE mp.away_points END), 0)
      FROM match_periods mp
      WHERE mp.match_id = mte.match_id AND mp.is_deleted = false
    );
  IF v_period_mismatch_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % MatchTeam com soma de períodos divergente do placar final.', v_period_mismatch_count;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- 60 partidas, todas FINISHED:
-- SELECT t.slug, count(*) FROM matches m JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND m.is_deleted = false GROUP BY t.slug ORDER BY t.slug;
--   -- cpu-2026: 15, jubs-2026: 31, taca-lap-26-2026: 7, taca-lap-27-2027: 7 (total 60)
-- SELECT count(*) FROM matches m JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND m.is_deleted = false AND m.status <> 'FINISHED';
--   -- 0
--
-- 120 MatchTeam:
-- SELECT count(*) FROM match_teams mt JOIN matches m ON m.id = mt.match_id
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND mt.is_deleted = false;
--   -- 120
--
-- 240 MatchPeriod:
-- SELECT count(*) FROM match_periods mp JOIN matches m ON m.id = mp.match_id
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND mp.is_deleted = false;
--   -- 240
--
-- Soma dos períodos = placar final em todas as partidas (0 divergências):
-- SELECT count(*) FROM match_teams mte JOIN matches m ON m.id = mte.match_id
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND mte.is_deleted = false
--   AND mte.final_score <> (
--     SELECT COALESCE(SUM(CASE WHEN mte.side = 'HOME' THEN mp.home_points ELSE mp.away_points END), 0)
--     FROM match_periods mp WHERE mp.match_id = mte.match_id AND mp.is_deleted = false
--   );
--   -- 0
--
-- Nenhuma partida empatada:
-- SELECT count(*) FROM match_teams h JOIN match_teams a
--   ON a.match_id = h.match_id AND a.side = 'AWAY' AND a.is_deleted = false
--   WHERE h.side = 'HOME' AND h.is_deleted = false AND h.final_score = a.final_score;
--   -- 0
--
-- Classificação dos seis grupos (vitórias por equipe, ordem esperada
-- PUCCAMP/Unicamp/ESPM/Mackenzie/LEP/ESPM = 3, seguido de 2,1,0):
-- SELECT g.name, tt.display_name_snapshot, count(*) FILTER (WHERE mt.is_winner) AS vitorias
--   FROM tournament_group_teams gt
--   JOIN tournament_groups g ON g.id = gt.tournament_group_id
--   JOIN tournament_teams tt ON tt.id = gt.tournament_team_id
--   JOIN match_teams mt ON mt.tournament_team_id = tt.id AND mt.is_deleted = false
--   JOIN matches m ON m.id = mt.match_id AND m.tournament_group_id = g.id AND m.is_deleted = false
--   WHERE gt.is_deleted = false
--   GROUP BY g.name, tt.display_name_snapshot
--   ORDER BY g.name, vitorias DESC;
--   -- cada grupo: exatamente 3, 2, 1, 0 vitórias, na ordem de classificação descrita no cabeçalho
--
-- Confrontos e vencedores de todos os brackets (equipe casa/fora/vencedor por slot):
-- SELECT t.slug, r.number, r.label, s.position,
--     home.display_name_snapshot AS home_team, away.display_name_snapshot AS away_team,
--     winner.display_name_snapshot AS winner_team
--   FROM tournament_bracket_slots s
--   JOIN tournament_bracket_rounds r ON r.id = s.round_id
--   JOIN tournaments t ON t.id = s.tournament_id
--   LEFT JOIN tournament_teams home ON home.id = s.home_tournament_team_id
--   LEFT JOIN tournament_teams away ON away.id = s.away_tournament_team_id
--   LEFT JOIN tournament_teams winner ON winner.id = s.winner_tournament_team_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND s.is_deleted = false
--   ORDER BY t.slug, r.number, s.position;
--   -- todas as 24 linhas com home/away/winner preenchidos e coerentes com o enunciado
--
-- Todos os slots do mata-mata associados à partida correspondente:
-- SELECT count(*) FROM tournament_bracket_slots s
--   JOIN tournaments t ON t.id = s.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND s.is_deleted = false AND s.match_id IS NULL;
--   -- 0
--
-- Campeões corretos e os quatro campeonatos COMPLETED:
-- SELECT t.slug, t.status, champ.display_name_snapshot AS champion FROM tournaments t
--   LEFT JOIN tournament_teams champ ON champ.id = t.champion_tournament_team_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--   ORDER BY t.slug;
--   -- cpu-2026/COMPLETED/ESPM, jubs-2026/COMPLETED/PUCCAMP,
--   -- taca-lap-26-2026/COMPLETED/Direito PUCCAMP, taca-lap-27-2027/COMPLETED/LEP
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima (matches/match_teams/match_periods não duplicam; as duas UPDATEs
-- finais regravam os mesmos valores).
-- =============================================================================
