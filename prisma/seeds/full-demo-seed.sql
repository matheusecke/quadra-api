-- =============================================================================
-- LAP / FUPE — full demo seed (cleanup + etapas 01..09 em uma única transação)
-- =============================================================================
--
-- Um único BEGIN/COMMIT envolve cleanup + as nove etapas + validação final.
-- Qualquer RAISE EXCEPTION em qualquer ponto reverte o pacote inteiro,
-- inclusive o cleanup. Os arquivos individuais (prisma/seeds/cleanup.sql,
-- prisma/seeds/lap-fupe/01..09) continuam executáveis isoladamente; este
-- arquivo incorpora o corpo de cada um (sem os BEGIN/COMMIT próprios), na
-- mesma ordem, com validações de guarda preservadas.
--
-- Estado final esperado: 2 organizações, 3 temporadas, 4 campeonatos,
-- 28 equipes, 31 afiliações organização-equipe, 40 inscrições em
-- campeonato, 6 grupos, 24 associações equipe-grupo, bracket completo
-- (11 rounds, 24 slots, todos com partida e vencedor), 60 partidas
-- FINISHED, 120 MatchTeam, 240 MatchPeriod, campeões (Taça LAP 26 →
-- Direito PUCCAMP, Taça LAP 27 → LEP, JUBs → PUCCAMP, CPU → ESPM),
-- 196 usuários @quadra.test, 217 afiliações dessa massa (56 LAP + 161
-- FUPE), 240 TournamentRoster, 600 MatchRoster, 600
-- PlayerMatchStatistic, 0 divergências de placar/pontos, e
-- matheusecke@gmail.com preservado como SYS_ADMIN com as duas
-- afiliações ORG_ADMIN.
-- =============================================================================

BEGIN;

-- ============================== cleanup ==============================

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


-- ============================== etapa 1: organizações, temporadas, categoria, campeonatos ==============================

-- guard: admin exists, ACTIVE, SYS_ADMIN
DO $$
DECLARE
  v_user_id INTEGER;
  v_status entity_status;
  v_is_system_admin BOOLEAN;
BEGIN
  SELECT id, status, is_system_admin
    INTO v_user_id, v_status, v_is_system_admin
  FROM users
  WHERE email = 'matheusecke@gmail.com' AND is_deleted = false;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Seed abortado: nenhum usuário ativo encontrado com email matheusecke@gmail.com. Este seed nunca cria esse usuário implicitamente.';
  END IF;

  IF v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Seed abortado: usuário % (matheusecke@gmail.com) tem status % em vez de ACTIVE. Inconsistência não corrigida silenciosamente — resolva manualmente antes de rodar o seed.', v_user_id, v_status;
  END IF;

  IF NOT v_is_system_admin THEN
    RAISE EXCEPTION 'Seed abortado: usuário % (matheusecke@gmail.com) deveria já ser SYS_ADMIN (is_system_admin = true), mas não é. Inconsistência não corrigida silenciosamente — resolva manualmente antes de rodar o seed.', v_user_id;
  END IF;
END $$;

-- organizations (2)
INSERT INTO organizations (name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.slug, 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM (VALUES
    ('Liga das Atléticas da PUCCAMP', 'liga-das-atleticas-da-puccamp'),
    ('Federação Universitária Paulista de Esportes', 'federacao-universitaria-paulista-de-esportes')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.slug = v.slug AND o.is_deleted = false);

-- ORG_ADMIN affiliation (2)
INSERT INTO organization_user_affiliations
  (user_id, organization_id, role, team_id, status, created_by_user_id, is_deleted, created_at, updated_at)
SELECT u.id, o.id, 'ORG_ADMIN'::org_role, NULL, 'ACTIVE'::affiliation_status, u.id, false, NOW(), NOW()
FROM (VALUES
    ('liga-das-atleticas-da-puccamp'),
    ('federacao-universitaria-paulista-de-esportes')
) AS m(org_slug)
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
CROSS JOIN users u
WHERE u.email = 'matheusecke@gmail.com' AND u.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM organization_user_affiliations oua
  WHERE oua.user_id = u.id AND oua.organization_id = o.id
    AND oua.is_deleted = false AND oua.status = 'ACTIVE'
);

-- seasons (3)
INSERT INTO seasons (organization_id, label, start_date, end_date, status, is_deleted, created_at, updated_at)
SELECT o.id, m.label, m.start_date::date, m.end_date::date, 'ACTIVE'::season_status, false, NOW(), NOW()
FROM (VALUES
    ('liga-das-atleticas-da-puccamp', '2026', '2026-01-01', '2026-12-31'),
    ('liga-das-atleticas-da-puccamp', '2027', '2027-01-01', '2027-12-31'),
    ('federacao-universitaria-paulista-de-esportes', '2026', '2026-01-01', '2026-12-31')
) AS m(org_slug, label, start_date, end_date)
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM seasons s WHERE s.organization_id = o.id AND s.label = m.label AND s.is_deleted = false
);

-- tournament category (2)
INSERT INTO tournament_categories (organization_id, name, slug, status, is_deleted, created_at, updated_at)
SELECT o.id, 'Universitário Masculino', 'universitario-masculino', 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM organizations o
WHERE o.slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes')
  AND o.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM tournament_categories tc
  WHERE tc.organization_id = o.id AND tc.name = 'Universitário Masculino' AND tc.is_deleted = false
);

-- tournaments (4)
INSERT INTO tournaments (organization_id, season_id, category_id, name, slug, format, created_by_user_id, is_deleted, created_at, updated_at)
SELECT o.id, s.id, tc.id, m.name, m.slug, m.format::tournament_format, u.id, false, NOW(), NOW()
FROM (VALUES
    ('liga-das-atleticas-da-puccamp', '2026', 'Taça LAP 26', 'taca-lap-26-2026', 'KNOCKOUT'),
    ('liga-das-atleticas-da-puccamp', '2027', 'Taça LAP 27', 'taca-lap-27-2027', 'KNOCKOUT'),
    ('federacao-universitaria-paulista-de-esportes', '2026', 'JUBs', 'jubs-2026', 'GROUP_STAGE_KNOCKOUT'),
    ('federacao-universitaria-paulista-de-esportes', '2026', 'CPU', 'cpu-2026', 'GROUP_STAGE_KNOCKOUT')
) AS m(org_slug, season_label, name, slug, format)
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN seasons s ON s.organization_id = o.id AND s.label = m.season_label AND s.is_deleted = false
JOIN tournament_categories tc ON tc.organization_id = o.id AND tc.name = 'Universitário Masculino' AND tc.is_deleted = false
CROSS JOIN users u
WHERE u.email = 'matheusecke@gmail.com' AND u.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM tournaments t WHERE t.organization_id = o.id AND t.slug = m.slug AND t.is_deleted = false
);


-- ============================== etapa 2: equipes globais e afiliações ==============================

-- guard: LAP/FUPE organizations exist
DO $$
DECLARE
  v_lap_id INTEGER;
  v_fupe_id INTEGER;
BEGIN
  SELECT id INTO v_lap_id FROM organizations
  WHERE slug = 'liga-das-atleticas-da-puccamp' AND is_deleted = false;

  SELECT id INTO v_fupe_id FROM organizations
  WHERE slug = 'federacao-universitaria-paulista-de-esportes' AND is_deleted = false;

  IF v_lap_id IS NULL THEN
    RAISE EXCEPTION 'Seed abortado: organização liga-das-atleticas-da-puccamp não encontrada. Rode 01-organizations-context.sql primeiro.';
  END IF;

  IF v_fupe_id IS NULL THEN
    RAISE EXCEPTION 'Seed abortado: organização federacao-universitaria-paulista-de-esportes não encontrada. Rode 01-organizations-context.sql primeiro.';
  END IF;
END $$;

-- teams (28)
INSERT INTO teams (name, short_name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.short_name, v.slug, 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM (VALUES
    ('LEP', 'LEP', 'lep'),
    ('FACECA', 'FAC', 'faceca'),
    ('Direito PUCCAMP', 'DPU', 'direito-puccamp'),
    ('Comunica PUCCAMP', 'COM', 'comunica-puccamp'),
    ('Fisio PUCCAMP', 'FIS', 'fisio-puccamp'),
    ('Psico PUCCAMP', 'PSI', 'psico-puccamp'),
    ('FAU PUCCAMP', 'FAU', 'fau-puccamp'),
    ('Med Vet PUCCAMP', 'VET', 'med-vet-puccamp'),
    ('PUCCAMP', 'PUC', 'puccamp'),
    ('Unicamp', 'UNI', 'unicamp'),
    ('UFSCar', 'UFS', 'ufscar'),
    ('UNESP Rio Claro', 'URC', 'unesp-rio-claro'),
    ('Anhanguera', 'ANH', 'anhanguera'),
    ('CAASO', 'CAA', 'caaso'),
    ('ESALQ', 'ESA', 'esalq'),
    ('Mackenzie Campinas', 'MKC', 'mackenzie-campinas'),
    ('USP', 'USP', 'usp'),
    ('Mackenzie', 'MAK', 'mackenzie'),
    ('PUC-SP', 'PSP', 'puc-sp'),
    ('ESPM', 'ESP', 'espm'),
    ('Insper', 'INS', 'insper'),
    ('FMU', 'FMU', 'fmu'),
    ('FGV', 'FGV', 'fgv'),
    ('UniSant''Anna', 'UNA', 'unisantanna'),
    ('LEU', 'LEU', 'leu'),
    ('Engenharia Mackenzie', 'EMK', 'engenharia-mackenzie'),
    ('EEFE USP', 'EEF', 'eefe-usp'),
    ('FEA USP', 'FEA', 'fea-usp')
) AS v(name, short_name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM teams t
  WHERE t.slug = v.slug AND t.is_deleted = false AND t.status <> 'INACTIVE'::entity_status
);

-- organization-team affiliations (31)
INSERT INTO organization_team_affiliations (organization_id, team_id, status, is_deleted, created_at, updated_at)
SELECT o.id, t.id, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('liga-das-atleticas-da-puccamp', 'lep'),
    ('liga-das-atleticas-da-puccamp', 'faceca'),
    ('liga-das-atleticas-da-puccamp', 'direito-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'comunica-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'fisio-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'psico-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'fau-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'med-vet-puccamp'),
    ('federacao-universitaria-paulista-de-esportes', 'puccamp'),
    ('federacao-universitaria-paulista-de-esportes', 'unicamp'),
    ('federacao-universitaria-paulista-de-esportes', 'ufscar'),
    ('federacao-universitaria-paulista-de-esportes', 'unesp-rio-claro'),
    ('federacao-universitaria-paulista-de-esportes', 'anhanguera'),
    ('federacao-universitaria-paulista-de-esportes', 'caaso'),
    ('federacao-universitaria-paulista-de-esportes', 'esalq'),
    ('federacao-universitaria-paulista-de-esportes', 'mackenzie-campinas'),
    ('federacao-universitaria-paulista-de-esportes', 'usp'),
    ('federacao-universitaria-paulista-de-esportes', 'mackenzie'),
    ('federacao-universitaria-paulista-de-esportes', 'puc-sp'),
    ('federacao-universitaria-paulista-de-esportes', 'espm'),
    ('federacao-universitaria-paulista-de-esportes', 'insper'),
    ('federacao-universitaria-paulista-de-esportes', 'fmu'),
    ('federacao-universitaria-paulista-de-esportes', 'fgv'),
    ('federacao-universitaria-paulista-de-esportes', 'unisantanna'),
    ('federacao-universitaria-paulista-de-esportes', 'lep'),
    ('federacao-universitaria-paulista-de-esportes', 'leu'),
    ('federacao-universitaria-paulista-de-esportes', 'engenharia-mackenzie'),
    ('federacao-universitaria-paulista-de-esportes', 'direito-puccamp'),
    ('federacao-universitaria-paulista-de-esportes', 'eefe-usp'),
    ('federacao-universitaria-paulista-de-esportes', 'fea-usp'),
    ('federacao-universitaria-paulista-de-esportes', 'faceca')
) AS m(org_slug, team_slug)
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM organization_team_affiliations ota
  WHERE ota.organization_id = o.id AND ota.team_id = t.id AND ota.is_deleted = false
);


