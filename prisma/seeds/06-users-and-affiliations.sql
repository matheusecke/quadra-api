-- =============================================================================
-- LAP / FUPE — seed principal, etapa 6: usuários e afiliações de equipe
-- =============================================================================
--
-- Demo user password: quadra@2026
--
-- Escopo desta etapa: 196 usuários globais novos (7 por equipe global: 5
-- ATHLETE, 1 COACHING_STAFF, 1 TEAM_ADMIN) e 217 OrganizationUserAffiliation
-- (LAP: 56, FUPE: 161) cobrindo as 28 equipes globais e as 31 afiliações
-- organização↔equipe da etapa 2. LEP, FACECA e Direito PUCCAMP são equipes
-- compartilhadas entre LAP e FUPE: os mesmos 7 usuários de cada uma recebem
-- uma afiliação em cada organização — nenhum usuário é duplicado por
-- organização.
--
-- Fora de escopo (não cria): TournamentRoster, MatchRoster,
-- PlayerMatchStatistic, MVP, novas equipes, novas inscrições, novos
-- campeonatos, novas partidas. matheusecke@gmail.com não é tocado nem
-- recriado. Nenhum ORG_ADMIN é criado.
--
-- Execução (psql, local ou produção; requer 01, 02, 03, 04 e 05 já aplicados):
--   psql "$DATABASE_URL" -f prisma/seeds/lap-fupe/06-users-and-affiliations.sql
--
-- Senha: todos os 196 usuários usam a mesma senha de demonstração
-- (quadra@2026), hasheada com bcryptjs cost 10 — mesmo mecanismo usado por
-- AuthService.changePassword e UsersService.create (bcrypt.hash(password, 10),
-- ver src/auth/auth.service.ts e src/users/users.service.ts). O hash abaixo
-- foi gerado uma única vez offline com esse mesmo algoritmo/formato e é
-- reutilizado literalmente (mesmo padrão já usado em
-- prisma/seeds/puc-dev-seed.sql) em todos os INSERTs — nenhuma senha em
-- texto puro é armazenada, e o SQL não hasheia nada em tempo de execução
-- (proibido usar random() aqui).
--
-- Nomes/e-mails: nomes completos únicos globalmente entre os 196 (guarda
-- abaixo), sem primeiro nome repetido dentro da mesma equipe e, nesta massa,
-- também sem sobrenome repetido dentro da mesma equipe. E-mail =
-- nome.sobrenome@quadra.test, minúsculo e sem acento, usando somente o
-- primeiro nome e o sobrenome do nome da pessoa. Nenhuma colisão de e-mail
-- ocorreu nesta massa — a variante numerada incremental (nome.sobrenome2@,
-- nome.sobrenome3@, ...) descrita como fallback não precisou ser aplicada a
-- nenhuma das 196 pessoas.
--
-- Ordem obrigatória: TODOS os 196 usuários são resolvidos/criados primeiro
-- (um único INSERT ... SELECT a partir da tabela temporária abaixo), e só
-- então TODAS as 217 afiliações (um único INSERT ... SELECT). Não alternar
-- criação de usuário e afiliação por pessoa.
--
-- Idempotente: cada INSERT usa WHERE NOT EXISTS com o mesmo predicado do
-- índice único parcial que protege a linha (ver docs/DATABASE.md):
--   users(email) WHERE is_deleted = false AND status <> 'INACTIVE'
--   organization_user_affiliations(user_id, organization_id) WHERE is_deleted = false AND status = 'ACTIVE'
-- Um bloco DO após a massa de dados falha explicitamente (RAISE EXCEPTION,
-- aborta a transação inteira) se algum e-mail desta massa já existir com
-- nome divergente do esperado — nunca corrige um usuário existente
-- incompatível em silêncio.
--
-- Pré-condição: o usuário administrador (matheusecke@gmail.com) já é
-- SYS_ADMIN ativo (etapa 1), e as 28 equipes globais e as 31 afiliações
-- organização↔equipe ativas (LAP 8, FUPE 23; etapa 2) já existem. Os blocos
-- DO abaixo falham explicitamente (RAISE EXCEPTION, aborta a transação
-- inteira) se qualquer uma dessas condições não bater — nunca cria dados
-- pertencentes a etapas anteriores nem corrige silenciosamente um estado
-- incompatível.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: usuário administrador precisa existir, ativo e já SYS_ADMIN; as 28
-- equipes globais e as 31 afiliações organização↔equipe ativas da etapa 2
-- precisam existir.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Massa de dados (196 pessoas) — tabela temporária, existe só durante esta
-- transação. Uma linha por pessoa: a equipe listada é a identidade global da
-- pessoa nesta massa; equipes compartilhadas (LEP, FACECA, Direito PUCCAMP)
-- resolvem as afiliações extras via o mapeamento organização↔equipe usado no
-- INSERT de afiliações abaixo, não via linhas duplicadas aqui.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Guarda: a massa de dados precisa ter exatamente 196 linhas, 196 e-mails
-- distintos, 196 nomes completos distintos, e — por equipe — exatamente 5
-- ATHLETE (jersey numbers e posições, cada um, com 5 valores distintos), 1
-- COACHING_STAFF e 1 TEAM_ADMIN.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Guarda: nenhum e-mail desta massa pode já existir apontando para um nome
-- divergente do esperado — estado incompatível não corrigido silenciosamente.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Usuários (196) — todos resolvidos/criados antes de qualquer afiliação.
-- password_hash é o hash bcryptjs (cost 10) fixo de "quadra@2026", gerado
-- offline com o mesmo mecanismo de AuthService/UsersService (ver cabeçalho).
-- ---------------------------------------------------------------------------
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT r.email, r.name, '$2b$10$sxHgwSH8868STsEMCjOQ3eErWnMRKMXYl4rvjzunWNXr2Dv28vNrK', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM tmp_roster r
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = r.email AND u.is_deleted = false);

