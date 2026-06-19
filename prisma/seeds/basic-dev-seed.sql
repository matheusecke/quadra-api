-- DEPRECATED — use cleanup-dev-seed.sql + puc-dev-seed.sql instead.
-- Run in DBeaver. See docs/superpowers/specs/2026-06-15-puc-dev-seed-design.md
--
-- =============================================================================
-- Seed de desenvolvimento — organizações, times e usuários (LEGADO)
-- =============================================================================
--
-- Execução direta no PostgreSQL (ajuste a conexão):
--   psql "$DATABASE_URL" -f prisma/seeds/basic-dev-seed.sql
--
-- Admin existente (id 1, matheusecke@gmail.com) é afiliado a todas as orgs seed.
--
-- Usuários criados por este script:
--   E-mail: seed.user001@quadra.local … seed.user042@quadra.local
--   Senha:  Seed@1234
--
-- Slugs prefixados com seed- para facilitar limpeza (bloco CLEANUP no final).
--
-- Volume:
--   8 organizações | 24 times | 42 usuários seed
--   24 vínculos org↔time | ~95 vínculos org↔usuário (inclui admin em todas as orgs)
-- =============================================================================

BEGIN;

-- Hash bcrypt de "Seed@1234" (cost 10) — usado nos INSERT de users abaixo.
-- Usuários seed podem logar com essa senha para testar fluxos.

-- -----------------------------------------------------------------------------
-- ORGANIZAÇÕES (8)
-- -----------------------------------------------------------------------------
INSERT INTO organizations (name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.slug, v.status::entity_status, false, NOW(), NOW()
FROM (
  VALUES
    ('Liga Paulista de Basquete',       'seed-liga-paulista',      'ACTIVE'),
    ('Associação Carioca de Basquete',  'seed-liga-carioca',       'ACTIVE'),
    ('Liga Mineira de Basquete',        'seed-liga-mineira',       'ACTIVE'),
    ('Campeonato Gaúcho de Basquete',   'seed-liga-gaucha',        'ACTIVE'),
    ('Liga Centro-Oeste',               'seed-liga-centro-oeste',  'ACTIVE'),
    ('Copa Nordeste de Basquete',       'seed-liga-nordeste',      'ACTIVE'),
    ('Liga Nacional Amadora',           'seed-liga-nacional',      'ACTIVE'),
    ('Federação Paranaense de Basquete','seed-liga-paranaense',    'ACTIVE')
) AS v(name, slug, status)
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.slug = v.slug AND o.is_deleted = false
);

-- -----------------------------------------------------------------------------
-- TIMES (24 — 3 por organização seed)
-- -----------------------------------------------------------------------------
INSERT INTO teams (name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.slug, 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM (
  VALUES
    ('Paulistano Alpha',    'seed-team-paulistano-alpha'),
    ('Paulistano Beta',     'seed-team-paulistano-beta'),
    ('Paulistano Gamma',    'seed-team-paulistano-gamma'),
    ('Flamengo Basquete',   'seed-team-flamengo-basquete'),
    ('Niterói United',      'seed-team-niteroi-united'),
    ('Vasco Court',         'seed-team-vasco-court'),
    ('Minas Warriors',      'seed-team-minas-warriors'),
    ('Uberlândia Hoops',    'seed-team-uberlandia-hoops'),
    ('BH City Ball',        'seed-team-bh-city-ball'),
    ('Grêmio Basquete',     'seed-team-gremio-basquete'),
    ('Pelotas Basket',      'seed-team-pelotas-basket'),
    ('Caxias Dunkers',      'seed-team-caxias-dunkers'),
    ('Goiânia Sky',         'seed-team-goiania-sky'),
    ('Cuiabá Heat',         'seed-team-cuiaba-heat'),
    ('Campo Grande Rim',    'seed-team-campo-grande-rim'),
    ('Recife Sharks',       'seed-team-recife-sharks'),
    ('Salvador Storm',      'seed-team-salvador-storm'),
    ('Fortaleza Blaze',     'seed-team-fortaleza-blaze'),
    ('Brasília Caps',       'seed-team-brasilia-caps'),
    ('Manaus Rain',         'seed-team-manaus-rain'),
    ('Belém Raptors',       'seed-team-belem-raptors'),
    ('Cascavel Tigers',     'seed-team-cascavel-tigers'),
    ('Londrina Lions',      'seed-team-londrina-lions'),
    ('Maringá Magic',       'seed-team-maringa-magic')
) AS v(name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM teams t
  WHERE t.slug = v.slug AND t.is_deleted = false
);

-- -----------------------------------------------------------------------------
-- USUÁRIOS SEED (42)
-- -----------------------------------------------------------------------------
INSERT INTO users (
  email,
  name,
  password_hash,
  status,
  is_deleted,
  is_system_admin,
  created_at,
  updated_at
)
SELECT
  lower('seed.user' || lpad(gs::text, 3, '0') || '@quadra.local'),
  'Usuário Seed ' || lpad(gs::text, 3, '0'),
  '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6',
  'ACTIVE'::entity_status,
  false,
  false,
  NOW(),
  NOW()
FROM generate_series(1, 42) AS gs
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.email = lower('seed.user' || lpad(gs::text, 3, '0') || '@quadra.local')
    AND u.is_deleted = false
);

