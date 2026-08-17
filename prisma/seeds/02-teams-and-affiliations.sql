-- =============================================================================
-- LAP / FUPE — seed principal, etapa 2: equipes globais e afiliações
-- =============================================================================
--
-- Escopo desta etapa: equipes (Team) globais e suas afiliações
-- (OrganizationTeamAffiliation) com as duas organizações já criadas na
-- etapa 1 (01-organizations-context.sql).
--
-- NÃO cria (etapas futuras, um arquivo por etapa nesta mesma pasta):
--   03-tournament-registrations.sql      — inscrições de equipes nos campeonatos
--   04-groups-and-brackets.sql           — grupos e chaveamentos
--   05-matches-and-results.sql           — partidas e resultados
--   06-rosters-and-statistics.sql        — elencos e estatísticas
--
-- Execução (psql, local ou produção; requer 01-organizations-context.sql já aplicado):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/02-teams-and-affiliations.sql
--
-- Idempotente: pode ser executado repetidamente sem duplicar equipes nem
-- afiliações. Cada INSERT usa WHERE NOT EXISTS com o mesmo predicado do
-- índice único parcial que protege a linha (ver docs/DATABASE.md):
--   teams(slug) WHERE is_deleted = false AND status <> 'INACTIVE'
--   organization_team_affiliations(organization_id, team_id) WHERE is_deleted = false
-- Nenhuma dessas chaves tem @unique/@@unique no Prisma, então não há
-- ON CONFLICT possível aqui.
--
-- Ordem obrigatória: TODAS as equipes são resolvidas/criadas primeiro (um
-- único INSERT ... VALUES cobrindo as 28 equipes), e só então TODAS as
-- afiliações (um único INSERT ... VALUES cobrindo as 31 afiliações). Não
-- alternar criação de equipe e afiliação por equipe.
--
-- Modelo: Team é uma identidade global. LEP, FACECA e Direito PUCCAMP
-- existem uma única vez cada e recebem duas afiliações (LAP e FUPE) — não
-- há duplicação de equipe por organização. ESPM aparece uma única vez,
-- afiliada apenas à FUPE (JUBs); o CPU reaproveita essa mesma afiliação em
-- etapa futura, sem nova equipe nem nova afiliação aqui.
--
-- Nomenclatura: nas equipes da LAP com nome de curso genérico (Direito,
-- Comunica, Fisio, Psico, FAU), "PUCCAMP" é anexado ao nome para deixar
-- explícito de qual instituição é o curso — mesmo princípio já usado em
-- Direito PUCCAMP. Cavalo Louco segue a mesma convenção sob o nome real do
-- curso (Med Vet PUCCAMP). PUCCAMP é sempre grafado todo em maiúsculas
-- (nunca "PUCCamp").
--
-- Pré-condição: as duas organizações da etapa 1 já existem. O bloco DO
-- abaixo falha explicitamente (RAISE EXCEPTION, aborta a transação inteira)
-- se qualquer uma delas não existir — nunca cria organização fora da etapa
-- correta.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: as duas organizações da etapa 1 precisam existir.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Equipes globais (28) — todas resolvidas/criadas antes de qualquer afiliação.
-- slug segue TeamsService.create: slugify(name). short_name é escolhido à mão,
-- sempre com exatamente 3 letras (ver roadmap item 10 em docs/roadmap.md —
-- limite ainda não é imposto pelo schema/DTO, mas já é a convenção adotada
-- aqui; não há índice único sobre a coluna).
-- city/state ficam NULL: não há informação real para preencher.
-- ---------------------------------------------------------------------------
INSERT INTO teams (name, short_name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.short_name, v.slug, 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM (VALUES
    -- LAP (8)
    ('LEP', 'LEP', 'lep'),
    ('FACECA', 'FAC', 'faceca'),
    ('Direito PUCCAMP', 'DPU', 'direito-puccamp'),
    ('Comunica PUCCAMP', 'COM', 'comunica-puccamp'),
    ('Fisio PUCCAMP', 'FIS', 'fisio-puccamp'),
    ('Psico PUCCAMP', 'PSI', 'psico-puccamp'),
    ('FAU PUCCAMP', 'FAU', 'fau-puccamp'),
    ('Med Vet PUCCAMP', 'VET', 'med-vet-puccamp'),
    -- FUPE — JUBs (16)
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
    -- FUPE — CPU, equipes novas além das já listadas acima (4)
    ('LEU', 'LEU', 'leu'),
    ('Engenharia Mackenzie', 'EMK', 'engenharia-mackenzie'),
    ('EEFE USP', 'EEF', 'eefe-usp'),
    ('FEA USP', 'FEA', 'fea-usp')
) AS v(name, short_name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM teams t
  WHERE t.slug = v.slug AND t.is_deleted = false AND t.status <> 'INACTIVE'::entity_status
);

-- ---------------------------------------------------------------------------
-- Afiliações organização↔equipe (31) — só depois de todas as equipes acima
-- resolvidas. LEP, FACECA e Direito PUCCAMP aparecem nas duas listas (LAP e
-- FUPE) e resolvem para a mesma equipe global via slug; nenhuma é recriada.
-- ---------------------------------------------------------------------------
INSERT INTO organization_team_affiliations (organization_id, team_id, status, is_deleted, created_at, updated_at)
SELECT o.id, t.id, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    -- LAP (8)
    ('liga-das-atleticas-da-puccamp', 'lep'),
    ('liga-das-atleticas-da-puccamp', 'faceca'),
    ('liga-das-atleticas-da-puccamp', 'direito-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'comunica-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'fisio-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'psico-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'fau-puccamp'),
    ('liga-das-atleticas-da-puccamp', 'med-vet-puccamp'),
    -- FUPE — JUBs (16)
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
    -- FUPE — CPU, equipes adicionais (7; ESPM já coberta acima, não repete)
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

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- SELECT count(*) FROM teams WHERE slug IN (
--   'lep','faceca','direito-puccamp','comunica-puccamp','fisio-puccamp','psico-puccamp',
--   'fau-puccamp','med-vet-puccamp',
--   'puccamp','unicamp','ufscar','unesp-rio-claro','anhanguera','caaso','esalq',
--   'mackenzie-campinas','usp','mackenzie','puc-sp','espm','insper','fmu','fgv',
--   'unisantanna','leu','engenharia-mackenzie','eefe-usp','fea-usp'
-- ) AND is_deleted = false;
--   -- 28
--
-- SELECT count(*) FROM organization_team_affiliations ota
--   JOIN organizations o ON o.id = ota.organization_id
--   WHERE o.slug = 'liga-das-atleticas-da-puccamp' AND ota.is_deleted = false;
--   -- 8
--
-- SELECT count(*) FROM organization_team_affiliations ota
--   JOIN organizations o ON o.id = ota.organization_id
--   WHERE o.slug = 'federacao-universitaria-paulista-de-esportes' AND ota.is_deleted = false;
--   -- 23
--
-- SELECT t.slug, count(*) FROM organization_team_affiliations ota
--   JOIN teams t ON t.id = ota.team_id
--   WHERE t.slug IN ('lep', 'faceca', 'direito-puccamp') AND ota.is_deleted = false
--   GROUP BY t.slug;
--   -- 3 linhas, count = 2 cada (uma afiliação LAP, uma FUPE)
--
-- SELECT count(*) FROM organization_team_affiliations ota
--   JOIN teams t ON t.id = ota.team_id
--   WHERE t.slug = 'espm' AND ota.is_deleted = false;
--   -- 1
--
-- SELECT slug FROM teams WHERE slug IN ('puccamp', 'direito-puccamp') AND is_deleted = false ORDER BY slug;
--   -- 2 linhas distintas (equipes diferentes)
--
-- SELECT slug FROM teams WHERE slug IN ('mackenzie', 'mackenzie-campinas', 'engenharia-mackenzie') AND is_deleted = false ORDER BY slug;
--   -- 3 linhas distintas
--
-- SELECT slug FROM teams WHERE slug IN ('usp', 'eefe-usp', 'fea-usp') AND is_deleted = false ORDER BY slug;
--   -- 3 linhas distintas
--
-- SELECT slug FROM teams WHERE slug IN ('unicamp', 'leu') AND is_deleted = false ORDER BY slug;
--   -- 2 linhas distintas
--
-- SELECT count(*) FROM teams WHERE slug IN (
--   'lep','faceca','direito-puccamp','comunica-puccamp','fisio-puccamp','psico-puccamp',
--   'fau-puccamp','med-vet-puccamp',
--   'puccamp','unicamp','ufscar','unesp-rio-claro','anhanguera','caaso','esalq',
--   'mackenzie-campinas','usp','mackenzie','puc-sp','espm','insper','fmu','fgv',
--   'unisantanna','leu','engenharia-mackenzie','eefe-usp','fea-usp'
-- ) AND is_deleted = false AND status = 'ACTIVE';
--   -- 28 (todas ativas)
--
-- SELECT count(*) FROM organization_team_affiliations WHERE is_deleted = false AND status <> 'ACTIVE';
--   -- 0 entre as afiliações desta etapa (nenhuma PENDING criada)
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem acima.
-- =============================================================================