-- ---------------------------------------------------------------------------
-- Afiliações (217) — só depois de todos os usuários acima resolvidos. Mesmo
-- mapeamento organização↔equipe (31 pares) usado na etapa 2: LEP, FACECA e
-- Direito PUCCAMP aparecem nas duas listas e produzem, para os mesmos 7
-- usuários de cada uma, uma afiliação ACTIVE em cada organização.
-- created_by_user_id é o administrador da plataforma (matheusecke@gmail.com),
-- mesmo padrão de "criação direta, sem fluxo de convite" já usado na etapa 1
-- para as afiliações ORG_ADMIN.
-- ---------------------------------------------------------------------------
INSERT INTO organization_user_affiliations
  (user_id, organization_id, role, team_id, jersey_number, position, status, created_by_user_id, is_deleted, created_at, updated_at)
SELECT u.id, o.id, r.org_role, t.id, r.jersey_number, r.position, 'ACTIVE'::affiliation_status, admin.id, false, NOW(), NOW()
FROM tmp_roster r
JOIN users u ON u.email = r.email AND u.is_deleted = false
JOIN teams t ON t.slug = r.team_slug AND t.is_deleted = false
JOIN (VALUES
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
) AS m(org_slug, team_slug) ON m.team_slug = r.team_slug
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
CROSS JOIN users admin
WHERE admin.email = 'matheusecke@gmail.com' AND admin.is_deleted = false
AND NOT EXISTS (
  SELECT 1 FROM organization_user_affiliations oua
  WHERE oua.user_id = u.id AND oua.organization_id = o.id
    AND oua.is_deleted = false AND oua.status = 'ACTIVE'::affiliation_status
);

-- ---------------------------------------------------------------------------
-- Guarda final: as contagens totais precisam bater exatamente com o
-- esperado (196 usuários @quadra.test, 56 afiliações LAP, 161 FUPE, 217
-- total) antes do commit.
-- ---------------------------------------------------------------------------
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

COMMIT;