-- -----------------------------------------------------------------------------
-- VÍNCULOS ORG ↔ TIME (24 — ACTIVE)
-- -----------------------------------------------------------------------------
INSERT INTO organization_team_affiliations (
  organization_id,
  team_id,
  status,
  is_deleted,
  created_at,
  updated_at
)
SELECT o.id, t.id, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (
  VALUES
    ('seed-liga-paulista',     'seed-team-paulistano-alpha'),
    ('seed-liga-paulista',     'seed-team-paulistano-beta'),
    ('seed-liga-paulista',     'seed-team-paulistano-gamma'),
    ('seed-liga-carioca',      'seed-team-flamengo-basquete'),
    ('seed-liga-carioca',      'seed-team-niteroi-united'),
    ('seed-liga-carioca',      'seed-team-vasco-court'),
    ('seed-liga-mineira',      'seed-team-minas-warriors'),
    ('seed-liga-mineira',      'seed-team-uberlandia-hoops'),
    ('seed-liga-mineira',      'seed-team-bh-city-ball'),
    ('seed-liga-gaucha',       'seed-team-gremio-basquete'),
    ('seed-liga-gaucha',       'seed-team-pelotas-basket'),
    ('seed-liga-gaucha',       'seed-team-caxias-dunkers'),
    ('seed-liga-centro-oeste', 'seed-team-goiania-sky'),
    ('seed-liga-centro-oeste', 'seed-team-cuiaba-heat'),
    ('seed-liga-centro-oeste', 'seed-team-campo-grande-rim'),
    ('seed-liga-nordeste',     'seed-team-recife-sharks'),
    ('seed-liga-nordeste',     'seed-team-salvador-storm'),
    ('seed-liga-nordeste',     'seed-team-fortaleza-blaze'),
    ('seed-liga-nacional',     'seed-team-brasilia-caps'),
    ('seed-liga-nacional',     'seed-team-manaus-rain'),
    ('seed-liga-nacional',     'seed-team-belem-raptors'),
    ('seed-liga-paranaense',   'seed-team-cascavel-tigers'),
    ('seed-liga-paranaense',   'seed-team-londrina-lions'),
    ('seed-liga-paranaense',   'seed-team-maringa-magic')
) AS m(org_slug, team_slug)
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_team_affiliations ota
  WHERE ota.organization_id = o.id
    AND ota.team_id = t.id
    AND ota.is_deleted = false
);

-- -----------------------------------------------------------------------------
-- ADMIN (users.id = 1, matheusecke@gmail.com) — ORG_ADMIN em todas as orgs seed
-- -----------------------------------------------------------------------------
INSERT INTO organization_user_affiliations (
  user_id,
  organization_id,
  role,
  team_id,
  status,
  is_deleted,
  created_at,
  updated_at
)
SELECT
  u.id,
  o.id,
  'ORG_ADMIN'::org_role,
  NULL,
  'ACTIVE'::affiliation_status,
  false,
  NOW(),
  NOW()
FROM users u
CROSS JOIN organizations o
WHERE u.id = 1
  AND u.is_deleted = false
  AND o.slug LIKE 'seed-%'
  AND o.is_deleted = false
  AND o.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM organization_user_affiliations oua
    WHERE oua.user_id = u.id
      AND oua.organization_id = o.id
      AND oua.is_deleted = false
      AND oua.status = 'ACTIVE'
  );

-- -----------------------------------------------------------------------------
-- USUÁRIOS SEED — afiliações por organização
-- (1 ORG_ADMIN local, staff e atletas por time; alguns PENDING/REJECTED)
-- -----------------------------------------------------------------------------

