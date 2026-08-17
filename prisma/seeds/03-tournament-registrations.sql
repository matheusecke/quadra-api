-- =============================================================================
-- LAP / FUPE — seed principal, etapa 3: inscrições de equipes nos campeonatos
-- =============================================================================
--
-- Escopo desta etapa: inscrição de equipes (TournamentTeam) nos quatro
-- campeonatos criados na etapa 1, usando as equipes e afiliações criadas na
-- etapa 2.
--
-- NÃO cria (etapas futuras, um arquivo por etapa nesta mesma pasta):
--   04-groups-and-brackets.sql           — grupos e chaveamentos
--   05-matches-and-results.sql           — partidas e resultados
--   06-rosters-and-statistics.sql        — elencos e estatísticas
--
-- Execução (psql, local ou produção; requer 01-organizations-context.sql e
-- 02-teams-and-affiliations.sql já aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/03-tournament-registrations.sql
--
-- Registros esperados (40 inscrições ativas):
--   Taça LAP 26 (8): LEP, FACECA, Direito PUCCAMP, Comunica PUCCAMP,
--     Fisio PUCCAMP, Psico PUCCAMP, FAU PUCCAMP, Med Vet PUCCAMP
--   Taça LAP 27 (8): as mesmas 8 equipes acima
--   JUBs 2026 (16): PUCCAMP, Unicamp, UFSCar, UNESP Rio Claro, Anhanguera,
--     CAASO, ESALQ, Mackenzie Campinas, USP, Mackenzie, PUC-SP, ESPM,
--     Insper, FMU, FGV, UniSant'Anna
--   CPU 2026 (8): LEP, LEU, Engenharia Mackenzie, ESPM, Direito PUCCAMP,
--     EEFE USP, FEA USP, FACECA
--
-- Idempotente: rodar o arquivo inteiro uma segunda vez não altera nenhuma
-- contagem. Na primeira execução, o INSERT cria as 40 linhas. Nas execuções
-- seguintes, o INSERT ignora os pares que já têm linha ACTIVE.
--
-- Pré-condição: as duas organizações, os quatro campeonatos, as 28 equipes e
-- as afiliações organização-equipe correspondentes (etapas 1 e 2) já
-- existem, e nenhum dos 40 pares campeonato/equipe tem ainda uma inscrição
-- viva (is_deleted = false) em status diferente de ACTIVE. Os blocos DO
-- abaixo falham explicitamente (RAISE EXCEPTION, aborta a transação inteira)
-- se qualquer uma dessas condições não bater — nunca cria dados pertencentes
-- às etapas anteriores nem altera silenciosamente uma inscrição existente.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: organizações, campeonatos, equipes e afiliações das etapas 1 e 2
-- precisam existir e estar ativas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_count INTEGER;
  v_tournament_count INTEGER;
  v_team_count INTEGER;
  v_lap_affiliation_count INTEGER;
  v_fupe_affiliation_count INTEGER;
BEGIN
  SELECT count(*) INTO v_org_count FROM organizations
  WHERE slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes')
    AND is_deleted = false;
  IF v_org_count <> 2 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 2 organizações ativas (LAP, FUPE), encontradas %. Rode 01-organizations-context.sql primeiro.', v_org_count;
  END IF;

  SELECT count(*) INTO v_tournament_count FROM tournaments
  WHERE slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
    AND is_deleted = false;
  IF v_tournament_count <> 4 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 4 campeonatos ativos (Taça LAP 26, Taça LAP 27, JUBs, CPU), encontrados %. Rode 01-organizations-context.sql primeiro.', v_tournament_count;
  END IF;

  SELECT count(*) INTO v_team_count FROM teams
  WHERE slug IN (
    'lep', 'faceca', 'direito-puccamp', 'comunica-puccamp', 'fisio-puccamp',
    'psico-puccamp', 'fau-puccamp', 'med-vet-puccamp',
    'puccamp', 'unicamp', 'ufscar', 'unesp-rio-claro', 'anhanguera', 'caaso',
    'esalq', 'mackenzie-campinas', 'usp', 'mackenzie', 'puc-sp', 'espm',
    'insper', 'fmu', 'fgv', 'unisantanna',
    'leu', 'engenharia-mackenzie', 'eefe-usp', 'fea-usp'
  ) AND is_deleted = false AND status = 'ACTIVE'::entity_status;
  IF v_team_count <> 28 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 28 equipes ativas, encontradas %. Rode 02-teams-and-affiliations.sql primeiro.', v_team_count;
  END IF;

  SELECT count(*) INTO v_lap_affiliation_count FROM organization_team_affiliations ota
  JOIN organizations o ON o.id = ota.organization_id AND o.slug = 'liga-das-atleticas-da-puccamp'
  JOIN teams t ON t.id = ota.team_id AND t.slug IN (
    'lep', 'faceca', 'direito-puccamp', 'comunica-puccamp', 'fisio-puccamp',
    'psico-puccamp', 'fau-puccamp', 'med-vet-puccamp'
  )
  WHERE ota.is_deleted = false AND ota.status = 'ACTIVE'::affiliation_status;
  IF v_lap_affiliation_count <> 8 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 8 afiliações ativas LAP-equipe, encontradas %. Rode 02-teams-and-affiliations.sql primeiro.', v_lap_affiliation_count;
  END IF;

  SELECT count(*) INTO v_fupe_affiliation_count FROM organization_team_affiliations ota
  JOIN organizations o ON o.id = ota.organization_id AND o.slug = 'federacao-universitaria-paulista-de-esportes'
  JOIN teams t ON t.id = ota.team_id AND t.slug IN (
    'puccamp', 'unicamp', 'ufscar', 'unesp-rio-claro', 'anhanguera', 'caaso',
    'esalq', 'mackenzie-campinas', 'usp', 'mackenzie', 'puc-sp', 'espm',
    'insper', 'fmu', 'fgv', 'unisantanna',
    'lep', 'leu', 'engenharia-mackenzie', 'direito-puccamp', 'eefe-usp',
    'fea-usp', 'faceca'
  )
  WHERE ota.is_deleted = false AND ota.status = 'ACTIVE'::affiliation_status;
  IF v_fupe_affiliation_count <> 23 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 23 afiliações ativas FUPE-equipe, encontradas %. Rode 02-teams-and-affiliations.sql primeiro.', v_fupe_affiliation_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guarda: nenhum dos 40 pares campeonato/equipe pode ter uma inscrição viva
-- (is_deleted = false) em estado diferente de ACTIVE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unexpected_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unexpected_count
  FROM (VALUES
      -- Taça LAP 26 (8)
      ('taca-lap-26-2026', 'lep'),
      ('taca-lap-26-2026', 'faceca'),
      ('taca-lap-26-2026', 'direito-puccamp'),
      ('taca-lap-26-2026', 'comunica-puccamp'),
      ('taca-lap-26-2026', 'fisio-puccamp'),
      ('taca-lap-26-2026', 'psico-puccamp'),
      ('taca-lap-26-2026', 'fau-puccamp'),
      ('taca-lap-26-2026', 'med-vet-puccamp'),
      -- Taça LAP 27 (8, mesmas equipes)
      ('taca-lap-27-2027', 'lep'),
      ('taca-lap-27-2027', 'faceca'),
      ('taca-lap-27-2027', 'direito-puccamp'),
      ('taca-lap-27-2027', 'comunica-puccamp'),
      ('taca-lap-27-2027', 'fisio-puccamp'),
      ('taca-lap-27-2027', 'psico-puccamp'),
      ('taca-lap-27-2027', 'fau-puccamp'),
      ('taca-lap-27-2027', 'med-vet-puccamp'),
      -- JUBs 2026 (16)
      ('jubs-2026', 'puccamp'),
      ('jubs-2026', 'unicamp'),
      ('jubs-2026', 'ufscar'),
      ('jubs-2026', 'unesp-rio-claro'),
      ('jubs-2026', 'anhanguera'),
      ('jubs-2026', 'caaso'),
      ('jubs-2026', 'esalq'),
      ('jubs-2026', 'mackenzie-campinas'),
      ('jubs-2026', 'usp'),
      ('jubs-2026', 'mackenzie'),
      ('jubs-2026', 'puc-sp'),
      ('jubs-2026', 'espm'),
      ('jubs-2026', 'insper'),
      ('jubs-2026', 'fmu'),
      ('jubs-2026', 'fgv'),
      ('jubs-2026', 'unisantanna'),
      -- CPU 2026 (8)
      ('cpu-2026', 'lep'),
      ('cpu-2026', 'leu'),
      ('cpu-2026', 'engenharia-mackenzie'),
      ('cpu-2026', 'espm'),
      ('cpu-2026', 'direito-puccamp'),
      ('cpu-2026', 'eefe-usp'),
      ('cpu-2026', 'fea-usp'),
      ('cpu-2026', 'faceca')
  ) AS m(tournament_slug, team_slug)
  JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
  JOIN teams te ON te.slug = m.team_slug AND te.is_deleted = false
  JOIN tournament_teams tt
    ON tt.tournament_id = t.id AND tt.team_id = te.id AND tt.is_deleted = false
  WHERE tt.status <> 'ACTIVE'::tournament_team_status;

  IF v_unexpected_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % inscrição(ões) viva(s) em estado inesperado (is_deleted = false, status <> ACTIVE) encontrada(s) entre os pares campeonato/equipe esperados.', v_unexpected_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Inscrições (40) — só para pares (campeonato, equipe) sem nenhuma linha
-- ativa (is_deleted = false) ainda.
-- ---------------------------------------------------------------------------
INSERT INTO tournament_teams
  (organization_id, tournament_id, team_id, organization_team_affiliation_id, status, display_name_snapshot, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, te.id, ota.id, 'ACTIVE'::tournament_team_status, te.name, false, NOW(), NOW()
FROM (VALUES
    -- Taça LAP 26 (8)
    ('taca-lap-26-2026', 'lep'),
    ('taca-lap-26-2026', 'faceca'),
    ('taca-lap-26-2026', 'direito-puccamp'),
    ('taca-lap-26-2026', 'comunica-puccamp'),
    ('taca-lap-26-2026', 'fisio-puccamp'),
    ('taca-lap-26-2026', 'psico-puccamp'),
    ('taca-lap-26-2026', 'fau-puccamp'),
    ('taca-lap-26-2026', 'med-vet-puccamp'),
    -- Taça LAP 27 (8, mesmas equipes)
    ('taca-lap-27-2027', 'lep'),
    ('taca-lap-27-2027', 'faceca'),
    ('taca-lap-27-2027', 'direito-puccamp'),
    ('taca-lap-27-2027', 'comunica-puccamp'),
    ('taca-lap-27-2027', 'fisio-puccamp'),
    ('taca-lap-27-2027', 'psico-puccamp'),
    ('taca-lap-27-2027', 'fau-puccamp'),
    ('taca-lap-27-2027', 'med-vet-puccamp'),
    -- JUBs 2026 (16)
    ('jubs-2026', 'puccamp'),
    ('jubs-2026', 'unicamp'),
    ('jubs-2026', 'ufscar'),
    ('jubs-2026', 'unesp-rio-claro'),
    ('jubs-2026', 'anhanguera'),
    ('jubs-2026', 'caaso'),
    ('jubs-2026', 'esalq'),
    ('jubs-2026', 'mackenzie-campinas'),
    ('jubs-2026', 'usp'),
    ('jubs-2026', 'mackenzie'),
    ('jubs-2026', 'puc-sp'),
    ('jubs-2026', 'espm'),
    ('jubs-2026', 'insper'),
    ('jubs-2026', 'fmu'),
    ('jubs-2026', 'fgv'),
    ('jubs-2026', 'unisantanna'),
    -- CPU 2026 (8)
    ('cpu-2026', 'lep'),
    ('cpu-2026', 'leu'),
    ('cpu-2026', 'engenharia-mackenzie'),
    ('cpu-2026', 'espm'),
    ('cpu-2026', 'direito-puccamp'),
    ('cpu-2026', 'eefe-usp'),
    ('cpu-2026', 'fea-usp'),
    ('cpu-2026', 'faceca')
) AS m(tournament_slug, team_slug)
JOIN tournaments t ON t.slug = m.tournament_slug AND t.is_deleted = false
JOIN teams te ON te.slug = m.team_slug AND te.is_deleted = false
JOIN organization_team_affiliations ota
  ON ota.organization_id = t.organization_id
 AND ota.team_id = te.id
 AND ota.is_deleted = false
 AND ota.status = 'ACTIVE'::affiliation_status
WHERE NOT EXISTS (
  SELECT 1 FROM tournament_teams tt
  WHERE tt.tournament_id = t.id AND tt.team_id = te.id AND tt.is_deleted = false
);

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- SELECT t.slug, count(*) FROM tournament_teams tt
--   JOIN tournaments t ON t.id = tt.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND tt.is_deleted = false AND tt.status = 'ACTIVE'
--   GROUP BY t.slug ORDER BY t.slug;
--   -- cpu-2026: 8, jubs-2026: 16, taca-lap-26-2026: 8, taca-lap-27-2027: 8
--
-- SELECT count(*) FROM tournament_teams tt
--   JOIN tournaments t ON t.id = tt.tournament_id
--   WHERE t.slug IN ('taca-lap-26-2026', 'taca-lap-27-2027', 'jubs-2026', 'cpu-2026')
--     AND tt.is_deleted = false AND tt.status = 'ACTIVE';
--   -- 40 (total)
--
-- Nenhuma equipe duplicada dentro do mesmo campeonato (o índice único parcial
-- tournament_teams_tournament_team_active_unique_idx já garante isso, mas a
-- query abaixo deve retornar 0 linhas de qualquer forma):
-- SELECT tournament_id, team_id, count(*) FROM tournament_teams
--   WHERE is_deleted = false
--   GROUP BY tournament_id, team_id HAVING count(*) > 1;
--   -- 0 linhas
--
-- Todas as inscrições apontam para equipes afiliadas à organização daquele
-- campeonato:
-- SELECT count(*) FROM tournament_teams tt
--   JOIN tournaments t ON t.id = tt.tournament_id
--   WHERE tt.is_deleted = false AND tt.status = 'ACTIVE'
--   AND NOT EXISTS (
--     SELECT 1 FROM organization_team_affiliations ota
--     WHERE ota.organization_id = t.organization_id AND ota.team_id = tt.team_id
--       AND ota.is_deleted = false AND ota.status = 'ACTIVE'
--   );
--   -- 0 (nenhuma inscrição órfã de afiliação)
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima.
-- =============================================================================