-- =============================================================================
-- Verificação esperada após execução:
--
-- 196 usuários @quadra.test:
-- SELECT count(*) FROM users WHERE email LIKE '%@quadra.test' AND is_deleted = false;
--   -- 196
--
-- Exatamente 7 afiliações por equipe, 5 ATHLETE / 1 COACHING_STAFF / 1 TEAM_ADMIN
-- por equipe (agregado entre LAP e FUPE não duplica pessoa, mas cada equipe
-- soma 7 afiliações por organização em que está afiliada):
-- SELECT t.slug, o.slug, count(*) FILTER (WHERE oua.role = 'ATHLETE') AS athletes,
--     count(*) FILTER (WHERE oua.role = 'COACHING_STAFF') AS staff,
--     count(*) FILTER (WHERE oua.role = 'TEAM_ADMIN') AS admins
--   FROM organization_user_affiliations oua
--   JOIN teams t ON t.id = oua.team_id
--   JOIN organizations o ON o.id = oua.organization_id
--   JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
--   WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'
--   GROUP BY t.slug, o.slug ORDER BY t.slug, o.slug;
--   -- toda linha: athletes=5, staff=1, admins=1
--
-- LAP: 56 afiliações; FUPE: 161 afiliações; total: 217:
-- SELECT o.slug, count(*) FROM organization_user_affiliations oua
--   JOIN organizations o ON o.id = oua.organization_id
--   JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
--   WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'
--   GROUP BY o.slug ORDER BY o.slug;
--   -- federacao-universitaria-paulista-de-esportes: 161, liga-das-atleticas-da-puccamp: 56 (total 217)
--
-- Mesmos 7 usuários de LEP, FACECA e Direito PUCCAMP afiliados às duas
-- organizações (0 linhas = nenhuma pessoa dessas equipes está afiliada a
-- uma organização sem também estar na outra):
-- SELECT t.slug, u.email FROM organization_user_affiliations oua
--   JOIN teams t ON t.id = oua.team_id AND t.slug IN ('lep', 'faceca', 'direito-puccamp')
--   JOIN users u ON u.id = oua.user_id
--   WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'
--   GROUP BY t.slug, u.email HAVING count(DISTINCT oua.organization_id) <> 2;
--   -- 0 linhas
--
-- Nenhum nome completo duplicado entre os usuários @quadra.test:
-- SELECT name, count(*) FROM users WHERE email LIKE '%@quadra.test' AND is_deleted = false
--   GROUP BY name HAVING count(*) > 1;
--   -- 0 linhas
--
-- Nenhum e-mail duplicado (garantido pela unicidade da coluna já verificada
-- acima) e todos seguindo o padrão nome.sobrenome@quadra.test ou variante
-- numerada nome.sobrenome2@quadra.test, ...:
-- SELECT email FROM users
--   WHERE email LIKE '%@quadra.test' AND is_deleted = false
--   AND email !~ '^[a-z]+\.[a-z]+[0-9]*@quadra\.test$';
--   -- 0 linhas
--
-- Nenhum primeiro nome repetido dentro da mesma equipe (0 linhas):
-- SELECT t.slug, split_part(u.name, ' ', 1) AS first_name, count(*)
--   FROM organization_user_affiliations oua
--   JOIN teams t ON t.id = oua.team_id
--   JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
--   WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'
--   GROUP BY t.slug, first_name HAVING count(DISTINCT u.id) > 1;
--   -- 0 linhas
--
-- Jersey numbers distintos e cinco posições distintas por equipe (já
-- verificado em massa de dados pelo bloco DO durante a execução; a query
-- abaixo confere o estado final persistido):
-- SELECT t.slug, count(DISTINCT oua.jersey_number) AS jerseys, count(DISTINCT oua.position) AS positions
--   FROM organization_user_affiliations oua
--   JOIN teams t ON t.id = oua.team_id
--   JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
--   WHERE oua.is_deleted = false AND oua.status = 'ACTIVE' AND oua.role = 'ATHLETE'
--   GROUP BY t.slug;
--   -- toda linha: jerseys=5, positions=5 (uma linha por organização em que a equipe está afiliada)
--
-- Nenhuma afiliação com equipe/papel inconsistente (a CHECK do schema já
-- impede isso, mas a query abaixo deve retornar 0 linhas de qualquer forma):
-- SELECT count(*) FROM organization_user_affiliations oua
--   JOIN users u ON u.id = oua.user_id AND u.email LIKE '%@quadra.test'
--   WHERE oua.is_deleted = false AND oua.status = 'ACTIVE'
--   AND ((oua.role = 'ORG_ADMIN' AND oua.team_id IS NOT NULL)
--     OR (oua.role IN ('TEAM_ADMIN', 'ATHLETE', 'COACHING_STAFF') AND oua.team_id IS NULL));
--   -- 0
--
-- Todos os 196 usuários de seed autenticáveis com quadra@2026 (confirmado
-- offline com bcryptjs.compareSync antes da geração deste arquivo; todos
-- compartilham o mesmo hash literal, então validar um já valida todos):
-- SELECT password_hash FROM users WHERE email = 'lucas.silva@quadra.test' AND is_deleted = false;
--   -- '$2b$10$sxHgwSH8868STsEMCjOQ3eErWnMRKMXYl4rvjzunWNXr2Dv28vNrK'
--
-- Rodar o arquivo inteiro uma segunda vez não deve alterar nenhuma contagem
-- acima (usuários resolvidos por e-mail, afiliações por par
-- user_id/organization_id ACTIVE; nenhuma linha nova é criada).
-- =============================================================================