-- ============================== etapa 3: inscrições em campeonato ==============================

-- guard: orgs, tournaments, teams, affiliations exist
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

-- guard: no unexpected existing registrations
DO $$
DECLARE
  v_unexpected_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unexpected_count
  FROM (VALUES
      ('taca-lap-26-2026', 'lep'),
      ('taca-lap-26-2026', 'faceca'),
      ('taca-lap-26-2026', 'direito-puccamp'),
      ('taca-lap-26-2026', 'comunica-puccamp'),
      ('taca-lap-26-2026', 'fisio-puccamp'),
      ('taca-lap-26-2026', 'psico-puccamp'),
      ('taca-lap-26-2026', 'fau-puccamp'),
      ('taca-lap-26-2026', 'med-vet-puccamp'),
      ('taca-lap-27-2027', 'lep'),
      ('taca-lap-27-2027', 'faceca'),
      ('taca-lap-27-2027', 'direito-puccamp'),
      ('taca-lap-27-2027', 'comunica-puccamp'),
      ('taca-lap-27-2027', 'fisio-puccamp'),
      ('taca-lap-27-2027', 'psico-puccamp'),
      ('taca-lap-27-2027', 'fau-puccamp'),
      ('taca-lap-27-2027', 'med-vet-puccamp'),
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

-- tournament registrations (40)
INSERT INTO tournament_teams
  (organization_id, tournament_id, team_id, organization_team_affiliation_id, status, display_name_snapshot, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, te.id, ota.id, 'ACTIVE'::tournament_team_status, te.name, false, NOW(), NOW()
FROM (VALUES
    ('taca-lap-26-2026', 'lep'),
    ('taca-lap-26-2026', 'faceca'),
    ('taca-lap-26-2026', 'direito-puccamp'),
    ('taca-lap-26-2026', 'comunica-puccamp'),
    ('taca-lap-26-2026', 'fisio-puccamp'),
    ('taca-lap-26-2026', 'psico-puccamp'),
    ('taca-lap-26-2026', 'fau-puccamp'),
    ('taca-lap-26-2026', 'med-vet-puccamp'),
    ('taca-lap-27-2027', 'lep'),
    ('taca-lap-27-2027', 'faceca'),
    ('taca-lap-27-2027', 'direito-puccamp'),
    ('taca-lap-27-2027', 'comunica-puccamp'),
    ('taca-lap-27-2027', 'fisio-puccamp'),
    ('taca-lap-27-2027', 'psico-puccamp'),
    ('taca-lap-27-2027', 'fau-puccamp'),
    ('taca-lap-27-2027', 'med-vet-puccamp'),
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


-- ============================== etapa 4: grupos e chaveamento ==============================

-- guard: tournaments and registrations (8/8/16/8) exist
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

-- guard: KNOCKOUT tournaments have no groups
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

-- guard: group/bracket pairs resolve to active registrations
DO $$
DECLARE
  v_group_pairs_count INTEGER;
  v_bracket_pairs_count INTEGER;
BEGIN
  SELECT count(*) INTO v_group_pairs_count
  FROM (VALUES
      ('jubs-2026', 'puccamp'), ('jubs-2026', 'ufscar'), ('jubs-2026', 'anhanguera'), ('jubs-2026', 'esalq'),
      ('jubs-2026', 'unicamp'), ('jubs-2026', 'caaso'), ('jubs-2026', 'unesp-rio-claro'), ('jubs-2026', 'mackenzie-campinas'),
      ('jubs-2026', 'espm'), ('jubs-2026', 'usp'), ('jubs-2026', 'fmu'), ('jubs-2026', 'unisantanna'),
      ('jubs-2026', 'mackenzie'), ('jubs-2026', 'puc-sp'), ('jubs-2026', 'insper'), ('jubs-2026', 'fgv'),
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
      ('taca-lap-26-2026', 'lep'), ('taca-lap-26-2026', 'fau-puccamp'), ('taca-lap-26-2026', 'fisio-puccamp'), ('taca-lap-26-2026', 'psico-puccamp'),
      ('taca-lap-26-2026', 'direito-puccamp'), ('taca-lap-26-2026', 'comunica-puccamp'), ('taca-lap-26-2026', 'faceca'), ('taca-lap-26-2026', 'med-vet-puccamp'),
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

-- groups (6)
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

-- group-team associations (24)
INSERT INTO tournament_group_teams (organization_id, tournament_id, tournament_group_id, tournament_team_id, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, g.id, tt.id, false, NOW(), NOW()
FROM (VALUES
    ('jubs-2026', 'Interior A', 'puccamp'),
    ('jubs-2026', 'Interior A', 'ufscar'),
    ('jubs-2026', 'Interior A', 'anhanguera'),
    ('jubs-2026', 'Interior A', 'esalq'),
    ('jubs-2026', 'Interior B', 'unicamp'),
    ('jubs-2026', 'Interior B', 'caaso'),
    ('jubs-2026', 'Interior B', 'unesp-rio-claro'),
    ('jubs-2026', 'Interior B', 'mackenzie-campinas'),
    ('jubs-2026', 'Capital A', 'espm'),
    ('jubs-2026', 'Capital A', 'usp'),
    ('jubs-2026', 'Capital A', 'fmu'),
    ('jubs-2026', 'Capital A', 'unisantanna'),
    ('jubs-2026', 'Capital B', 'mackenzie'),
    ('jubs-2026', 'Capital B', 'puc-sp'),
    ('jubs-2026', 'Capital B', 'insper'),
    ('jubs-2026', 'Capital B', 'fgv'),
    ('cpu-2026', 'Grupo A', 'lep'),
    ('cpu-2026', 'Grupo A', 'engenharia-mackenzie'),
    ('cpu-2026', 'Grupo A', 'direito-puccamp'),
    ('cpu-2026', 'Grupo A', 'fea-usp'),
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

-- bracket rounds (11)
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

-- bracket slots (24)
INSERT INTO tournament_bracket_slots
  (organization_id, tournament_id, round_id, position, label, home_tournament_team_id, away_tournament_team_id, is_deleted, created_at, updated_at)
SELECT t.organization_id, t.id, r.id, m.position, m.label, home_tt.id, away_tt.id, false, NOW(), NOW()
FROM (VALUES
    ('taca-lap-26-2026', 1, 1, NULL, 'lep', 'fau-puccamp'),
    ('taca-lap-26-2026', 1, 2, NULL, 'fisio-puccamp', 'psico-puccamp'),
    ('taca-lap-26-2026', 1, 3, NULL, 'direito-puccamp', 'comunica-puccamp'),
    ('taca-lap-26-2026', 1, 4, NULL, 'faceca', 'med-vet-puccamp'),
    ('taca-lap-26-2026', 2, 1, NULL, NULL, NULL),
    ('taca-lap-26-2026', 2, 2, NULL, NULL, NULL),
    ('taca-lap-26-2026', 3, 1, NULL, NULL, NULL),
    ('taca-lap-27-2027', 1, 1, NULL, 'lep', 'psico-puccamp'),
    ('taca-lap-27-2027', 1, 2, NULL, 'faceca', 'fau-puccamp'),
    ('taca-lap-27-2027', 1, 3, NULL, 'direito-puccamp', 'med-vet-puccamp'),
    ('taca-lap-27-2027', 1, 4, NULL, 'comunica-puccamp', 'fisio-puccamp'),
    ('taca-lap-27-2027', 2, 1, NULL, NULL, NULL),
    ('taca-lap-27-2027', 2, 2, NULL, NULL, NULL),
    ('taca-lap-27-2027', 3, 1, NULL, NULL, NULL),
    ('jubs-2026', 1, 1, '1º Interior A × 2º Capital B', NULL, NULL),
    ('jubs-2026', 1, 2, '1º Interior B × 2º Capital A', NULL, NULL),
    ('jubs-2026', 1, 3, '1º Capital A × 2º Interior B', NULL, NULL),
    ('jubs-2026', 1, 4, '1º Capital B × 2º Interior A', NULL, NULL),
    ('jubs-2026', 2, 1, NULL, NULL, NULL),
    ('jubs-2026', 2, 2, NULL, NULL, NULL),
    ('jubs-2026', 3, 1, NULL, NULL, NULL),
    ('cpu-2026', 1, 1, '1º Grupo A × 2º Grupo B', NULL, NULL),
    ('cpu-2026', 1, 2, '1º Grupo B × 2º Grupo A', NULL, NULL),
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


-- ============================== etapa 5: partidas e resultados ==============================

-- guard: tournaments valid, not cancelled, no conflicting champion
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

-- match data (60)
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
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 1, 1, 'lep', 'fau-puccamp', 76, 68, '2026-03-07 09:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 2, 2, 'fisio-puccamp', 'psico-puccamp', 73, 66, '2026-03-07 11:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 3, 3, 'direito-puccamp', 'comunica-puccamp', 80, 71, '2026-03-07 14:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 1, 4, 4, 'faceca', 'med-vet-puccamp', 75, 69, '2026-03-07 16:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 2, 1, 5, 'lep', 'fisio-puccamp', 79, 72, '2026-03-14 10:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 2, 2, 6, 'direito-puccamp', 'faceca', 84, 77, '2026-03-14 15:00:00'),
  ('taca-lap-26-2026', 'BRACKET', NULL, 3, 1, 7, 'direito-puccamp', 'lep', 81, 75, '2026-03-21 16:00:00'),

  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 1, 1, 'lep', 'psico-puccamp', 77, 68, '2027-03-06 09:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 2, 2, 'faceca', 'fau-puccamp', 74, 67, '2027-03-06 11:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 3, 3, 'direito-puccamp', 'med-vet-puccamp', 79, 70, '2027-03-06 14:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 1, 4, 4, 'comunica-puccamp', 'fisio-puccamp', 72, 65, '2027-03-06 16:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 2, 1, 5, 'lep', 'faceca', 80, 73, '2027-03-13 10:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 2, 2, 6, 'direito-puccamp', 'comunica-puccamp', 83, 76, '2027-03-13 15:00:00'),
  ('taca-lap-27-2027', 'BRACKET', NULL, 3, 1, 7, 'lep', 'direito-puccamp', 82, 78, '2027-03-20 16:00:00'),

  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 1, 'puccamp', 'ufscar', 78, 70, '2026-06-07 09:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 2, 'puccamp', 'anhanguera', 82, 64, '2026-06-06 09:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 3, 'puccamp', 'esalq', 90, 55, '2026-06-05 09:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 4, 'ufscar', 'anhanguera', 74, 68, '2026-06-05 14:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 5, 'ufscar', 'esalq', 80, 60, '2026-06-06 14:00:00'),
  ('jubs-2026', 'GROUP', 'Interior A', NULL, NULL, 6, 'anhanguera', 'esalq', 71, 65, '2026-06-07 14:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 7, 'unicamp', 'caaso', 78, 70, '2026-06-07 10:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 8, 'unicamp', 'unesp-rio-claro', 82, 64, '2026-06-06 10:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 9, 'unicamp', 'mackenzie-campinas', 90, 55, '2026-06-05 10:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 10, 'caaso', 'unesp-rio-claro', 74, 68, '2026-06-05 15:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 11, 'caaso', 'mackenzie-campinas', 80, 60, '2026-06-06 15:00:00'),
  ('jubs-2026', 'GROUP', 'Interior B', NULL, NULL, 12, 'unesp-rio-claro', 'mackenzie-campinas', 71, 65, '2026-06-07 15:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 13, 'espm', 'usp', 78, 70, '2026-06-07 11:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 14, 'espm', 'fmu', 82, 64, '2026-06-06 11:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 15, 'espm', 'unisantanna', 90, 55, '2026-06-05 11:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 16, 'usp', 'fmu', 74, 68, '2026-06-05 16:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 17, 'usp', 'unisantanna', 80, 60, '2026-06-06 16:00:00'),
  ('jubs-2026', 'GROUP', 'Capital A', NULL, NULL, 18, 'fmu', 'unisantanna', 71, 65, '2026-06-07 16:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 19, 'mackenzie', 'puc-sp', 78, 70, '2026-06-07 12:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 20, 'mackenzie', 'insper', 82, 64, '2026-06-06 12:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 21, 'mackenzie', 'fgv', 90, 55, '2026-06-05 12:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 22, 'puc-sp', 'insper', 74, 68, '2026-06-05 17:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 23, 'puc-sp', 'fgv', 80, 60, '2026-06-06 17:00:00'),
  ('jubs-2026', 'GROUP', 'Capital B', NULL, NULL, 24, 'insper', 'fgv', 71, 65, '2026-06-07 17:00:00'),

  ('jubs-2026', 'BRACKET', NULL, 1, 1, 25, 'puccamp', 'puc-sp', 74, 66, '2026-06-13 09:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 1, 2, 26, 'unicamp', 'usp', 68, 75, '2026-06-13 11:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 1, 3, 27, 'espm', 'caaso', 77, 69, '2026-06-13 14:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 1, 4, 28, 'mackenzie', 'ufscar', 73, 67, '2026-06-13 16:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 2, 1, 29, 'puccamp', 'usp', 78, 70, '2026-06-20 10:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 2, 2, 30, 'espm', 'mackenzie', 76, 71, '2026-06-20 15:00:00'),
  ('jubs-2026', 'BRACKET', NULL, 3, 1, 31, 'puccamp', 'espm', 80, 74, '2026-06-27 16:00:00'),

  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 1, 'lep', 'engenharia-mackenzie', 78, 70, '2026-09-07 09:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 2, 'lep', 'direito-puccamp', 82, 64, '2026-09-06 09:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 3, 'lep', 'fea-usp', 90, 55, '2026-09-05 09:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 4, 'engenharia-mackenzie', 'direito-puccamp', 74, 68, '2026-09-05 14:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 5, 'engenharia-mackenzie', 'fea-usp', 80, 60, '2026-09-06 14:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo A', NULL, NULL, 6, 'direito-puccamp', 'fea-usp', 71, 65, '2026-09-07 14:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 7, 'espm', 'eefe-usp', 78, 70, '2026-09-07 10:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 8, 'espm', 'leu', 82, 64, '2026-09-06 10:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 9, 'espm', 'faceca', 90, 55, '2026-09-05 10:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 10, 'eefe-usp', 'leu', 74, 68, '2026-09-05 15:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 11, 'eefe-usp', 'faceca', 80, 60, '2026-09-06 15:00:00'),
  ('cpu-2026', 'GROUP', 'Grupo B', NULL, NULL, 12, 'leu', 'faceca', 71, 65, '2026-09-07 15:00:00'),

  ('cpu-2026', 'BRACKET', NULL, 1, 1, 13, 'lep', 'eefe-usp', 79, 71, '2026-09-12 10:00:00'),
  ('cpu-2026', 'BRACKET', NULL, 1, 2, 14, 'espm', 'engenharia-mackenzie', 77, 70, '2026-09-12 15:00:00'),
  ('cpu-2026', 'BRACKET', NULL, 2, 1, 15, 'lep', 'espm', 72, 78, '2026-09-19 16:00:00');

-- guard: matches resolve to active registrations/groups/slots
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

-- matches (60)
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

-- match_teams HOME (60)
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

-- match_teams AWAY (60)
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

-- match_periods (240)
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

-- sync bracket slots (team, match, winner)
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

-- finalize tournaments + champion
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

-- guard: no ties, periods sum to final_score
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


-- ============================== etapa 6: usuários e afiliações de equipe ==============================

-- guard: admin and teams/affiliations exist
DO $$
DECLARE
  v_admin_id INTEGER;
  v_admin_status entity_status;
  v_admin_is_system_admin BOOLEAN;
  v_team_count INTEGER;
  v_lap_affiliation_count INTEGER;
  v_fupe_affiliation_count INTEGER;
BEGIN
  SELECT id, status, is_system_admin
    INTO v_admin_id, v_admin_status, v_admin_is_system_admin
  FROM users
  WHERE email = 'matheusecke@gmail.com' AND is_deleted = false;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Seed abortado: nenhum usuário ativo encontrado com email matheusecke@gmail.com. Este seed nunca cria esse usuário implicitamente.';
  END IF;

  IF v_admin_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Seed abortado: usuário % (matheusecke@gmail.com) tem status % em vez de ACTIVE.', v_admin_id, v_admin_status;
  END IF;

  IF NOT v_admin_is_system_admin THEN
    RAISE EXCEPTION 'Seed abortado: usuário % (matheusecke@gmail.com) deveria já ser SYS_ADMIN (is_system_admin = true), mas não é.', v_admin_id;
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
  WHERE ota.is_deleted = false AND ota.status = 'ACTIVE'::affiliation_status;
  IF v_lap_affiliation_count <> 8 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 8 afiliações ativas LAP-equipe, encontradas %. Rode 02-teams-and-affiliations.sql primeiro.', v_lap_affiliation_count;
  END IF;

  SELECT count(*) INTO v_fupe_affiliation_count FROM organization_team_affiliations ota
  JOIN organizations o ON o.id = ota.organization_id AND o.slug = 'federacao-universitaria-paulista-de-esportes'
  WHERE ota.is_deleted = false AND ota.status = 'ACTIVE'::affiliation_status;
  IF v_fupe_affiliation_count <> 23 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 23 afiliações ativas FUPE-equipe, encontradas %. Rode 02-teams-and-affiliations.sql primeiro.', v_fupe_affiliation_count;
  END IF;
END $$;

-- roster data (196 people)
CREATE TEMP TABLE tmp_roster (
  team_slug     text NOT NULL,
  org_role      org_role NOT NULL,
  jersey_number integer,
  position      basketball_position,
  name          text NOT NULL,
  email         text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_roster (team_slug, org_role, jersey_number, position, name, email)
VALUES
    ('lep', 'ATHLETE'::org_role, 4, 'PG'::basketball_position, 'Lucas Silva', 'lucas.silva@quadra.test'),
    ('lep', 'ATHLETE'::org_role, 5, 'SG'::basketball_position, 'Vinícius Alves', 'vinicius.alves@quadra.test'),
    ('lep', 'ATHLETE'::org_role, 6, 'SF'::basketball_position, 'Victor Duarte', 'victor.duarte@quadra.test'),
    ('lep', 'ATHLETE'::org_role, 7, 'PF'::basketball_position, 'Paulo Guimarães', 'paulo.guimaraes@quadra.test'),
    ('lep', 'ATHLETE'::org_role, 8, 'C'::basketball_position, 'Matheus Maia', 'matheus.maia@quadra.test'),
    ('lep', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Henrique Costa', 'henrique.costa@quadra.test'),
    ('lep', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Renato Barbosa', 'renato.barbosa@quadra.test'),
    ('faceca', 'ATHLETE'::org_role, 9, 'SG'::basketball_position, 'Felipe Fernandes', 'felipe.fernandes@quadra.test'),
    ('faceca', 'ATHLETE'::org_role, 10, 'SF'::basketball_position, 'Diego Moura', 'diego.moura@quadra.test'),
    ('faceca', 'ATHLETE'::org_role, 11, 'PF'::basketball_position, 'Otávio Tavares', 'otavio.tavares@quadra.test'),
    ('faceca', 'ATHLETE'::org_role, 12, 'C'::basketball_position, 'Raul Sales', 'raul.sales@quadra.test'),
    ('faceca', 'ATHLETE'::org_role, 13, 'PG'::basketball_position, 'Leonardo Arruda', 'leonardo.arruda@quadra.test'),
    ('faceca', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Samuel Ribeiro', 'samuel.ribeiro@quadra.test'),
    ('faceca', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Enzo Moraes', 'enzo.moraes@quadra.test'),
    ('direito-puccamp', 'ATHLETE'::org_role, 14, 'SF'::basketball_position, 'Murilo Barbosa', 'murilo.barbosa@quadra.test'),
    ('direito-puccamp', 'ATHLETE'::org_role, 15, 'PF'::basketball_position, 'Fernando Coelho', 'fernando.coelho@quadra.test'),
    ('direito-puccamp', 'ATHLETE'::org_role, 21, 'C'::basketball_position, 'César Fonseca', 'cesar.fonseca@quadra.test'),
    ('direito-puccamp', 'ATHLETE'::org_role, 22, 'PG'::basketball_position, 'Rafael Abreu', 'rafael.abreu@quadra.test'),
    ('direito-puccamp', 'ATHLETE'::org_role, 23, 'SG'::basketball_position, 'Gustavo Araújo', 'gustavo.araujo@quadra.test'),
    ('direito-puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Ricardo Castro', 'ricardo.castro@quadra.test'),
    ('direito-puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Vitor Ramos', 'vitor.ramos@quadra.test'),
    ('comunica-puccamp', 'ATHLETE'::org_role, 24, 'PF'::basketball_position, 'Rodrigo Moraes', 'rodrigo.moraes@quadra.test'),
    ('comunica-puccamp', 'ATHLETE'::org_role, 25, 'C'::basketball_position, 'Davi Rezende', 'davi.rezende@quadra.test'),
    ('comunica-puccamp', 'ATHLETE'::org_role, 30, 'PG'::basketball_position, 'Alan Lacerda', 'alan.lacerda@quadra.test'),
    ('comunica-puccamp', 'ATHLETE'::org_role, 31, 'SG'::basketball_position, 'Thiago Ferreira', 'thiago.ferreira@quadra.test'),
    ('comunica-puccamp', 'ATHLETE'::org_role, 32, 'SF'::basketball_position, 'Nicolas Freitas', 'nicolas.freitas@quadra.test'),
    ('comunica-puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Igor Machado', 'igor.machado@quadra.test'),
    ('comunica-puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Douglas Dantas', 'douglas.dantas@quadra.test'),
    ('fisio-puccamp', 'ATHLETE'::org_role, 33, 'C'::basketball_position, 'Renato Ramos', 'renato.ramos@quadra.test'),
    ('fisio-puccamp', 'ATHLETE'::org_role, 34, 'PG'::basketball_position, 'Wesley Figueiredo', 'wesley.figueiredo@quadra.test'),
    ('fisio-puccamp', 'ATHLETE'::org_role, 35, 'SG'::basketball_position, 'Pedro Godoy', 'pedro.godoy@quadra.test'),
    ('fisio-puccamp', 'ATHLETE'::org_role, 40, 'SF'::basketball_position, 'Daniel Rocha', 'daniel.rocha@quadra.test'),
    ('fisio-puccamp', 'ATHLETE'::org_role, 41, 'PF'::basketball_position, 'Alexandre Azevedo', 'alexandre.azevedo@quadra.test'),
    ('fisio-puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Maurício Macedo', 'mauricio.macedo@quadra.test'),
    ('fisio-puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Bruno Xavier', 'bruno.xavier@quadra.test'),
    ('psico-puccamp', 'ATHLETE'::org_role, 42, 'PG'::basketball_position, 'Enzo Dantas', 'enzo.dantas@quadra.test'),
    ('psico-puccamp', 'ATHLETE'::org_role, 44, 'SG'::basketball_position, 'Fábio Miranda', 'fabio.miranda@quadra.test'),
    ('psico-puccamp', 'ATHLETE'::org_role, 45, 'SF'::basketball_position, 'André Lima', 'andre.lima@quadra.test'),
    ('psico-puccamp', 'ATHLETE'::org_role, 50, 'PF'::basketball_position, 'Arthur Moreira', 'arthur.moreira@quadra.test'),
    ('psico-puccamp', 'ATHLETE'::org_role, 51, 'C'::basketball_position, 'Leandro Pinto', 'leandro.pinto@quadra.test'),
    ('psico-puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Lucas Queiroz', 'lucas.queiroz@quadra.test'),
    ('psico-puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Vinícius Marinho', 'vinicius.marinho@quadra.test'),
    ('fau-puccamp', 'ATHLETE'::org_role, 52, 'SG'::basketball_position, 'Vitor Xavier', 'vitor.xavier@quadra.test'),
    ('fau-puccamp', 'ATHLETE'::org_role, 53, 'SF'::basketball_position, 'Guilherme Souza', 'guilherme.souza@quadra.test'),
    ('fau-puccamp', 'ATHLETE'::org_role, 54, 'PF'::basketball_position, 'Eduardo Barros', 'eduardo.barros@quadra.test'),
    ('fau-puccamp', 'ATHLETE'::org_role, 55, 'C'::basketball_position, 'Augusto Vieira', 'augusto.vieira@quadra.test'),
    ('fau-puccamp', 'ATHLETE'::org_role, 60, 'PG'::basketball_position, 'Antônio Amaral', 'antonio.amaral@quadra.test'),
    ('fau-puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Felipe Porto', 'felipe.porto@quadra.test'),
    ('fau-puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Diego Nascimento', 'diego.nascimento@quadra.test'),
    ('med-vet-puccamp', 'ATHLETE'::org_role, 61, 'SF'::basketball_position, 'Douglas Marinho', 'douglas.marinho@quadra.test'),
    ('med-vet-puccamp', 'ATHLETE'::org_role, 62, 'PF'::basketball_position, 'João Martins', 'joao.martins@quadra.test'),
    ('med-vet-puccamp', 'ATHLETE'::org_role, 63, 'C'::basketball_position, 'Bernardo Nogueira', 'bernardo.nogueira@quadra.test'),
    ('med-vet-puccamp', 'ATHLETE'::org_role, 64, 'PG'::basketball_position, 'Mateus Neves', 'mateus.neves@quadra.test'),
    ('med-vet-puccamp', 'ATHLETE'::org_role, 65, 'SG'::basketball_position, 'Gabriel Prado', 'gabriel.prado@quadra.test'),
    ('med-vet-puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Murilo Oliveira', 'murilo.oliveira@quadra.test'),
    ('med-vet-puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Fernando Mendes', 'fernando.mendes@quadra.test'),
    ('puccamp', 'ATHLETE'::org_role, 4, 'PF'::basketball_position, 'Bruno Nascimento', 'bruno.nascimento@quadra.test'),
    ('puccamp', 'ATHLETE'::org_role, 5, 'C'::basketball_position, 'Marcelo Teixeira', 'marcelo.teixeira@quadra.test'),
    ('puccamp', 'ATHLETE'::org_role, 6, 'PG'::basketball_position, 'Heitor Lopes', 'heitor.lopes@quadra.test'),
    ('puccamp', 'ATHLETE'::org_role, 7, 'SG'::basketball_position, 'Francisco Medeiros', 'francisco.medeiros@quadra.test'),
    ('puccamp', 'ATHLETE'::org_role, 8, 'SF'::basketball_position, 'Caio Junqueira', 'caio.junqueira@quadra.test'),
    ('puccamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Rodrigo Gomes', 'rodrigo.gomes@quadra.test'),
    ('puccamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Davi Campos', 'davi.campos@quadra.test'),
    ('unicamp', 'ATHLETE'::org_role, 9, 'C'::basketball_position, 'Vinícius Mendes', 'vinicius.mendes@quadra.test'),
    ('unicamp', 'ATHLETE'::org_role, 10, 'PG'::basketball_position, 'Victor Andrade', 'victor.andrade@quadra.test'),
    ('unicamp', 'ATHLETE'::org_role, 11, 'SG'::basketball_position, 'Paulo Siqueira', 'paulo.siqueira@quadra.test'),
    ('unicamp', 'ATHLETE'::org_role, 12, 'SF'::basketball_position, 'Matheus Viana', 'matheus.viana@quadra.test'),
    ('unicamp', 'ATHLETE'::org_role, 13, 'PF'::basketball_position, 'Henrique Almeida', 'henrique.almeida@quadra.test'),
    ('unicamp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Renato Correia', 'renato.correia@quadra.test'),
    ('unicamp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Wesley Cunha', 'wesley.cunha@quadra.test'),
    ('ufscar', 'ATHLETE'::org_role, 14, 'PG'::basketball_position, 'Diego Campos', 'diego.campos@quadra.test'),
    ('ufscar', 'ATHLETE'::org_role, 15, 'SG'::basketball_position, 'Otávio Borges', 'otavio.borges@quadra.test'),
    ('ufscar', 'ATHLETE'::org_role, 21, 'SF'::basketball_position, 'Raul Assis', 'raul.assis@quadra.test'),
    ('ufscar', 'ATHLETE'::org_role, 22, 'PF'::basketball_position, 'Leonardo Santos', 'leonardo.santos@quadra.test'),
    ('ufscar', 'ATHLETE'::org_role, 23, 'C'::basketball_position, 'Samuel Monteiro', 'samuel.monteiro@quadra.test'),
    ('ufscar', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Enzo Farias', 'enzo.farias@quadra.test'),
    ('ufscar', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Fábio Peixoto', 'fabio.peixoto@quadra.test'),
    ('unesp-rio-claro', 'ATHLETE'::org_role, 24, 'SG'::basketball_position, 'Fernando Cunha', 'fernando.cunha@quadra.test'),
    ('unesp-rio-claro', 'ATHLETE'::org_role, 25, 'SF'::basketball_position, 'César Brito', 'cesar.brito@quadra.test'),
    ('unesp-rio-claro', 'ATHLETE'::org_role, 30, 'PF'::basketball_position, 'Rafael Navarro', 'rafael.navarro@quadra.test'),
    ('unesp-rio-claro', 'ATHLETE'::org_role, 31, 'C'::basketball_position, 'Gustavo Carvalho', 'gustavo.carvalho@quadra.test'),
    ('unesp-rio-claro', 'ATHLETE'::org_role, 32, 'PG'::basketball_position, 'Ricardo Cavalcanti', 'ricardo.cavalcanti@quadra.test'),
    ('unesp-rio-claro', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Vitor Pires', 'vitor.pires@quadra.test'),
    ('unesp-rio-claro', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Guilherme Bastos', 'guilherme.bastos@quadra.test'),
    ('anhanguera', 'ATHLETE'::org_role, 33, 'SF'::basketball_position, 'Davi Peixoto', 'davi.peixoto@quadra.test'),
    ('anhanguera', 'ATHLETE'::org_role, 34, 'PF'::basketball_position, 'Alan Aguiar', 'alan.aguiar@quadra.test'),
    ('anhanguera', 'ATHLETE'::org_role, 35, 'C'::basketball_position, 'Thiago Rodrigues', 'thiago.rodrigues@quadra.test'),
    ('anhanguera', 'ATHLETE'::org_role, 40, 'PG'::basketball_position, 'Nicolas Cardoso', 'nicolas.cardoso@quadra.test'),
    ('anhanguera', 'ATHLETE'::org_role, 41, 'SG'::basketball_position, 'Igor Reis', 'igor.reis@quadra.test'),
    ('anhanguera', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Douglas Paiva', 'douglas.paiva@quadra.test'),
    ('anhanguera', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'João Galvão', 'joao.galvao@quadra.test'),
    ('caaso', 'ATHLETE'::org_role, 42, 'PF'::basketball_position, 'Wesley Bastos', 'wesley.bastos@quadra.test'),
    ('caaso', 'ATHLETE'::org_role, 44, 'C'::basketball_position, 'Pedro Silva', 'pedro.silva@quadra.test'),
    ('caaso', 'ATHLETE'::org_role, 45, 'PG'::basketball_position, 'Daniel Alves', 'daniel.alves@quadra.test'),
    ('caaso', 'ATHLETE'::org_role, 50, 'SG'::basketball_position, 'Alexandre Duarte', 'alexandre.duarte@quadra.test'),
    ('caaso', 'ATHLETE'::org_role, 51, 'SF'::basketball_position, 'Maurício Guimarães', 'mauricio.guimaraes@quadra.test'),
    ('caaso', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Bruno Maia', 'bruno.maia@quadra.test'),
    ('caaso', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Marcelo Costa', 'marcelo.costa@quadra.test'),
    ('esalq', 'ATHLETE'::org_role, 52, 'C'::basketball_position, 'Fábio Galvão', 'fabio.galvao@quadra.test'),
    ('esalq', 'ATHLETE'::org_role, 53, 'PG'::basketball_position, 'André Fernandes', 'andre.fernandes@quadra.test'),
    ('esalq', 'ATHLETE'::org_role, 54, 'SG'::basketball_position, 'Arthur Moura', 'arthur.moura@quadra.test'),
    ('esalq', 'ATHLETE'::org_role, 55, 'SF'::basketball_position, 'Leandro Tavares', 'leandro.tavares@quadra.test'),
    ('esalq', 'ATHLETE'::org_role, 60, 'PF'::basketball_position, 'Lucas Sales', 'lucas.sales@quadra.test'),
    ('esalq', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Vinícius Arruda', 'vinicius.arruda@quadra.test'),
    ('esalq', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Victor Ribeiro', 'victor.ribeiro@quadra.test'),
    ('mackenzie-campinas', 'ATHLETE'::org_role, 61, 'PG'::basketball_position, 'Guilherme Costa', 'guilherme.costa@quadra.test'),
    ('mackenzie-campinas', 'ATHLETE'::org_role, 62, 'SG'::basketball_position, 'Eduardo Barbosa', 'eduardo.barbosa@quadra.test'),
    ('mackenzie-campinas', 'ATHLETE'::org_role, 63, 'SF'::basketball_position, 'Augusto Coelho', 'augusto.coelho@quadra.test'),
    ('mackenzie-campinas', 'ATHLETE'::org_role, 64, 'PF'::basketball_position, 'Antônio Fonseca', 'antonio.fonseca@quadra.test'),
    ('mackenzie-campinas', 'ATHLETE'::org_role, 65, 'C'::basketball_position, 'Felipe Abreu', 'felipe.abreu@quadra.test'),
    ('mackenzie-campinas', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Diego Araújo', 'diego.araujo@quadra.test'),
    ('mackenzie-campinas', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Otávio Castro', 'otavio.castro@quadra.test'),
    ('usp', 'ATHLETE'::org_role, 4, 'SG'::basketball_position, 'João Ribeiro', 'joao.ribeiro@quadra.test'),
    ('usp', 'ATHLETE'::org_role, 5, 'SF'::basketball_position, 'Bernardo Moraes', 'bernardo.moraes@quadra.test'),
    ('usp', 'ATHLETE'::org_role, 6, 'PF'::basketball_position, 'Mateus Rezende', 'mateus.rezende@quadra.test'),
    ('usp', 'ATHLETE'::org_role, 7, 'C'::basketball_position, 'Gabriel Lacerda', 'gabriel.lacerda@quadra.test'),
    ('usp', 'ATHLETE'::org_role, 8, 'PG'::basketball_position, 'Murilo Ferreira', 'murilo.ferreira@quadra.test'),
    ('usp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Fernando Freitas', 'fernando.freitas@quadra.test'),
    ('usp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'César Machado', 'cesar.machado@quadra.test'),
    ('mackenzie', 'ATHLETE'::org_role, 9, 'SF'::basketball_position, 'Marcelo Castro', 'marcelo.castro@quadra.test'),
    ('mackenzie', 'ATHLETE'::org_role, 10, 'PF'::basketball_position, 'Heitor Ramos', 'heitor.ramos@quadra.test'),
    ('mackenzie', 'ATHLETE'::org_role, 11, 'C'::basketball_position, 'Francisco Figueiredo', 'francisco.figueiredo@quadra.test'),
    ('mackenzie', 'ATHLETE'::org_role, 12, 'PG'::basketball_position, 'Caio Godoy', 'caio.godoy@quadra.test'),
    ('mackenzie', 'ATHLETE'::org_role, 13, 'SG'::basketball_position, 'Rodrigo Rocha', 'rodrigo.rocha@quadra.test'),
    ('mackenzie', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Davi Azevedo', 'davi.azevedo@quadra.test'),
    ('mackenzie', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Alan Macedo', 'alan.macedo@quadra.test'),
    ('puc-sp', 'ATHLETE'::org_role, 14, 'PF'::basketball_position, 'Victor Machado', 'victor.machado@quadra.test'),
    ('puc-sp', 'ATHLETE'::org_role, 15, 'C'::basketball_position, 'Paulo Dantas', 'paulo.dantas@quadra.test'),
    ('puc-sp', 'ATHLETE'::org_role, 21, 'PG'::basketball_position, 'Matheus Miranda', 'matheus.miranda@quadra.test'),
    ('puc-sp', 'ATHLETE'::org_role, 22, 'SG'::basketball_position, 'Henrique Lima', 'henrique.lima@quadra.test'),
    ('puc-sp', 'ATHLETE'::org_role, 23, 'SF'::basketball_position, 'Renato Moreira', 'renato.moreira@quadra.test'),
    ('puc-sp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Wesley Pinto', 'wesley.pinto@quadra.test'),
    ('puc-sp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Pedro Queiroz', 'pedro.queiroz@quadra.test'),
    ('espm', 'ATHLETE'::org_role, 24, 'C'::basketball_position, 'Otávio Macedo', 'otavio.macedo@quadra.test'),
    ('espm', 'ATHLETE'::org_role, 25, 'PG'::basketball_position, 'Raul Xavier', 'raul.xavier@quadra.test'),
    ('espm', 'ATHLETE'::org_role, 30, 'SG'::basketball_position, 'Leonardo Souza', 'leonardo.souza@quadra.test'),
    ('espm', 'ATHLETE'::org_role, 31, 'SF'::basketball_position, 'Samuel Barros', 'samuel.barros@quadra.test'),
    ('espm', 'ATHLETE'::org_role, 32, 'PF'::basketball_position, 'Enzo Vieira', 'enzo.vieira@quadra.test'),
    ('espm', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Fábio Amaral', 'fabio.amaral@quadra.test'),
    ('espm', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'André Porto', 'andre.porto@quadra.test'),
    ('insper', 'ATHLETE'::org_role, 33, 'PG'::basketball_position, 'César Queiroz', 'cesar.queiroz@quadra.test'),
    ('insper', 'ATHLETE'::org_role, 34, 'SG'::basketball_position, 'Rafael Marinho', 'rafael.marinho@quadra.test'),
    ('insper', 'ATHLETE'::org_role, 35, 'SF'::basketball_position, 'Gustavo Martins', 'gustavo.martins@quadra.test'),
    ('insper', 'ATHLETE'::org_role, 40, 'PF'::basketball_position, 'Ricardo Nogueira', 'ricardo.nogueira@quadra.test'),
    ('insper', 'ATHLETE'::org_role, 41, 'C'::basketball_position, 'Vitor Neves', 'vitor.neves@quadra.test'),
    ('insper', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Guilherme Prado', 'guilherme.prado@quadra.test'),
    ('insper', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Eduardo Oliveira', 'eduardo.oliveira@quadra.test'),
    ('fmu', 'ATHLETE'::org_role, 42, 'SG'::basketball_position, 'Alan Porto', 'alan.porto@quadra.test'),
    ('fmu', 'ATHLETE'::org_role, 44, 'SF'::basketball_position, 'Thiago Nascimento', 'thiago.nascimento@quadra.test'),
    ('fmu', 'ATHLETE'::org_role, 45, 'PF'::basketball_position, 'Nicolas Teixeira', 'nicolas.teixeira@quadra.test'),
    ('fmu', 'ATHLETE'::org_role, 50, 'C'::basketball_position, 'Igor Lopes', 'igor.lopes@quadra.test'),
    ('fmu', 'ATHLETE'::org_role, 51, 'PG'::basketball_position, 'Douglas Medeiros', 'douglas.medeiros@quadra.test'),
    ('fmu', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'João Junqueira', 'joao.junqueira@quadra.test'),
    ('fmu', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Bernardo Gomes', 'bernardo.gomes@quadra.test'),
    ('fgv', 'ATHLETE'::org_role, 52, 'SF'::basketball_position, 'Pedro Oliveira', 'pedro.oliveira@quadra.test'),
    ('fgv', 'ATHLETE'::org_role, 53, 'PF'::basketball_position, 'Daniel Mendes', 'daniel.mendes@quadra.test'),
    ('fgv', 'ATHLETE'::org_role, 54, 'C'::basketball_position, 'Alexandre Andrade', 'alexandre.andrade@quadra.test'),
    ('fgv', 'ATHLETE'::org_role, 55, 'PG'::basketball_position, 'Maurício Siqueira', 'mauricio.siqueira@quadra.test'),
    ('fgv', 'ATHLETE'::org_role, 60, 'SG'::basketball_position, 'Bruno Viana', 'bruno.viana@quadra.test'),
    ('fgv', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Marcelo Almeida', 'marcelo.almeida@quadra.test'),
    ('fgv', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Heitor Correia', 'heitor.correia@quadra.test'),
    ('unisantanna', 'ATHLETE'::org_role, 61, 'PF'::basketball_position, 'André Gomes', 'andre.gomes@quadra.test'),
    ('unisantanna', 'ATHLETE'::org_role, 62, 'C'::basketball_position, 'Arthur Campos', 'arthur.campos@quadra.test'),
    ('unisantanna', 'ATHLETE'::org_role, 63, 'PG'::basketball_position, 'Leandro Borges', 'leandro.borges@quadra.test'),
    ('unisantanna', 'ATHLETE'::org_role, 64, 'SG'::basketball_position, 'Lucas Assis', 'lucas.assis@quadra.test'),
    ('unisantanna', 'ATHLETE'::org_role, 65, 'SF'::basketball_position, 'Vinícius Santos', 'vinicius.santos@quadra.test'),
    ('unisantanna', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Victor Monteiro', 'victor.monteiro@quadra.test'),
    ('unisantanna', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Paulo Farias', 'paulo.farias@quadra.test'),
    ('leu', 'ATHLETE'::org_role, 4, 'C'::basketball_position, 'Eduardo Correia', 'eduardo.correia@quadra.test'),
    ('leu', 'ATHLETE'::org_role, 5, 'PG'::basketball_position, 'Augusto Cunha', 'augusto.cunha@quadra.test'),
    ('leu', 'ATHLETE'::org_role, 6, 'SG'::basketball_position, 'Antônio Brito', 'antonio.brito@quadra.test'),
    ('leu', 'ATHLETE'::org_role, 7, 'SF'::basketball_position, 'Felipe Navarro', 'felipe.navarro@quadra.test'),
    ('leu', 'ATHLETE'::org_role, 8, 'PF'::basketball_position, 'Diego Carvalho', 'diego.carvalho@quadra.test'),
    ('leu', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Otávio Cavalcanti', 'otavio.cavalcanti@quadra.test'),
    ('leu', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Raul Pires', 'raul.pires@quadra.test'),
    ('engenharia-mackenzie', 'ATHLETE'::org_role, 9, 'PG'::basketball_position, 'Bernardo Farias', 'bernardo.farias@quadra.test'),
    ('engenharia-mackenzie', 'ATHLETE'::org_role, 10, 'SG'::basketball_position, 'Mateus Peixoto', 'mateus.peixoto@quadra.test'),
    ('engenharia-mackenzie', 'ATHLETE'::org_role, 11, 'SF'::basketball_position, 'Gabriel Aguiar', 'gabriel.aguiar@quadra.test'),
    ('engenharia-mackenzie', 'ATHLETE'::org_role, 12, 'PF'::basketball_position, 'Murilo Rodrigues', 'murilo.rodrigues@quadra.test'),
    ('engenharia-mackenzie', 'ATHLETE'::org_role, 13, 'C'::basketball_position, 'Fernando Cardoso', 'fernando.cardoso@quadra.test'),
    ('engenharia-mackenzie', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'César Reis', 'cesar.reis@quadra.test'),
    ('engenharia-mackenzie', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Rafael Paiva', 'rafael.paiva@quadra.test'),
    ('eefe-usp', 'ATHLETE'::org_role, 14, 'SG'::basketball_position, 'Heitor Pires', 'heitor.pires@quadra.test'),
    ('eefe-usp', 'ATHLETE'::org_role, 15, 'SF'::basketball_position, 'Francisco Bastos', 'francisco.bastos@quadra.test'),
    ('eefe-usp', 'ATHLETE'::org_role, 21, 'PF'::basketball_position, 'Caio Silva', 'caio.silva@quadra.test'),
    ('eefe-usp', 'ATHLETE'::org_role, 22, 'C'::basketball_position, 'Rodrigo Alves', 'rodrigo.alves@quadra.test'),
    ('eefe-usp', 'ATHLETE'::org_role, 23, 'PG'::basketball_position, 'Davi Duarte', 'davi.duarte@quadra.test'),
    ('eefe-usp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Alan Guimarães', 'alan.guimaraes@quadra.test'),
    ('eefe-usp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Thiago Maia', 'thiago.maia@quadra.test'),
    ('fea-usp', 'ATHLETE'::org_role, 24, 'SF'::basketball_position, 'Paulo Paiva', 'paulo.paiva@quadra.test'),
    ('fea-usp', 'ATHLETE'::org_role, 25, 'PF'::basketball_position, 'Matheus Galvão', 'matheus.galvao@quadra.test'),
    ('fea-usp', 'ATHLETE'::org_role, 30, 'C'::basketball_position, 'Henrique Fernandes', 'henrique.fernandes@quadra.test'),
    ('fea-usp', 'ATHLETE'::org_role, 31, 'PG'::basketball_position, 'Renato Moura', 'renato.moura@quadra.test'),
    ('fea-usp', 'ATHLETE'::org_role, 32, 'SG'::basketball_position, 'Wesley Tavares', 'wesley.tavares@quadra.test'),
    ('fea-usp', 'COACHING_STAFF'::org_role, NULL, NULL::basketball_position, 'Pedro Sales', 'pedro.sales@quadra.test'),
    ('fea-usp', 'TEAM_ADMIN'::org_role, NULL, NULL::basketball_position, 'Daniel Arruda', 'daniel.arruda@quadra.test');

-- guard: roster data shape (196, unique, 5+1+1 per team)
DO $$
DECLARE
  v_total INTEGER;
  v_distinct_emails INTEGER;
  v_distinct_names INTEGER;
  v_bad_team_shape INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM tmp_roster;
  IF v_total <> 196 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 196 pessoas na massa de dados, encontradas %.', v_total;
  END IF;

  SELECT count(DISTINCT email) INTO v_distinct_emails FROM tmp_roster;
  IF v_distinct_emails <> 196 THEN
    RAISE EXCEPTION 'Seed abortado: e-mails duplicados na massa de dados (esperados 196 distintos, encontrados %).', v_distinct_emails;
  END IF;

  SELECT count(DISTINCT name) INTO v_distinct_names FROM tmp_roster;
  IF v_distinct_names <> 196 THEN
    RAISE EXCEPTION 'Seed abortado: nomes completos duplicados na massa de dados (esperados 196 distintos, encontrados %).', v_distinct_names;
  END IF;

  SELECT count(*) INTO v_bad_team_shape FROM (
    SELECT team_slug,
      count(*) FILTER (WHERE org_role = 'ATHLETE'::org_role) AS athletes,
      count(*) FILTER (WHERE org_role = 'COACHING_STAFF'::org_role) AS staff,
      count(*) FILTER (WHERE org_role = 'TEAM_ADMIN'::org_role) AS admins,
      count(DISTINCT jersey_number) FILTER (WHERE org_role = 'ATHLETE'::org_role) AS distinct_jerseys,
      count(DISTINCT position) FILTER (WHERE org_role = 'ATHLETE'::org_role) AS distinct_positions
    FROM tmp_roster
    GROUP BY team_slug
  ) shape
  WHERE athletes <> 5 OR staff <> 1 OR admins <> 1 OR distinct_jerseys <> 5 OR distinct_positions <> 5;
  IF v_bad_team_shape > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % equipe(s) sem exatamente 5 ATHLETE (com 5 jersey numbers e 5 posições distintas), 1 COACHING_STAFF e 1 TEAM_ADMIN.', v_bad_team_shape;
  END IF;
END $$;

-- guard: no existing email with divergent name
DO $$
DECLARE
  v_mismatch_count INTEGER;
BEGIN
  SELECT count(*) INTO v_mismatch_count
  FROM tmp_roster r
  JOIN users u ON u.email = r.email AND u.is_deleted = false
  WHERE u.name <> r.name;
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'Seed abortado: % usuário(s) já existem com e-mail desta massa mas nome divergente do esperado. Estado incompatível não corrigido silenciosamente.', v_mismatch_count;
  END IF;
END $$;

-- users (196)
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT r.email, r.name, '$2b$10$sxHgwSH8868STsEMCjOQ3eErWnMRKMXYl4rvjzunWNXr2Dv28vNrK', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM tmp_roster r
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = r.email AND u.is_deleted = false);

-- affiliations (217)
INSERT INTO organization_user_affiliations
  (user_id, organization_id, role, team_id, jersey_number, position, status, created_by_user_id, is_deleted, created_at, updated_at)
SELECT u.id, o.id, r.org_role, t.id, r.jersey_number, r.position, 'ACTIVE'::affiliation_status, admin.id, false, NOW(), NOW()
FROM tmp_roster r
JOIN users u ON u.email = r.email AND u.is_deleted = false
JOIN teams t ON t.slug = r.team_slug AND t.is_deleted = false
JOIN (VALUES
    ('liga-das-atleticas-da-puccamp', 'lep'),
    ('liga-das-atleticas-da-puccamp', 'faceca'),
    ('liga-das-atleticas-da-puccamp', 'direito-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'comunica-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'fisio-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'psico-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'fau-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'med-vet-puccamp'),
    ('federacao-universitaria-paulista-de-esportes', 'puccamp'),
    ('federacao-universitaria-paulista-de-esportes', 'unicamp'),
    ('federacao-universitaria-paulista-de-esportes', 'ufscar'),
    ('federacao-universitaria-paulista-de-esportes', 'unesp-rio-claro'),
    ('federacao-universitaria-paulista-de-esportes', 'anhanguera'),
    ('federacao-universitaria-paulista-de-esportes', 'caaso'),
    ('federacao-universitaria-paulista-de-esportes', 'esalq'),
    ('federacao-universitaria-paulista-de-esportes', 'mackenzie-campinas'),
    ('federacao-universitaria-paulista-de-esportes', 'usp'),
    ('federacao-universitaria-paulista-de-esportes', 'mackenzie'),
    ('federacao-universitaria-paulista-de-esportes', 'puc-sp'),
    ('federacao-universitaria-paulista-de-esportes', 'espm'),
    ('federacao-universitaria-paulista-de-esportes', 'insper'),
    ('federacao-universitaria-paulista-de-esportes', 'fmu'),
    ('federacao-universitaria-paulista-de-esportes', 'fgv'),
    ('federacao-universitaria-paulista-de-esportes', 'unisantanna'),
    ('federacao-universitaria-paulista-de-esportes', 'lep'),
    ('federacao-universitaria-paulista-de-esportes', 'leu'),
    ('federacao-universitaria-paulista-de-esportes', 'engenharia-mackenzie'),
    ('federacao-universitaria-paulista-de-esportes', 'direito-puccamp'),
    ('federacao-universitaria-paulista-de-esportes', 'eefe-usp'),
    ('federacao-universitaria-paulista-de-esportes', 'fea-usp'),
    ('federacao-universitaria-paulista-de-esportes', 'faceca')
) AS m(org_slug, team_slug) ON m.team_slug = r.team_slug
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
CROSS JOIN users admin
WHERE admin.email = 'matheusecke@gmail.com' AND admin.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM organization_user_affiliations oua
  WHERE oua.user_id = u.id AND oua.organization_id = o.id
    AND oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status
);

-- guard: final counts (196 users, 56 LAP, 161 FUPE)
DO $$
DECLARE
  v_user_count INTEGER;
  v_lap_count INTEGER;
  v_fupe_count INTEGER;
  v_total_count INTEGER;
BEGIN
  SELECT count(*) INTO v_user_count FROM users
  WHERE email LIKE '%@quadra.test' AND is_deleted = false;
  IF v_user_count <> 196 THEN
    RAISE EXCEPTION 'Seed abortado: esperados 196 usuários @quadra.test ao final, encontrados %.', v_user_count;
  END IF;

  SELECT count(*) INTO v_lap_count FROM organization_user_affiliations oua
  JOIN organizations o ON o.id = oua.organization_id AND o.slug = 'liga-das-atleticas-da-puccamp'
  JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
  WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status;
  IF v_lap_count <> 56 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 56 afiliações ativas LAP entre os usuários @quadra.test, encontradas %.', v_lap_count;
  END IF;

  SELECT count(*) INTO v_fupe_count FROM organization_user_affiliations oua
  JOIN organizations o ON o.id = oua.organization_id AND o.slug = 'federacao-universitaria-paulista-de-esportes'
  JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
  WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status;
  IF v_fupe_count <> 161 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 161 afiliações ativas FUPE entre os usuários @quadra.test, encontradas %.', v_fupe_count;
  END IF;

  v_total_count := v_lap_count + v_fupe_count;
  IF v_total_count <> 217 THEN
    RAISE EXCEPTION 'Seed abortado: esperadas 217 afiliações ativas no total entre os usuários @quadra.test, encontradas %.', v_total_count;
  END IF;
END $$;


-- ============================== etapa 7: elencos de campeonato ==============================

-- guard: tournaments and registrations (8/8/16/8) exist
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

-- guard: each registration has 5 ATHLETE + 1 STAFF + 1 ADMIN
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

-- guard: no athlete/staff in two teams same org
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

-- guard: no unexpected existing rosters
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

-- tournament rosters (240)
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

-- guard: final counts and integrity
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


-- ============================== etapa 8: elencos de partida ==============================

-- guard: matches and match_teams exist
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

-- guard: match_teams resolve active tournament_teams
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

-- guard: each tournament_team has 5 active athletes
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

-- guard: no athlete on both sides of a match
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

-- guard: no unexpected existing match rosters
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

-- match rosters (600)
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

-- guard: final counts and integrity
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


-- ============================== etapa 9: estatísticas de partida ==============================

-- guard: match rosters shape (600, 10/match, 5/team)
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

-- guard: every match roster resolves a position
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

-- guard: no tied or null-score matches
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

-- guard: no partial existing statistics
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

-- point-distribution patterns
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

-- position profiles
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

-- player statistics (600)
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

-- guard: final counts and integrity
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


-- ============================== validação final ==============================

-- counts: orgs, seasons, tournaments, teams, org-team affiliations, registrations, groups
DO $$
DECLARE
  v_orgs INTEGER; v_seasons INTEGER; v_tournaments INTEGER; v_teams INTEGER;
  v_org_team_aff INTEGER; v_tournament_teams INTEGER; v_groups INTEGER; v_group_teams INTEGER;
BEGIN
  SELECT count(*) INTO v_orgs FROM organizations WHERE is_deleted = false;
  SELECT count(*) INTO v_seasons FROM seasons WHERE is_deleted = false;
  SELECT count(*) INTO v_tournaments FROM tournaments WHERE is_deleted = false;
  SELECT count(*) INTO v_teams FROM teams WHERE is_deleted = false;
  SELECT count(*) INTO v_org_team_aff FROM organization_team_affiliations WHERE is_deleted = false;
  SELECT count(*) INTO v_tournament_teams FROM tournament_teams WHERE is_deleted = false AND status = 'ACTIVE'::tournament_team_status;
  SELECT count(*) INTO v_groups FROM tournament_groups WHERE is_deleted = false;
  SELECT count(*) INTO v_group_teams FROM tournament_group_teams WHERE is_deleted = false;

  IF v_orgs <> 2 THEN RAISE EXCEPTION 'Validação final: esperadas 2 organizações, encontradas %.', v_orgs; END IF;
  IF v_seasons <> 3 THEN RAISE EXCEPTION 'Validação final: esperadas 3 temporadas, encontradas %.', v_seasons; END IF;
  IF v_tournaments <> 4 THEN RAISE EXCEPTION 'Validação final: esperados 4 campeonatos, encontrados %.', v_tournaments; END IF;
  IF v_teams <> 28 THEN RAISE EXCEPTION 'Validação final: esperadas 28 equipes, encontradas %.', v_teams; END IF;
  IF v_org_team_aff <> 31 THEN RAISE EXCEPTION 'Validação final: esperadas 31 afiliações organização-equipe, encontradas %.', v_org_team_aff; END IF;
  IF v_tournament_teams <> 40 THEN RAISE EXCEPTION 'Validação final: esperadas 40 inscrições em campeonato, encontradas %.', v_tournament_teams; END IF;
  IF v_groups <> 6 THEN RAISE EXCEPTION 'Validação final: esperados 6 grupos, encontrados %.', v_groups; END IF;
  IF v_group_teams <> 24 THEN RAISE EXCEPTION 'Validação final: esperadas 24 associações equipe-grupo, encontradas %.', v_group_teams; END IF;
END $$;

-- bracket structure: rounds, slots, all linked to a match with a winner
DO $$
DECLARE
  v_rounds INTEGER; v_slots INTEGER; v_slots_no_match INTEGER; v_slots_no_winner INTEGER;
BEGIN
  SELECT count(*) INTO v_rounds FROM tournament_bracket_rounds WHERE is_deleted = false;
  SELECT count(*) INTO v_slots FROM tournament_bracket_slots WHERE is_deleted = false;
  SELECT count(*) INTO v_slots_no_match FROM tournament_bracket_slots WHERE is_deleted = false AND match_id IS NULL;
  SELECT count(*) INTO v_slots_no_winner FROM tournament_bracket_slots WHERE is_deleted = false AND winner_tournament_team_id IS NULL;

  IF v_rounds <> 11 THEN RAISE EXCEPTION 'Validação final: esperados 11 rounds de mata-mata, encontrados %.', v_rounds; END IF;
  IF v_slots <> 24 THEN RAISE EXCEPTION 'Validação final: esperados 24 slots de bracket, encontrados %.', v_slots; END IF;
  IF v_slots_no_match > 0 THEN RAISE EXCEPTION 'Validação final: % slot(s) de bracket sem partida vinculada.', v_slots_no_match; END IF;
  IF v_slots_no_winner > 0 THEN RAISE EXCEPTION 'Validação final: % slot(s) de bracket sem vencedor definido.', v_slots_no_winner; END IF;
END $$;

-- matches and results: counts, status, period sum vs. placar, empates
DO $$
DECLARE
  v_matches INTEGER; v_not_finished INTEGER; v_match_teams INTEGER; v_periods INTEGER;
  v_period_mismatch INTEGER; v_ties INTEGER;
BEGIN
  SELECT count(*) INTO v_matches FROM matches WHERE is_deleted = false;
  SELECT count(*) INTO v_not_finished FROM matches WHERE is_deleted = false AND status <> 'FINISHED'::match_status;
  SELECT count(*) INTO v_match_teams FROM match_teams WHERE is_deleted = false;
  SELECT count(*) INTO v_periods FROM match_periods WHERE is_deleted = false;

  SELECT count(*) INTO v_period_mismatch
  FROM match_teams mte
  WHERE mte.is_deleted = false
    AND mte.final_score <> (
      SELECT COALESCE(SUM(CASE WHEN mte.side = 'HOME'::match_side THEN mp.home_points ELSE mp.away_points END), 0)
      FROM match_periods mp WHERE mp.match_id = mte.match_id AND mp.is_deleted = false
    );

  SELECT count(*) INTO v_ties
  FROM match_teams h JOIN match_teams a ON a.match_id = h.match_id AND a.side = 'AWAY'::match_side AND a.is_deleted = false
  WHERE h.side = 'HOME'::match_side AND h.is_deleted = false AND h.final_score = a.final_score;

  IF v_matches <> 60 THEN RAISE EXCEPTION 'Validação final: esperadas 60 partidas, encontradas %.', v_matches; END IF;
  IF v_not_finished > 0 THEN RAISE EXCEPTION 'Validação final: % partida(s) não FINISHED.', v_not_finished; END IF;
  IF v_match_teams <> 120 THEN RAISE EXCEPTION 'Validação final: esperados 120 MatchTeam, encontrados %.', v_match_teams; END IF;
  IF v_periods <> 240 THEN RAISE EXCEPTION 'Validação final: esperados 240 MatchPeriod, encontrados %.', v_periods; END IF;
  IF v_period_mismatch > 0 THEN RAISE EXCEPTION 'Validação final: % MatchTeam com soma de períodos divergente do placar.', v_period_mismatch; END IF;
  IF v_ties > 0 THEN RAISE EXCEPTION 'Validação final: % partida(s) empatada(s).', v_ties; END IF;
END $$;

-- campeões e status COMPLETED
DO $$
DECLARE
  v_bad_champion INTEGER;
BEGIN
  SELECT count(*) INTO v_bad_champion
  FROM (VALUES
      ('taca-lap-26-2026', 'direito-puccamp'),
      ('taca-lap-27-2027', 'lep'),
      ('jubs-2026', 'puccamp'),
      ('cpu-2026', 'espm')
  ) AS c(tournament_slug, champion_team_slug)
  JOIN tournaments t ON t.slug = c.tournament_slug AND t.is_deleted = false
  LEFT JOIN tournament_teams champ ON champ.id = t.champion_tournament_team_id
  LEFT JOIN teams champ_te ON champ_te.id = champ.team_id
  WHERE t.status <> 'COMPLETED'::tournament_status
     OR champ_te.slug IS DISTINCT FROM c.champion_team_slug;

  IF v_bad_champion > 0 THEN
    RAISE EXCEPTION 'Validação final: % campeonato(s) com status/campeão divergente do esperado.', v_bad_champion;
  END IF;
END $$;

-- pessoas, elencos e estatísticas
DO $$
DECLARE
  v_users INTEGER; v_lap_aff INTEGER; v_fupe_aff INTEGER; v_rosters INTEGER;
  v_match_rosters INTEGER; v_stats INTEGER; v_points_mismatch INTEGER;
BEGIN
  SELECT count(*) INTO v_users FROM users WHERE email LIKE '%@quadra.test' AND is_deleted = false;

  SELECT count(*) INTO v_lap_aff FROM organization_user_affiliations oua
  JOIN organizations o ON o.id = oua.organization_id AND o.slug = 'liga-das-atleticas-da-puccamp'
  JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
  WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status;

  SELECT count(*) INTO v_fupe_aff FROM organization_user_affiliations oua
  JOIN organizations o ON o.id = oua.organization_id AND o.slug = 'federacao-universitaria-paulista-de-esportes'
  JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
  WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status;

  SELECT count(*) INTO v_rosters FROM tournament_rosters WHERE is_deleted = false AND status = 'ACTIVE'::roster_status;
  SELECT count(*) INTO v_match_rosters FROM match_rosters WHERE is_deleted = false AND status = 'AVAILABLE'::match_roster_status;
  SELECT count(*) INTO v_stats FROM player_match_statistics WHERE is_deleted = false;

  SELECT count(*) INTO v_points_mismatch
  FROM match_teams mte
  WHERE mte.is_deleted = false
    AND mte.final_score <> (
      SELECT COALESCE(SUM(pms.pts), 0) FROM player_match_statistics pms
      WHERE pms.match_team_id = mte.id AND pms.is_deleted = false
    );

  IF v_users <> 196 THEN RAISE EXCEPTION 'Validação final: esperados 196 usuários @quadra.test, encontrados %.', v_users; END IF;
  IF v_lap_aff <> 56 OR v_fupe_aff <> 161 THEN RAISE EXCEPTION 'Validação final: afiliações @quadra.test divergentes (LAP=%, FUPE=%; esperado 56/161).', v_lap_aff, v_fupe_aff; END IF;
  IF v_rosters <> 240 THEN RAISE EXCEPTION 'Validação final: esperados 240 tournament_rosters, encontrados %.', v_rosters; END IF;
  IF v_match_rosters <> 600 THEN RAISE EXCEPTION 'Validação final: esperados 600 match_rosters, encontrados %.', v_match_rosters; END IF;
  IF v_stats <> 600 THEN RAISE EXCEPTION 'Validação final: esperados 600 player_match_statistics, encontrados %.', v_stats; END IF;
  IF v_points_mismatch > 0 THEN RAISE EXCEPTION 'Validação final: % MatchTeam com soma de pontos individuais divergente do placar.', v_points_mismatch; END IF;
END $$;

-- 0 vínculos cross-team/cross-organização
DO $$
DECLARE
  v_roster_leak INTEGER; v_match_roster_leak INTEGER; v_stats_leak INTEGER;
BEGIN
  SELECT count(*) INTO v_roster_leak
  FROM tournament_rosters tr
  JOIN tournament_teams tt ON tt.id = tr.tournament_team_id
  WHERE tr.is_deleted = false
    AND (tr.tournament_id <> tt.tournament_id OR tr.organization_id <> tt.organization_id);

  SELECT count(*) INTO v_match_roster_leak
  FROM match_rosters mr
  JOIN match_teams mte ON mte.id = mr.match_team_id
  JOIN tournament_rosters tr ON tr.id = mr.tournament_roster_id
  JOIN matches m ON m.id = mr.match_id
  WHERE mr.is_deleted = false
    AND (tr.tournament_team_id <> mte.tournament_team_id OR tr.tournament_id <> m.tournament_id OR tr.user_id <> mr.user_id);

  SELECT count(*) INTO v_stats_leak
  FROM player_match_statistics pms
  JOIN match_teams mte ON mte.id = pms.match_team_id
  JOIN tournament_rosters tr ON tr.id = pms.tournament_roster_id
  JOIN matches m ON m.id = pms.match_id
  WHERE pms.is_deleted = false
    AND (tr.tournament_team_id <> mte.tournament_team_id OR tr.tournament_id <> m.tournament_id OR tr.user_id <> pms.user_id);

  IF v_roster_leak > 0 THEN RAISE EXCEPTION 'Validação final: % tournament_roster(s) vinculado(s) a equipe/campeonato errado.', v_roster_leak; END IF;
  IF v_match_roster_leak > 0 THEN RAISE EXCEPTION 'Validação final: % match_roster(s) vinculado(s) a equipe/campeonato errado.', v_match_roster_leak; END IF;
  IF v_stats_leak > 0 THEN RAISE EXCEPTION 'Validação final: % player_match_statistic(s) vinculada(s) a equipe/campeonato errado.', v_stats_leak; END IF;
END $$;

-- usuário administrador preservado
DO $$
DECLARE
  v_admin_id INTEGER; v_status entity_status; v_is_sys_admin BOOLEAN;
  v_admin_affiliations INTEGER; v_total_users INTEGER;
BEGIN
  SELECT id, status, is_system_admin INTO v_admin_id, v_status, v_is_sys_admin
  FROM users WHERE email = 'matheusecke@gmail.com' AND is_deleted = false;

  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Validação final: matheusecke@gmail.com não encontrado após o seed.'; END IF;
  IF v_status <> 'ACTIVE' THEN RAISE EXCEPTION 'Validação final: matheusecke@gmail.com com status % em vez de ACTIVE.', v_status; END IF;
  IF NOT v_is_sys_admin THEN RAISE EXCEPTION 'Validação final: matheusecke@gmail.com deixou de ser SYS_ADMIN.'; END IF;

  SELECT count(*) INTO v_admin_affiliations FROM organization_user_affiliations
  WHERE user_id = v_admin_id AND role = 'ORG_ADMIN'::org_role AND is_deleted = false AND status = 'ACTIVE'::affiliation_status;
  IF v_admin_affiliations <> 2 THEN RAISE EXCEPTION 'Validação final: esperadas 2 afiliações ORG_ADMIN para matheusecke@gmail.com, encontradas %.', v_admin_affiliations; END IF;

  SELECT count(*) INTO v_total_users FROM users WHERE is_deleted = false;
  IF v_total_users <> 197 THEN RAISE EXCEPTION 'Validação final: esperados 197 usuários no total (1 preservado + 196 seed), encontrados %.', v_total_users; END IF;
END $$;

COMMIT;