-- ORG_ADMIN local (um por org, usuários 001–008)
INSERT INTO organization_user_affiliations (
  user_id, organization_id, role, team_id, status, is_deleted, created_at, updated_at
)
SELECT u.id, o.id, 'ORG_ADMIN'::org_role, NULL, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (
  VALUES
    ('seed.user001@quadra.local', 'seed-liga-paulista'),
    ('seed.user002@quadra.local', 'seed-liga-carioca'),
    ('seed.user003@quadra.local', 'seed-liga-mineira'),
    ('seed.user004@quadra.local', 'seed-liga-gaucha'),
    ('seed.user005@quadra.local', 'seed-liga-centro-oeste'),
    ('seed.user006@quadra.local', 'seed-liga-nordeste'),
    ('seed.user007@quadra.local', 'seed-liga-nacional'),
    ('seed.user008@quadra.local', 'seed-liga-paranaense')
) AS m(user_email, org_slug)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM organization_user_affiliations oua
  WHERE oua.user_id = u.id AND oua.organization_id = o.id
    AND oua.is_deleted = false AND oua.status = 'ACTIVE'
);

-- Staff e atletas — mapeamento explícito (usuários 009–042)
INSERT INTO organization_user_affiliations (
  user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at
)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, m.status::affiliation_status, false, NOW(), NOW()
FROM (
  VALUES
    -- Liga Paulista
    ('seed.user009@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-alpha', 'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user010@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-alpha', 'COACHING_STAFF',  NULL, 'ACTIVE'),
    ('seed.user011@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-alpha', 'ATHLETE',         7,    'ACTIVE'),
    ('seed.user012@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-alpha', 'ATHLETE',         23,   'ACTIVE'),
    ('seed.user013@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-beta',  'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user014@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-beta',  'ATHLETE',         11,   'ACTIVE'),
    ('seed.user015@quadra.local',  'seed-liga-paulista', 'seed-team-paulistano-gamma', 'COACHING_STAFF',  NULL, 'PENDING'),
  -- Liga Carioca
    ('seed.user016@quadra.local',  'seed-liga-carioca',  'seed-team-flamengo-basquete','TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user017@quadra.local',  'seed-liga-carioca',  'seed-team-flamengo-basquete','ATHLETE',         3,    'ACTIVE'),
    ('seed.user018@quadra.local',  'seed-liga-carioca',  'seed-team-flamengo-basquete','ATHLETE',         15,   'ACTIVE'),
    ('seed.user019@quadra.local',  'seed-liga-carioca',  'seed-team-niteroi-united',   'COACHING_STAFF',  NULL, 'ACTIVE'),
    ('seed.user020@quadra.local',  'seed-liga-carioca',  'seed-team-niteroi-united',   'ATHLETE',         9,    'REJECTED'),
    ('seed.user021@quadra.local',  'seed-liga-carioca',  'seed-team-vasco-court',      'TEAM_ADMIN',      NULL, 'PENDING'),
  -- Liga Mineira
    ('seed.user022@quadra.local',  'seed-liga-mineira',  'seed-team-minas-warriors',   'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user023@quadra.local',  'seed-liga-mineira',  'seed-team-minas-warriors',   'ATHLETE',         5,    'ACTIVE'),
    ('seed.user024@quadra.local',  'seed-liga-mineira',  'seed-team-uberlandia-hoops', 'COACHING_STAFF',  NULL, 'ACTIVE'),
    ('seed.user025@quadra.local',  'seed-liga-mineira',  'seed-team-uberlandia-hoops', 'ATHLETE',         21,   'ACTIVE'),
    ('seed.user026@quadra.local',  'seed-liga-mineira',  'seed-team-bh-city-ball',     'ATHLETE',         8,    'ACTIVE'),
  -- Liga Gaúcha
    ('seed.user027@quadra.local',  'seed-liga-gaucha',   'seed-team-gremio-basquete',  'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user028@quadra.local',  'seed-liga-gaucha',   'seed-team-gremio-basquete',  'ATHLETE',         12,   'ACTIVE'),
    ('seed.user029@quadra.local',  'seed-liga-gaucha',   'seed-team-pelotas-basket',   'COACHING_STAFF',  NULL, 'ACTIVE'),
    ('seed.user030@quadra.local',  'seed-liga-gaucha',   'seed-team-caxias-dunkers',   'ATHLETE',         4,    'PENDING'),
  -- Centro-Oeste
    ('seed.user031@quadra.local',  'seed-liga-centro-oeste','seed-team-goiania-sky',    'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user032@quadra.local',  'seed-liga-centro-oeste','seed-team-goiania-sky',    'ATHLETE',         10,   'ACTIVE'),
    ('seed.user033@quadra.local',  'seed-liga-centro-oeste','seed-team-cuiaba-heat',    'COACHING_STAFF',  NULL, 'ACTIVE'),
    ('seed.user034@quadra.local',  'seed-liga-centro-oeste','seed-team-campo-grande-rim','ATHLETE',        2,    'ACTIVE'),
  -- Nordeste
    ('seed.user035@quadra.local',  'seed-liga-nordeste', 'seed-team-recife-sharks',    'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user036@quadra.local',  'seed-liga-nordeste', 'seed-team-recife-sharks',    'ATHLETE',         14,   'ACTIVE'),
    ('seed.user037@quadra.local',  'seed-liga-nordeste', 'seed-team-salvador-storm',   'ATHLETE',         6,    'ACTIVE'),
    ('seed.user038@quadra.local',  'seed-liga-nordeste', 'seed-team-fortaleza-blaze',  'COACHING_STAFF',  NULL, 'REJECTED'),
  -- Nacional
    ('seed.user039@quadra.local',  'seed-liga-nacional', 'seed-team-brasilia-caps',    'TEAM_ADMIN',      NULL, 'ACTIVE'),
    ('seed.user040@quadra.local',  'seed-liga-nacional', 'seed-team-manaus-rain',      'ATHLETE',         18,   'ACTIVE'),
    ('seed.user041@quadra.local',  'seed-liga-nacional', 'seed-team-belem-raptors',    'ATHLETE',         1,    'ACTIVE'),
  -- Paranaense
    ('seed.user042@quadra.local',  'seed-liga-paranaense','seed-team-cascavel-tigers', 'COACHING_STAFF',  NULL, 'ACTIVE')
) AS m(user_email, org_slug, team_slug, role, jersey, status)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM organization_user_affiliations oua
  WHERE oua.user_id = u.id
    AND oua.organization_id = o.id
    AND oua.role = m.role::org_role
    AND oua.is_deleted = false
    AND oua.status = m.status::affiliation_status
);

