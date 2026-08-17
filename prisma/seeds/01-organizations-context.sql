-- =============================================================================
-- LAP / FUPE — seed principal, etapa 1: contexto estrutural
-- =============================================================================
--
-- Escopo desta etapa: organizações, temporadas, categoria de campeonato,
-- campeonatos, e afiliação ORG_ADMIN do usuário administrador existente.
--
-- NÃO cria (etapas futuras, um arquivo por etapa nesta mesma pasta):
--   02-teams-and-affiliations.sql        — equipes e afiliações de equipe
--   03-tournament-registrations.sql      — inscrições de equipes nos campeonatos
--   04-groups-and-brackets.sql           — grupos e chaveamentos
--   05-matches-and-results.sql           — partidas e resultados
--   06-rosters-and-statistics.sql        — elencos e estatísticas
--
-- Execução (psql, local ou produção):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/01-organizations-context.sql
--
-- Idempotente: pode ser executado repetidamente sem duplicar organizações,
-- temporadas, categorias, campeonatos ou a afiliação ORG_ADMIN. Cada INSERT
-- usa WHERE NOT EXISTS com o mesmo predicado do índice único parcial que
-- protege a linha (ver docs/DATABASE.md) — nenhuma dessas chaves tem
-- @unique/@@unique no Prisma, então não há ON CONFLICT possível aqui.
--
-- Pré-condição: o usuário administrador (matheusecke@gmail.com) já existe e
-- já é SYS_ADMIN global. O bloco DO abaixo falha explicitamente (RAISE
-- EXCEPTION, aborta a transação inteira) se o usuário não existir ou se
-- houver qualquer inconsistência com o fato de ele já ser SYS_ADMIN — nunca
-- corrige isso silenciosamente nem cria o usuário.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: usuário administrador precisa existir, ativo, e já SYS_ADMIN.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Organizações
-- ---------------------------------------------------------------------------
INSERT INTO organizations (name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.slug, 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM (VALUES
    ('Liga das Atléticas da PUCCAMP', 'liga-das-atleticas-da-puccamp'),
    ('Federação Universitária Paulista de Esportes', 'federacao-universitaria-paulista-de-esportes')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.slug = v.slug AND o.is_deleted = false);

-- ---------------------------------------------------------------------------
-- Afiliação ORG_ADMIN do usuário existente nas duas organizações
-- (sem equipe vinculada, ativa, sem passar pelo fluxo de convite — mesmo
-- padrão já usado em puc-dev-seed.sql para o admin da organização).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Temporadas (convenção: temporada anual = ano civil, 01/01 a 31/12)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Categoria de campeonato — uma "Universitário Masculino" por organização,
-- reaproveitada por todos os campeonatos daquela organização.
-- ---------------------------------------------------------------------------
INSERT INTO tournament_categories (organization_id, name, slug, status, is_deleted, created_at, updated_at)
SELECT o.id, 'Universitário Masculino', 'universitario-masculino', 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM organizations o
WHERE o.slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes')
  AND o.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM tournament_categories tc
  WHERE tc.organization_id = o.id AND tc.name = 'Universitário Masculino' AND tc.is_deleted = false
);

-- ---------------------------------------------------------------------------
-- Campeonatos — status permanece no default DRAFT (não abrimos inscrição
-- nem declaramos campeão nesta etapa; isso pertence a etapas futuras).
-- Slug replica a convenção de TournamentsService.deriveSlug: slugify(`${name} ${seasonLabel}`).
-- ---------------------------------------------------------------------------
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

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- SELECT name, slug FROM organizations
--   WHERE slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes');
--   -- 2 linhas
--
-- SELECT o.slug, s.label FROM seasons s JOIN organizations o ON o.id = s.organization_id
--   WHERE o.slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes')
--   ORDER BY 1, 2;
--   -- liga-das-atleticas-da-puccamp/2026, liga-das-atleticas-da-puccamp/2027,
--   -- federacao-universitaria-paulista-de-esportes/2026  (3 linhas)
--
-- SELECT o.slug, tc.name FROM tournament_categories tc JOIN organizations o ON o.id = tc.organization_id
--   WHERE o.slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes');
--   -- 2 linhas, "Universitário Masculino" em cada organização
--
-- SELECT o.slug, s.label, t.name, t.format, t.status FROM tournaments t
--   JOIN organizations o ON o.id = t.organization_id JOIN seasons s ON s.id = t.season_id
--   WHERE o.slug IN ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes')
--   ORDER BY 1, 2, 3;
--   -- 4 linhas: Taça LAP 26 (KNOCKOUT/DRAFT), Taça LAP 27 (KNOCKOUT/DRAFT),
--   -- CPU (GROUP_STAGE_KNOCKOUT/DRAFT), JUBs (GROUP_STAGE_KNOCKOUT/DRAFT)
--
-- SELECT o.slug, oua.role, oua.team_id, oua.status FROM organization_user_affiliations oua
--   JOIN organizations o ON o.id = oua.organization_id JOIN users u ON u.id = oua.user_id
--   WHERE u.email = 'matheusecke@gmail.com' AND o.slug IN
--     ('liga-das-atleticas-da-puccamp', 'federacao-universitaria-paulista-de-esportes');
--   -- 2 linhas: role=ORG_ADMIN, team_id=NULL, status=ACTIVE
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem acima.
-- =============================================================================
