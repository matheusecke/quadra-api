-- =============================================================================
-- LAP / FUPE — seed principal, etapa 4: grupos e chaveamento (mata-mata)
-- =============================================================================
--
-- Escopo desta etapa: grupos (TournamentGroup) e associação das equipes aos
-- grupos (TournamentGroupTeam) para JUBs e CPU; estrutura de rounds
-- (TournamentBracketRound) e slots (TournamentBracketSlot) do mata-mata para
-- os quatro campeonatos, usando as inscrições (TournamentTeam) criadas na
-- etapa 3.
--
-- NÃO cria (etapas futuras, um arquivo por etapa nesta mesma pasta):
--   05-matches-and-results.sql           — partidas e resultados
--   06-rosters-and-statistics.sql        — elencos e estatísticas
--
-- Execução (psql, local ou produção; requer 01, 02 e 03 já aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/04-groups-and-brackets.sql
--
-- Modelo (ver prisma/schema/tournament-group*.prisma e
-- tournament-bracket-*.prisma): TournamentBracketSlot já tem
-- home_tournament_team_id/away_tournament_team_id/winner_tournament_team_id
-- e match_id, todos nullable — um slot representa uma posição no chaveamento
-- mesmo antes de existir uma partida. Populamos apenas os slots cujas duas
-- equipes já são conhecidas de antemão (quartas das Taças LAP, que são
-- confrontos fixos, não derivados de classificação de grupo). Os demais
-- slots (semifinais/final de todos os campeonatos, e as quartas de JUBs, que
-- dependem da classificação dos grupos) ficam com home/away NULL — apenas a
-- posição no bracket é criada. Nenhum Match é criado nesta etapa.
--
-- Grupos (JUBs: 4 grupos de 4; CPU: 2 grupos de 4). As Taças LAP são
-- KNOCKOUT puro — nenhum TournamentGroup é criado para elas.
--
-- Idempotente: cada INSERT usa WHERE NOT EXISTS com o mesmo predicado do
-- índice único parcial que protege a linha (ver docs/DATABASE.md e a
-- migration sports_module_constraints):
--   tournament_groups(tournament_id, name) WHERE is_deleted = false
--   tournament_group_teams(tournament_group_id, tournament_team_id) WHERE is_deleted = false
--   tournament_bracket_rounds(tournament_id, number) WHERE is_deleted = false
--   tournament_bracket_slots(round_id, position) WHERE is_deleted = false
--
-- Pré-condição: os quatro campeonatos da etapa 1 (com o formato correto) e
-- as 40 inscrições ativas da etapa 3 já existem, e nenhuma das Taças LAP tem
-- grupo ativo (formato KNOCKOUT não usa grupos). Os blocos DO abaixo falham
-- explicitamente (RAISE EXCEPTION, aborta a transação inteira) se qualquer
-- uma dessas condições não bater — nunca cria dados pertencentes às etapas
-- anteriores nem corrige silenciosamente um estado incompatível.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: os quatro campeonatos precisam existir com o formato correto, e as
-- 40 inscrições ativas da etapa 3 precisam estar no lugar (8/8/16/8).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_knockout_count INTEGER;
  v_group_stage_count INTEGER;
  v_lap26_teams INTEGER;
  v_lap27_teams INTEGER;
  v_jubs_teams INTEGER;
  v_cpu_teams INTEGER;
BEGIN
  SELECT count(*) INTO v_knockout_count FROM tournaments
  WHERE slug IN ('taca-lap-26-2026', 'taca-lap-27-2027') AND format = 'KNOCKOUT'::tournament_format AND is_deleted = false;
  IF v_knockout_count <> 2 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 2 campeonatos KNOCKOUT (Taça LAP 26, Taça LAP 27), encontrados %. Rode 01-organizations-context.sql primeiro.', v_knockout_count;
  END IF;

  SELECT count(*) INTO v_group_stage_count FROM tournaments
  WHERE slug IN ('jubs-2026', 'cpu-2026') AND format = 'GROUP_STAGE_KNOCKOUT'::tournament_format AND is_deleted = false;
  IF v_group_stage_count <> 2 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 2 campeonatos GROUP_STAGE_KNOCKOUT (JUBs, CPU), encontrados %. Rode 01-organizations-context.sql primeiro.', v_group_stage_count;
  END IF;

  SELECT count(*) INTO v_lap26_teams FROM tournament_teams tt JOIN tournaments t ON t.id = tt.tournament_id
  WHERE t.slug = 'taca-lap-26-2026' AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;
  IF v_lap26_teams <> 8 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 8 inscrições ativas na Taça LAP 26, encontradas %. Rode 03-tournament-registrations.sql primeiro.', v_lap26_teams;
  END IF;

  SELECT count(*) INTO v_lap27_teams FROM tournament_teams tt JOIN tournaments t ON t.id = tt.tournament_id
  WHERE t.slug = 'taca-lap-27-2027' AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;
  IF v_lap27_teams <> 8 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 8 inscrições ativas na Taça LAP 27, encontradas %. Rode 03-tournament-registrations.sql primeiro.', v_lap27_teams;
  END IF;

  SELECT count(*) INTO v_jubs_teams FROM tournament_teams tt JOIN tournaments t ON t.id = tt.tournament_id
  WHERE t.slug = 'jubs-2026' AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;
  IF v_jubs_teams <> 16 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 16 inscrições ativas nos JUBs 2026, encontradas %. Rode 03-tournament-registrations.sql primeiro.', v_jubs_teams;
  END IF;

  SELECT count(*) INTO v_cpu_teams FROM tournament_teams tt JOIN tournaments t ON t.id = tt.tournament_id
  WHERE t.slug = 'cpu-2026' AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;
  IF v_cpu_teams <> 8 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 8 inscrições ativas no CPU 2026, encontradas %. Rode 03-tournament-registrations.sql primeiro.', v_cpu_teams;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda: as Taças LAP (KNOCKOUT) não podem ter nenhum grupo ativo já
-- existente — estado incompatível com o formato, não corrigido em silêncio.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_lap_groups_count INTEGER;
BEGIN
  SELECT count(*) INTO v_lap_groups_count
  FROM tournament_groups g
  JOIN tournaments t ON t.id = g.tournament_id
  WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027') AND g.is_deleted = false;

  IF v_lap_groups_count <> 0 THEN
    RAISE EXCEPTION 'Seed abortado: encontrado(s) % grupo(s) ativo(s) associado(s) às Taças LAP (formato KNOCKOUT não usa grupos). Estado incompatível não corrigido silenciosamente.', v_lap_groups_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda: todos os pares (campeonato, equipe) usados abaixo — nos grupos de
-- JUBs/CPU e nos confrontos fixos das quartas das Taças LAP — precisam
-- resolver para uma inscrição ativa. As junções usadas nos INSERTs abaixo
-- são INNER JOIN: um slug errado apenas omitiria a linha em silêncio, em vez
-- de falhar. Este bloco garante que os 24 + 16 pares resolvem antes de
-- inserir qualquer coisa.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_group_pairs_count INTEGER;
  v_bracket_pairs_count INTEGER;
BEGIN
  SELECT count(*) INTO v_group_pairs_count
  FROM (VALUES
      -- JUBs (16)
      ('jubs-2026', 'puccamp'), ('jubs-2026', 'ufscar'), ('jubs-2026', 'anhanguera'), ('jubs-2026', 'esalq'),
      ('jubs-2026', 'unicamp'), ('jubs-2026', 'caaso'), ('jubs-2026', 'unesp-rio-claro'), ('jubs-2026', 'mackenzie-campinas'),
      ('jubs-2026', 'espm'), ('jubs-2026', 'usp'), ('jubs-2026', 'fmu'), ('jubs-2026', 'unisantanna'),
      ('jubs-2026', 'mackenzie'), ('jubs-2026', 'puc-sp'), ('jubs-2026', 'insper'), ('jubs-2026', 'fgv'),
      -- CPU (8)
      ('cpu-2026', 'lep'), ('cpu-2026', 'engenharia-mackenzie'), ('cpu-2026', 'direito-puccamp'), ('cpu-2026', 'fea-usp'),
      ('cpu-2026', 'espm'), ('cpu-2026', 'eefe-usp'), ('cpu-2026', 'leu'), ('cpu-2026', 'faceca')
  ) AS m(tournament_slug, team_slug)
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  JOIN teams te ON te.slug = m.team_slug AND te.is_deleted = false
  JOIN tournament_teams tt ON tt.tournament_id = t.id AND tt.team_id = te.id
    AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;

  IF v_group_pairs_count <> 24 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 24 pares (campeonato, equipe) ativos para os grupos de JUBs/CPU, encontrados %. Rode 03-tournament-registrations.sql primeiro.', v_group_pairs_count;
  END IF;

  SELECT count(*) INTO v_bracket_pairs_count
  FROM (VALUES
      -- Taça LAP 26 — quartas (8)
      ('taca-lap-26-2026', 'lep'), ('taca-lap-26-2026', 'fau-puccamp'), ('taca-lap-26-2026', 'fisio-puccamp'), ('taca-lap-26-2026', 'psico-puccamp'),
      ('taca-lap-26-2026', 'direito-puccamp'), ('taca-lap-26-2026', 'comunica-puccamp'), ('taca-lap-26-2026', 'faceca'), ('taca-lap-26-2026', 'med-vet-puccamp'),
      -- Taça LAP 27 — quartas (8)
      ('taca-lap-27-2027', 'lep'), ('taca-lap-27-2027', 'psico-puccamp'), ('taca-lap-27-2027', 'faceca'), ('taca-lap-27-2027', 'fau-puccamp'),
      ('taca-lap-27-2027', 'direito-puccamp'), ('taca-lap-27-2027', 'med-vet-puccamp'), ('taca-lap-27-2027', 'comunica-puccamp'), ('taca-lap-27-2027', 'fisio-puccamp')
  ) AS m(tournament_slug, team_slug)
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  JOIN teams te ON te.slug = m.team_slug AND te.is_deleted = false
  JOIN tournament_teams tt ON tt.tournament_id = t.id AND tt.team_id = te.id
    AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status;

  IF v_bracket_pairs_count <> 16 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 16 pares (campeonato, equipe) ativos para os confrontos de quartas das Taças LAP, encontrados %. Rode 03-tournament-registrations.sql primeiro.', v_bracket_pairs_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Grupos (6) — JUBs (4) e CPU (2). Todos criados antes de qualquer
-- associação equipe-grupo, mesma ordem do padrão já usado na etapa 2.
-- ---------------------------------------------------------------------------
INSERT INTO tournament_groups (organization_id, tournament_id, name, sort_order, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, m.name, m.sort_order, false, NOW(), NOW()
FROM (VALUES
    ('jubs-2026', 'Interior A', 1),
    ('jubs-2026', 'Interior B', 2),
    ('jubs-2026', 'Capital A', 3),
    ('jubs-2026', 'Capital B', 4),
    ('cpu-2026', 'Grupo A', 1),
    ('cpu-2026', 'Grupo B', 2)
) AS m(tournament_slug, name, sort_order)
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM tournament_groups g
  WHERE g.tournament_id = t.id AND g.name = m.name AND g.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Associação equipe-grupo (24) — só depois de todos os grupos acima
-- resolvidos.
-- ---------------------------------------------------------------------------
INSERT INTO tournament_group_teams (organization_id, tournament_id, tournament_group_id, tournament_team_id, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, g.id, tt.id, false, NOW(), NOW()
FROM (VALUES
    -- JUBs — Interior A (4)
    ('jubs-2026', 'Interior A', 'puccamp'),
    ('jubs-2026', 'Interior A', 'ufscar'),
    ('jubs-2026', 'Interior A', 'anhanguera'),
    ('jubs-2026', 'Interior A', 'esalq'),
    -- JUBs — Interior B (4)
    ('jubs-2026', 'Interior B', 'unicamp'),
    ('jubs-2026', 'Interior B', 'caaso'),
    ('jubs-2026', 'Interior B', 'unesp-rio-claro'),
    ('jubs-2026', 'Interior B', 'mackenzie-campinas'),
    -- JUBs — Capital A (4)
    ('jubs-2026', 'Capital A', 'espm'),
    ('jubs-2026', 'Capital A', 'usp'),
    ('jubs-2026', 'Capital A', 'fmu'),
    ('jubs-2026', 'Capital A', 'unisantanna'),
    -- JUBs — Capital B (4)
    ('jubs-2026', 'Capital B', 'mackenzie'),
    ('jubs-2026', 'Capital B', 'puc-sp'),
    ('jubs-2026', 'Capital B', 'insper'),
    ('jubs-2026', 'Capital B', 'fgv'),
    -- CPU — Grupo A (4)
    ('cpu-2026', 'Grupo A', 'lep'),
    ('cpu-2026', 'Grupo A', 'engenharia-mackenzie'),
    ('cpu-2026', 'Grupo A', 'direito-puccamp'),
    ('cpu-2026', 'Grupo A', 'fea-usp'),
    -- CPU — Grupo B (4)
    ('cpu-2026', 'Grupo B', 'espm'),
    ('cpu-2026', 'Grupo B', 'eefe-usp'),
    ('cpu-2026', 'Grupo B', 'leu'),
    ('cpu-2026', 'Grupo B', 'faceca')
) AS m(tournament_slug, group_name, team_slug)
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
JOIN tournament_groups g ON g.tournament_id = t.id AND g.name = m.group_name AND g.is_deleted = false
JOIN teams te ON te.slug = m.team_slug AND te.is_deleted = false
JOIN tournament_teams tt ON tt.tournament_id = t.id AND tt.team_id = te.id
  AND tt.is_deleted = false AND tt.status = 'ACTIVE'::tournament_team_status
WHERE NOT EXISTS (
  SELECT 1 FROM tournament_group_teams gt
  WHERE gt.tournament_group_id = g.id AND gt.tournament_team_id = tt.id AND gt.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Rounds do mata-mata (11) — Taça LAP 26 e 27 e JUBs têm 3 rounds (Quartas,
-- Semifinais, Final); CPU tem 2 (Semifinais direto dos 2 grupos, Final).
-- ---------------------------------------------------------------------------
INSERT INTO tournament_bracket_rounds (organization_id, tournament_id, number, label, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, m.number, m.label, false, NOW(), NOW()
FROM (VALUES
    ('taca-lap-26-2026', 1, 'Quartas de Final'),
    ('taca-lap-26-2026', 2, 'Semifinais'),
    ('taca-lap-26-2026', 3, 'Final'),
    ('taca-lap-27-2027', 1, 'Quartas de Final'),
    ('taca-lap-27-2027', 2, 'Semifinais'),
    ('taca-lap-27-2027', 3, 'Final'),
    ('jubs-2026', 1, 'Quartas de Final'),
    ('jubs-2026', 2, 'Semifinais'),
    ('jubs-2026', 3, 'Final'),
    ('cpu-2026', 1, 'Semifinais'),
    ('cpu-2026', 2, 'Final')
) AS m(tournament_slug, number, label)
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM tournament_bracket_rounds r
  WHERE r.tournament_id = t.id AND r.number = m.number AND r.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Slots do mata-mata (24) — só depois de todos os rounds acima resolvidos.
--
-- home_team_slug/away_team_slug só são preenchidos nas quartas das Taças LAP
-- (confrontos fixos, conhecidos de antemão). Em todos os outros slots — as
-- quartas de JUBs (dependem da classificação dos grupos) e todas as
-- semifinais/finais (dependem do vencedor do round anterior) — os dois
-- ficam NULL: apenas a posição no bracket é criada, sem equipes nem Match.
-- O label das quartas de JUBs e das semifinais do CPU documenta o
-- cruzamento planejado (1º de um grupo x 2º de outro) sem persistir
-- classificação alguma.
-- ---------------------------------------------------------------------------
INSERT INTO tournament_bracket_slots
  (organization_id, tournament_id, round_id, position, label, home_tournament_team_id, away_tournament_team_id, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, r.id, m.position, m.label, home_tt.id, away_tt.id, false, NOW(), NOW()
FROM (VALUES
    -- Taça LAP 26 — quartas (4, confronto fixo)
    ('taca-lap-26-2026', 1, 1, NULL, 'lep', 'fau-puccamp'),
    ('taca-lap-26-2026', 1, 2, NULL, 'fisio-puccamp', 'psico-puccamp'),
    ('taca-lap-26-2026', 1, 3, NULL, 'direito-puccamp', 'comunica-puccamp'),
    ('taca-lap-26-2026', 1, 4, NULL, 'faceca', 'med-vet-puccamp'),
    -- Taça LAP 26 — semifinais (2, vazio) e final (1, vazio)
    ('taca-lap-26-2026', 2, 1, NULL, NULL, NULL),
    ('taca-lap-26-2026', 2, 2, NULL, NULL, NULL),
    ('taca-lap-26-2026', 3, 1, NULL, NULL, NULL),
    -- Taça LAP 27 — quartas (4, confronto fixo)
    ('taca-lap-27-2027', 1, 1, NULL, 'lep', 'psico-puccamp'),
    ('taca-lap-27-2027', 1, 2, NULL, 'faceca', 'fau-puccamp'),
    ('taca-lap-27-2027', 1, 3, NULL, 'direito-puccamp', 'med-vet-puccamp'),
    ('taca-lap-27-2027', 1, 4, NULL, 'comunica-puccamp', 'fisio-puccamp'),
    -- Taça LAP 27 — semifinais (2, vazio) e final (1, vazio)
    ('taca-lap-27-2027', 2, 1, NULL, NULL, NULL),
    ('taca-lap-27-2027', 2, 2, NULL, NULL, NULL),
    ('taca-lap-27-2027', 3, 1, NULL, NULL, NULL),
    -- JUBs — quartas (4, vazio; cruzamento planejado documentado no label)
    ('jubs-2026', 1, 1, '1º Interior A × 2º Capital B', NULL, NULL),
    ('jubs-2026', 1, 2, '1º Interior B × 2º Capital A', NULL, NULL),
    ('jubs-2026', 1, 3, '1º Capital A × 2º Interior B', NULL, NULL),
    ('jubs-2026', 1, 4, '1º Capital B × 2º Interior A', NULL, NULL),
    -- JUBs — semifinais (2, vazio) e final (1, vazio)
    ('jubs-2026', 2, 1, NULL, NULL, NULL),
    ('jubs-2026', 2, 2, NULL, NULL, NULL),
    ('jubs-2026', 3, 1, NULL, NULL, NULL),
    -- CPU — semifinais (2, vazio; cruzamento planejado documentado no label)
    ('cpu-2026', 1, 1, '1º Grupo A × 2º Grupo B', NULL, NULL),
    ('cpu-2026', 1, 2, '1º Grupo B × 2º Grupo A', NULL, NULL),
    -- CPU — final (1, vazio)
    ('cpu-2026', 2, 1, NULL, NULL, NULL)
) AS m(tournament_slug, round_number, position, label, home_team_slug, away_team_slug)
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
JOIN tournament_bracket_rounds r ON r.tournament_id = t.id AND r.number = m.round_number AND r.is_deleted = false
LEFT JOIN teams home_te ON home_te.slug = m.home_team_slug AND home_te.is_deleted = false
LEFT JOIN tournament_teams home_tt ON home_tt.tournament_id = t.id AND home_tt.team_id = home_te.id
  AND home_tt.is_deleted = false AND home_tt.status = 'ACTIVE'::tournament_team_status
LEFT JOIN teams away_te ON away_te.slug = m.away_team_slug AND away_te.is_deleted = false
LEFT JOIN tournament_teams away_tt ON away_tt.tournament_id = t.id AND away_tt.team_id = away_te.id
  AND away_tt.is_deleted = false AND away_tt.status = 'ACTIVE'::tournament_team_status
WHERE NOT EXISTS (
  SELECT 1 FROM tournament_bracket_slots s
  WHERE s.round_id = r.id AND s.position = m.position AND s.is_deleted = false
);

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- JUBs com 4 grupos e 4 equipes em cada:
-- SELECT g.name, count(*) FROM tournament_group_teams gt
--   JOIN tournament_groups g ON g.id = gt.tournament_group_id
--   JOIN tournaments t ON t.id = gt.tournament_id
--   WHERE t.slug = 'jubs-2026' AND gt.is_deleted = false
--   GROUP BY g.name ORDER BY g.name;
--   -- Capital A: 4, Capital B: 4, Interior A: 4, Interior B: 4
--
-- CPU com 2 grupos e 4 equipes em cada:
-- SELECT g.name, count(*) FROM tournament_group_teams gt
--   JOIN tournament_groups g ON g.id = gt.tournament_group_id
--   JOIN tournaments t ON t.id = gt.tournament_id
--   WHERE t.slug = 'cpu-2026' AND gt.is_deleted = false
--   GROUP BY g.name ORDER BY g.name;
--   -- Grupo A: 4, Grupo B: 4
--
-- Nenhuma equipe duplicada dentro de um grupo (índice único parcial já
-- garante isso, mas a query abaixo deve retornar 0 linhas de qualquer forma):
-- SELECT tournament_group_id, tournament_team_id, count(*) FROM tournament_group_teams
--   WHERE is_deleted = false
--   GROUP BY tournament_group_id, tournament_team_id HAVING count(*) > 1;
--   -- 0 linhas
--
-- Cada equipe associada ao grupo pertence ao respectivo campeonato:
-- SELECT count(*) FROM tournament_group_teams gt
--   WHERE gt.is_deleted = false
--   AND NOT EXISTS (
--     SELECT 1 FROM tournament_teams tt
--     WHERE tt.id = gt.tournament_team_id AND tt.tournament_id = gt.tournament_id AND tt.is_deleted = false
--   );
--   -- 0 (nenhuma associação órfã)
--
-- Nenhuma estrutura de grupos para as Taças LAP:
-- SELECT count(*) FROM tournament_groups g
--   JOIN tournaments t ON t.id = g.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027') AND g.is_deleted = false;
--   -- 0
--
-- Rounds/slots esperados para os quatro campeonatos:
-- SELECT t.slug, r.number, r.label, count(s.id) FROM tournament_bracket_rounds r
--   JOIN tournaments t ON t.id = r.tournament_id
--   LEFT JOIN tournament_bracket_slots s ON s.round_id = r.id AND s.is_deleted = false
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND r.is_deleted = false
--   GROUP BY t.slug, r.number, r.label ORDER BY t.slug, r.number;
--   -- taca-lap-26-2026: (1,Quartas de Final,4) (2,Semifinais,2) (3,Final,1)
--   -- taca-lap-27-2027: (1,Quartas de Final,4) (2,Semifinais,2) (3,Final,1)
--   -- jubs-2026:        (1,Quartas de Final,4) (2,Semifinais,2) (3,Final,1)
--   -- cpu-2026:         (1,Semifinais,2) (2,Final,1)
--   -- total: 24 slots
--
-- Quartas das Taças LAP com as duas equipes preenchidas; todos os demais
-- slots (quartas de JUBs, semifinais e finais de todos) sem equipe:
-- SELECT t.slug, r.number,
--     count(*) FILTER (WHERE s.home_tournament_team_id IS NOT NULL AND s.away_tournament_team_id IS NOT NULL) AS com_equipes,
--     count(*) FILTER (WHERE s.home_tournament_team_id IS NULL AND s.away_tournament_team_id IS NULL) AS vazios
--   FROM tournament_bracket_slots s
--   JOIN tournament_bracket_rounds r ON r.id = s.round_id
--   JOIN tournaments t ON t.id = s.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND s.is_deleted = false
--   GROUP BY t.slug, r.number ORDER BY t.slug, r.number;
--   -- taca-lap-26-2026/1 e taca-lap-27-2027/1: com_equipes=4, vazios=0
--   -- todos os outros rounds: com_equipes=0, vazios = total de slots do round
--
-- Nenhuma partida criada:
-- SELECT count(*) FROM tournament_bracket_slots s
--   JOIN tournaments t ON t.id = s.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND s.is_deleted = false AND s.match_id IS NOT NULL;
--   -- 0
-- SELECT count(*) FROM matches m
--   JOIN tournaments t ON t.id = m.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026') AND m.is_deleted = false;
--   -- 0
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima.
-- =============================================================================