-- Usuários com segunda afiliação (multi-org) para testar listagens
INSERT INTO organization_user_affiliations (
  user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at
)
SELECT u.id, o.id, 'ATHLETE'::org_role, t.id, 99, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (
  VALUES
    ('seed.user011@quadra.local', 'seed-liga-carioca',  'seed-team-flamengo-basquete'),
    ('seed.user017@quadra.local', 'seed-liga-paulista', 'seed-team-paulistano-beta'),
    ('seed.user023@quadra.local', 'seed-liga-nacional', 'seed-team-brasilia-caps'),
    ('seed.user028@quadra.local', 'seed-liga-nordeste', 'seed-team-recife-sharks'),
    ('seed.user032@quadra.local', 'seed-liga-gaucha',   'seed-team-gremio-basquete')
) AS m(user_email, org_slug, team_slug)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM organization_user_affiliations oua
  WHERE oua.user_id = u.id AND oua.organization_id = o.id
    AND oua.is_deleted = false AND oua.status = 'ACTIVE'
);

COMMIT;

-- =============================================================================
-- Resumo esperado após execução bem-sucedida
-- =============================================================================
-- SELECT 'organizations', count(*) FROM organizations WHERE slug LIKE 'seed-%';
-- SELECT 'teams', count(*) FROM teams WHERE slug LIKE 'seed-%';
-- SELECT 'seed users', count(*) FROM users WHERE email LIKE 'seed.user%@quadra.local';
-- SELECT 'admin orgs', count(*) FROM organization_user_affiliations oua
--   JOIN users u ON u.id = oua.user_id
--   JOIN organizations o ON o.id = oua.organization_id
--   WHERE u.id = 1
--     AND o.slug LIKE 'seed-%' AND oua.status = 'ACTIVE' AND oua.is_deleted = false;

-- =============================================================================
-- CLEANUP — descomente e execute em transação separada para remover o seed
-- =============================================================================
-- BEGIN;
-- DELETE FROM organization_user_affiliations
-- WHERE organization_id IN (SELECT id FROM organizations WHERE slug LIKE 'seed-%')
--    OR user_id IN (SELECT id FROM users WHERE email LIKE 'seed.user%@quadra.local');
-- DELETE FROM organization_team_affiliations
-- WHERE organization_id IN (SELECT id FROM organizations WHERE slug LIKE 'seed-%');
-- DELETE FROM users WHERE email LIKE 'seed.user%@quadra.local';
-- DELETE FROM teams WHERE slug LIKE 'seed-%';
-- DELETE FROM organizations WHERE slug LIKE 'seed-%';
-- COMMIT;
