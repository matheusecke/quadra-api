-- =============================================================================
-- PUC Campinas Basquete — seed de desenvolvimento
-- =============================================================================
--
-- Execução no DBeaver (ordem obrigatória):
--   1. cleanup-dev-seed.sql   — remove dados antigos, preserva user id=1
--   2. puc-dev-seed.sql       — este arquivo
--   3. Queries de verificação (comentadas no final)
--
-- Senha de todos os usuários demo: Seed@1234
--
-- Volume esperado:
--   1 organização  | 16 times | 160 usuários seed | 161 afiliações (incl. user id=1)
--   16 vínculos org↔time
--
-- Fonte de verdade para slugs/e-mails usados em mockSportsData.ts (tcc-web).
-- =============================================================================

BEGIN;

INSERT INTO organizations (name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.slug, v.status::entity_status, false, NOW(), NOW()
FROM (VALUES ('PUC Campinas Basquete', 'puc-campinas-basquete', 'ACTIVE')) AS v(name, slug, status)
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.slug = v.slug AND o.is_deleted = false);

-- short_name is picked by hand (T01..T16), NOT derived from name: every team is
-- named "Time N", so the migration's name-based backfill would collapse all
-- sixteen into "TIM". No unique index on short_name allows it, but it would be
-- useless on a bracket. Team names and slugs are unchanged — tcc-web's
-- mock-sports-data.ts traces them (Team N = puc-time-N).
INSERT INTO teams (name, short_name, slug, status, is_deleted, created_at, updated_at)
SELECT v.name, v.short_name, v.slug, 'ACTIVE'::entity_status, false, NOW(), NOW()
FROM (VALUES
    ('Time 1', 'T01', 'puc-time-1'),
    ('Time 2', 'T02', 'puc-time-2'),
    ('Time 3', 'T03', 'puc-time-3'),
    ('Time 4', 'T04', 'puc-time-4'),
    ('Time 5', 'T05', 'puc-time-5'),
    ('Time 6', 'T06', 'puc-time-6'),
    ('Time 7', 'T07', 'puc-time-7'),
    ('Time 8', 'T08', 'puc-time-8'),
    ('Time 9', 'T09', 'puc-time-9'),
    ('Time 10', 'T10', 'puc-time-10'),
    ('Time 11', 'T11', 'puc-time-11'),
    ('Time 12', 'T12', 'puc-time-12'),
    ('Time 13', 'T13', 'puc-time-13'),
    ('Time 14', 'T14', 'puc-time-14'),
    ('Time 15', 'T15', 'puc-time-15'),
    ('Time 16', 'T16', 'puc-time-16')
) AS v(name, short_name, slug)
WHERE NOT EXISTS (SELECT 1 FROM teams t WHERE t.slug = v.slug AND t.is_deleted = false);

INSERT INTO organization_team_affiliations (organization_id, team_id, status, is_deleted, created_at, updated_at)
SELECT o.id, t.id, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('puc-campinas-basquete', 'puc-time-1'),
    ('puc-campinas-basquete', 'puc-time-2'),
    ('puc-campinas-basquete', 'puc-time-3'),
    ('puc-campinas-basquete', 'puc-time-4'),
    ('puc-campinas-basquete', 'puc-time-5'),
    ('puc-campinas-basquete', 'puc-time-6'),
    ('puc-campinas-basquete', 'puc-time-7'),
    ('puc-campinas-basquete', 'puc-time-8'),
    ('puc-campinas-basquete', 'puc-time-9'),
    ('puc-campinas-basquete', 'puc-time-10'),
    ('puc-campinas-basquete', 'puc-time-11'),
    ('puc-campinas-basquete', 'puc-time-12'),
    ('puc-campinas-basquete', 'puc-time-13'),
    ('puc-campinas-basquete', 'puc-time-14'),
    ('puc-campinas-basquete', 'puc-time-15'),
    ('puc-campinas-basquete', 'puc-time-16')
) AS m(org_slug, team_slug)
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_team_affiliations ota WHERE ota.organization_id = o.id AND ota.team_id = t.id AND ota.is_deleted = false);


-- Time 1
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('rafael.moura@quadra.com.br', 'Rafael Moura'),
    ('carlos.almeida@quadra.com.br', 'Carlos Almeida'),
    ('bruno.ferreira@quadra.com.br', 'Bruno Ferreira'),
    ('diego.santos@quadra.com.br', 'Diego Santos'),
    ('felipe.oliveira@quadra.com.br', 'Felipe Oliveira'),
    ('gabriel.costa@quadra.com.br', 'Gabriel Costa'),
    ('henrique.lima@quadra.com.br', 'Henrique Lima'),
    ('igor.martins@quadra.com.br', 'Igor Martins'),
    ('joao.pereira@quadra.com.br', 'João Pereira'),
    ('lucas.rodrigues@quadra.com.br', 'Lucas Rodrigues')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 2
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('marcos.silva@quadra.com.br', 'Marcos Silva'),
    ('mateus.souza@quadra.com.br', 'Mateus Souza'),
    ('nicolas.barbosa@quadra.com.br', 'Nicolas Barbosa'),
    ('otavio.ribeiro@quadra.com.br', 'Otávio Ribeiro'),
    ('paulo.carvalho@quadra.com.br', 'Paulo Carvalho'),
    ('pedro.gomes@quadra.com.br', 'Pedro Gomes'),
    ('ricardo.araujo@quadra.com.br', 'Ricardo Araujo'),
    ('roberto.nunes@quadra.com.br', 'Roberto Nunes'),
    ('rodrigo.melo@quadra.com.br', 'Rodrigo Melo'),
    ('samuel.castro@quadra.com.br', 'Samuel Castro')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 3
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('thiago.dias@quadra.com.br', 'Thiago Dias'),
    ('tiago.freitas@quadra.com.br', 'Tiago Freitas'),
    ('vitor.campos@quadra.com.br', 'Vitor Campos'),
    ('wesley.cardoso@quadra.com.br', 'Wesley Cardoso'),
    ('andre.teixeira@quadra.com.br', 'André Teixeira'),
    ('antonio.monteiro@quadra.com.br', 'Antonio Monteiro'),
    ('bernardo.pinto@quadra.com.br', 'Bernardo Pinto'),
    ('caio.moreira@quadra.com.br', 'Caio Moreira'),
    ('cesar.correia@quadra.com.br', 'César Correia'),
    ('daniel.azevedo@quadra.com.br', 'Daniel Azevedo')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 4
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('eduardo.vieira@quadra.com.br', 'Eduardo Vieira'),
    ('enzo.machado@quadra.com.br', 'Enzo Machado'),
    ('fabio.ramos@quadra.com.br', 'Fábio Ramos'),
    ('fernando.lopes@quadra.com.br', 'Fernando Lopes'),
    ('francisco.mendes@quadra.com.br', 'Francisco Mendes'),
    ('giovani.fernandes@quadra.com.br', 'Giovani Fernandes'),
    ('guilherme.batista@quadra.com.br', 'Guilherme Batista'),
    ('gustavo.cavalcanti@quadra.com.br', 'Gustavo Cavalcanti'),
    ('heitor.miranda@quadra.com.br', 'Heitor Miranda'),
    ('hugo.xavier@quadra.com.br', 'Hugo Xavier')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 5
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('ivan.peixoto@quadra.com.br', 'Ivan Peixoto'),
    ('julio.cunha@quadra.com.br', 'Júlio Cunha'),
    ('leandro.rezende@quadra.com.br', 'Leandro Rezende'),
    ('leonardo.barros@quadra.com.br', 'Leonardo Barros'),
    ('luan.farias@quadra.com.br', 'Luan Farias'),
    ('luiz.andrade@quadra.com.br', 'Luiz Andrade'),
    ('marcelo.borges@quadra.com.br', 'Marcelo Borges'),
    ('mauricio.tavares@quadra.com.br', 'Mauricio Tavares'),
    ('murilo.pacheco@quadra.com.br', 'Murilo Pacheco'),
    ('nelson.cruz@quadra.com.br', 'Nelson Cruz')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 6
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('oscar.duarte@quadra.com.br', 'Oscar Duarte'),
    ('patrick.viana@quadra.com.br', 'Patrick Viana'),
    ('rafael.coelho@quadra.com.br', 'Rafael Coelho'),
    ('renato.macedo@quadra.com.br', 'Renato Macedo'),
    ('renan.paiva@quadra.com.br', 'Renan Paiva'),
    ('renato.campos@quadra.com.br', 'Renato Campos'),
    ('ricardo.fonseca@quadra.com.br', 'Ricardo Fonseca'),
    ('robson.freire@quadra.com.br', 'Robson Freire'),
    ('rogerio.santana@quadra.com.br', 'Rogerio Santana'),
    ('ronaldo.matos@quadra.com.br', 'Ronaldo Matos')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 7
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('rubens.neves@quadra.com.br', 'Rubens Neves'),
    ('sandro.lima@quadra.com.br', 'Sandro Lima'),
    ('sergio.moura@quadra.com.br', 'Sergio Moura'),
    ('silvio.brandao@quadra.com.br', 'Silvio Brandao'),
    ('tadeu.prado@quadra.com.br', 'Tadeu Prado'),
    ('tales.guimaraes@quadra.com.br', 'Tales Guimaraes'),
    ('tulio.ramires@quadra.com.br', 'Túlio Ramires'),
    ('valter.sales@quadra.com.br', 'Valter Sales'),
    ('victor.alves@quadra.com.br', 'Victor Alves'),
    ('vinicius.torres@quadra.com.br', 'Vinicius Torres')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 8
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('wagner.pires@quadra.com.br', 'Wagner Pires'),
    ('wallace.braga@quadra.com.br', 'Wallace Braga'),
    ('william.dantas@quadra.com.br', 'William Dantas'),
    ('yuri.leal@quadra.com.br', 'Yuri Leal'),
    ('alex.santos@quadra.com.br', 'Alex Santos'),
    ('alexandre.lemos@quadra.com.br', 'Alexandre Lemos'),
    ('alisson.neto@quadra.com.br', 'Alisson Neto'),
    ('arthur.mota@quadra.com.br', 'Arthur Mota'),
    ('augusto.cesar@quadra.com.br', 'Augusto César'),
    ('benicio.rocha@quadra.com.br', 'Benicio Rocha')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 9
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('breno.vargas@quadra.com.br', 'Breno Vargas'),
    ('caique.nascimento@quadra.com.br', 'Caique Nascimento'),
    ('claudio.barbosa@quadra.com.br', 'Claudio Barbosa'),
    ('cleber.amaral@quadra.com.br', 'Cleber Amaral'),
    ('cristiano.bittencourt@quadra.com.br', 'Cristiano Bittencourt'),
    ('davi.cordeiro@quadra.com.br', 'Davi Cordeiro'),
    ('denis.figueiredo@quadra.com.br', 'Denis Figueiredo'),
    ('douglas.henrique@quadra.com.br', 'Douglas Henrique'),
    ('edson.junqueira@quadra.com.br', 'Edson Junqueira'),
    ('elias.marques@quadra.com.br', 'Elias Marques')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 10
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('emerson.queiroz@quadra.com.br', 'Emerson Queiroz'),
    ('erick.santiago@quadra.com.br', 'Erick Santiago'),
    ('everton.trindade@quadra.com.br', 'Everton Trindade'),
    ('fabiano.uchoa@quadra.com.br', 'Fabiano Uchoa'),
    ('felipe.valente@quadra.com.br', 'Felipe Valente'),
    ('filipe.ximenes@quadra.com.br', 'Filipe Ximenes'),
    ('flavio.zanetti@quadra.com.br', 'Flavio Zanetti'),
    ('frederico.abreu@quadra.com.br', 'Frederico Abreu'),
    ('geovane.aguiar@quadra.com.br', 'Geovane Aguiar'),
    ('gilberto.assis@quadra.com.br', 'Gilberto Assis')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 11
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('giovane.bento@quadra.com.br', 'Giovane Bento'),
    ('gleison.caldeira@quadra.com.br', 'Gleison Caldeira'),
    ('helio.domingues@quadra.com.br', 'Helio Domingues'),
    ('humberto.esteves@quadra.com.br', 'Humberto Esteves'),
    ('isaac.franco@quadra.com.br', 'Isaac Franco'),
    ('italo.garcia@quadra.com.br', 'Italo Garcia'),
    ('jaime.henrique@quadra.com.br', 'Jaime Henrique'),
    ('jefferson.ibrahim@quadra.com.br', 'Jefferson Ibrahim'),
    ('jeferson.jacinto@quadra.com.br', 'Jeferson Jacinto'),
    ('jonas.klein@quadra.com.br', 'Jonas Klein')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 12
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('jorge.lacerda@quadra.com.br', 'Jorge Lacerda'),
    ('jose.magalhaes@quadra.com.br', 'José Magalhaes'),
    ('juliano.nobrega@quadra.com.br', 'Juliano Nobrega'),
    ('junior.ortega@quadra.com.br', 'Junior Ortega'),
    ('kauan.padilha@quadra.com.br', 'Kauan Padilha'),
    ('kelvin.quintana@quadra.com.br', 'Kelvin Quintana'),
    ('kevin.rangel@quadra.com.br', 'Kevin Rangel'),
    ('kleber.siqueira@quadra.com.br', 'Kleber Siqueira'),
    ('laercio.toledo@quadra.com.br', 'Laercio Toledo'),
    ('lauro.umbelino@quadra.com.br', 'Lauro Umbelino')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 13
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('lenilson.vasconcelos@quadra.com.br', 'Lenilson Vasconcelos'),
    ('levi.wanderley@quadra.com.br', 'Levi Wanderley'),
    ('lincoln.xavier@quadra.com.br', 'Lincoln Xavier'),
    ('lorenzo.yamada@quadra.com.br', 'Lorenzo Yamada'),
    ('luciano.zambelli@quadra.com.br', 'Luciano Zambelli'),
    ('luiz.abrahao@quadra.com.br', 'Luiz Abrahao'),
    ('manoel.bastos@quadra.com.br', 'Manoel Bastos'),
    ('marcio.coutinho@quadra.com.br', 'Marcio Coutinho'),
    ('mario.dourado@quadra.com.br', 'Mario Dourado'),
    ('matheus.espindola@quadra.com.br', 'Matheus Espindola')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 14
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('max.furtado@quadra.com.br', 'Max Furtado'),
    ('michel.galvao@quadra.com.br', 'Michel Galvao'),
    ('milton.holanda@quadra.com.br', 'Milton Holanda'),
    ('moises.ito@quadra.com.br', 'Moises Ito'),
    ('natan.jardim@quadra.com.br', 'Natan Jardim'),
    ('nilton.kruger@quadra.com.br', 'Nilton Kruger'),
    ('norberto.lobato@quadra.com.br', 'Norberto Lobato'),
    ('odair.macedo@quadra.com.br', 'Odair Macedo'),
    ('osmar.nogueira@quadra.com.br', 'Osmar Nogueira'),
    ('osvaldo.oliveira@quadra.com.br', 'Osvaldo Oliveira')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 15
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('pablo.pimentel@quadra.com.br', 'Pablo Pimentel'),
    ('paulo.quevedo@quadra.com.br', 'Paulo Quevedo'),
    ('plinio.ribeiro@quadra.com.br', 'Plinio Ribeiro'),
    ('quirino.saldanha@quadra.com.br', 'Quirino Saldanha'),
    ('quintino.teles@quadra.com.br', 'Quintino Teles'),
    ('raimundo.ulhoa@quadra.com.br', 'Raimundo Ulhoa'),
    ('ramiro.valadares@quadra.com.br', 'Ramiro Valadares'),
    ('randolfo.wagner@quadra.com.br', 'Randolfo Wagner'),
    ('reginaldo.xavier@quadra.com.br', 'Reginaldo Xavier'),
    ('reinaldo.yoshida@quadra.com.br', 'Reinaldo Yoshida')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

-- Time 16
INSERT INTO users (email, name, password_hash, status, is_deleted, is_system_admin, created_at, updated_at)
SELECT v.email, v.name, '$2b$10$NRU3Tfkm1eV1y7NTOr4GL.LOnocyPXUfEqB/OxUFm34MH67atIgf6', 'ACTIVE'::entity_status, false, false, NOW(), NOW()
FROM (VALUES
    ('romulo.zilio@quadra.com.br', 'Romulo Zilio'),
    ('rui.alcantara@quadra.com.br', 'Rui Alcantara'),
    ('salvador.barreto@quadra.com.br', 'Salvador Barreto'),
    ('sebastiao.camargo@quadra.com.br', 'Sebastião Camargo'),
    ('sidnei.delfino@quadra.com.br', 'Sidnei Delfino'),
    ('silas.espinoza@quadra.com.br', 'Silas Espinoza'),
    ('simao.fagundes@quadra.com.br', 'Simão Fagundes'),
    ('socrates.goulart@quadra.com.br', 'Socrates Goulart'),
    ('tarcisio.haddad@quadra.com.br', 'Tarcisio Haddad'),
    ('teodoro.inacio@quadra.com.br', 'Teodoro Inacio')
) AS v(email, name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email AND u.is_deleted = false);

INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, 'ORG_ADMIN'::org_role, NULL, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM users u CROSS JOIN organizations o
WHERE u.id = 1 AND u.is_deleted = false AND o.slug = 'puc-campinas-basquete' AND o.is_deleted = false
AND NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.is_deleted = false AND oua.status = 'ACTIVE');


-- Time 1
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('rafael.moura@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 4),
    ('carlos.almeida@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'TEAM_ADMIN', NULL),
    ('bruno.ferreira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'COACHING_STAFF', NULL),
    ('diego.santos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 5),
    ('felipe.oliveira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 6),
    ('gabriel.costa@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 7),
    ('henrique.lima@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 8),
    ('igor.martins@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 9),
    ('joao.pereira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 10),
    ('lucas.rodrigues@quadra.com.br', 'puc-campinas-basquete', 'puc-time-1', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 2
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('marcos.silva@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'TEAM_ADMIN', NULL),
    ('mateus.souza@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'COACHING_STAFF', NULL),
    ('nicolas.barbosa@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 4),
    ('otavio.ribeiro@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 5),
    ('paulo.carvalho@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 6),
    ('pedro.gomes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 7),
    ('ricardo.araujo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 8),
    ('roberto.nunes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 9),
    ('rodrigo.melo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 10),
    ('samuel.castro@quadra.com.br', 'puc-campinas-basquete', 'puc-time-2', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 3
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('thiago.dias@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'TEAM_ADMIN', NULL),
    ('tiago.freitas@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'COACHING_STAFF', NULL),
    ('vitor.campos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 4),
    ('wesley.cardoso@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 5),
    ('andre.teixeira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 6),
    ('antonio.monteiro@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 7),
    ('bernardo.pinto@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 8),
    ('caio.moreira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 9),
    ('cesar.correia@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 10),
    ('daniel.azevedo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-3', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 4
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('eduardo.vieira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'TEAM_ADMIN', NULL),
    ('enzo.machado@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'COACHING_STAFF', NULL),
    ('fabio.ramos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 4),
    ('fernando.lopes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 5),
    ('francisco.mendes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 6),
    ('giovani.fernandes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 7),
    ('guilherme.batista@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 8),
    ('gustavo.cavalcanti@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 9),
    ('heitor.miranda@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 10),
    ('hugo.xavier@quadra.com.br', 'puc-campinas-basquete', 'puc-time-4', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 5
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('ivan.peixoto@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'TEAM_ADMIN', NULL),
    ('julio.cunha@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'COACHING_STAFF', NULL),
    ('leandro.rezende@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 4),
    ('leonardo.barros@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 5),
    ('luan.farias@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 6),
    ('luiz.andrade@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 7),
    ('marcelo.borges@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 8),
    ('mauricio.tavares@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 9),
    ('murilo.pacheco@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 10),
    ('nelson.cruz@quadra.com.br', 'puc-campinas-basquete', 'puc-time-5', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 6
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('oscar.duarte@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'TEAM_ADMIN', NULL),
    ('patrick.viana@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'COACHING_STAFF', NULL),
    ('rafael.coelho@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 4),
    ('renato.macedo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 5),
    ('renan.paiva@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 6),
    ('renato.campos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 7),
    ('ricardo.fonseca@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 8),
    ('robson.freire@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 9),
    ('rogerio.santana@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 10),
    ('ronaldo.matos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-6', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 7
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('rubens.neves@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'TEAM_ADMIN', NULL),
    ('sandro.lima@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'COACHING_STAFF', NULL),
    ('sergio.moura@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 4),
    ('silvio.brandao@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 5),
    ('tadeu.prado@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 6),
    ('tales.guimaraes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 7),
    ('tulio.ramires@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 8),
    ('valter.sales@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 9),
    ('victor.alves@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 10),
    ('vinicius.torres@quadra.com.br', 'puc-campinas-basquete', 'puc-time-7', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 8
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('wagner.pires@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'TEAM_ADMIN', NULL),
    ('wallace.braga@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'COACHING_STAFF', NULL),
    ('william.dantas@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 4),
    ('yuri.leal@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 5),
    ('alex.santos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 6),
    ('alexandre.lemos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 7),
    ('alisson.neto@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 8),
    ('arthur.mota@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 9),
    ('augusto.cesar@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 10),
    ('benicio.rocha@quadra.com.br', 'puc-campinas-basquete', 'puc-time-8', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 9
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('breno.vargas@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'TEAM_ADMIN', NULL),
    ('caique.nascimento@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'COACHING_STAFF', NULL),
    ('claudio.barbosa@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 4),
    ('cleber.amaral@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 5),
    ('cristiano.bittencourt@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 6),
    ('davi.cordeiro@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 7),
    ('denis.figueiredo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 8),
    ('douglas.henrique@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 9),
    ('edson.junqueira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 10),
    ('elias.marques@quadra.com.br', 'puc-campinas-basquete', 'puc-time-9', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 10
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('emerson.queiroz@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'TEAM_ADMIN', NULL),
    ('erick.santiago@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'COACHING_STAFF', NULL),
    ('everton.trindade@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 4),
    ('fabiano.uchoa@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 5),
    ('felipe.valente@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 6),
    ('filipe.ximenes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 7),
    ('flavio.zanetti@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 8),
    ('frederico.abreu@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 9),
    ('geovane.aguiar@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 10),
    ('gilberto.assis@quadra.com.br', 'puc-campinas-basquete', 'puc-time-10', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 11
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('giovane.bento@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'TEAM_ADMIN', NULL),
    ('gleison.caldeira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'COACHING_STAFF', NULL),
    ('helio.domingues@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 4),
    ('humberto.esteves@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 5),
    ('isaac.franco@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 6),
    ('italo.garcia@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 7),
    ('jaime.henrique@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 8),
    ('jefferson.ibrahim@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 9),
    ('jeferson.jacinto@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 10),
    ('jonas.klein@quadra.com.br', 'puc-campinas-basquete', 'puc-time-11', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 12
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('jorge.lacerda@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'TEAM_ADMIN', NULL),
    ('jose.magalhaes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'COACHING_STAFF', NULL),
    ('juliano.nobrega@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 4),
    ('junior.ortega@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 5),
    ('kauan.padilha@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 6),
    ('kelvin.quintana@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 7),
    ('kevin.rangel@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 8),
    ('kleber.siqueira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 9),
    ('laercio.toledo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 10),
    ('lauro.umbelino@quadra.com.br', 'puc-campinas-basquete', 'puc-time-12', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 13
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('lenilson.vasconcelos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'TEAM_ADMIN', NULL),
    ('levi.wanderley@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'COACHING_STAFF', NULL),
    ('lincoln.xavier@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 4),
    ('lorenzo.yamada@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 5),
    ('luciano.zambelli@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 6),
    ('luiz.abrahao@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 7),
    ('manoel.bastos@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 8),
    ('marcio.coutinho@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 9),
    ('mario.dourado@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 10),
    ('matheus.espindola@quadra.com.br', 'puc-campinas-basquete', 'puc-time-13', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 14
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('max.furtado@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'TEAM_ADMIN', NULL),
    ('michel.galvao@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'COACHING_STAFF', NULL),
    ('milton.holanda@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 4),
    ('moises.ito@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 5),
    ('natan.jardim@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 6),
    ('nilton.kruger@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 7),
    ('norberto.lobato@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 8),
    ('odair.macedo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 9),
    ('osmar.nogueira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 10),
    ('osvaldo.oliveira@quadra.com.br', 'puc-campinas-basquete', 'puc-time-14', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 15
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('pablo.pimentel@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'TEAM_ADMIN', NULL),
    ('paulo.quevedo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'COACHING_STAFF', NULL),
    ('plinio.ribeiro@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 4),
    ('quirino.saldanha@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 5),
    ('quintino.teles@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 6),
    ('raimundo.ulhoa@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 7),
    ('ramiro.valadares@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 8),
    ('randolfo.wagner@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 9),
    ('reginaldo.xavier@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 10),
    ('reinaldo.yoshida@quadra.com.br', 'puc-campinas-basquete', 'puc-time-15', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

-- Time 16
INSERT INTO organization_user_affiliations (user_id, organization_id, role, team_id, jersey_number, status, is_deleted, created_at, updated_at)
SELECT u.id, o.id, m.role::org_role, t.id, m.jersey, 'ACTIVE'::affiliation_status, false, NOW(), NOW()
FROM (VALUES
    ('romulo.zilio@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'TEAM_ADMIN', NULL),
    ('rui.alcantara@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'COACHING_STAFF', NULL),
    ('salvador.barreto@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 4),
    ('sebastiao.camargo@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 5),
    ('sidnei.delfino@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 6),
    ('silas.espinoza@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 7),
    ('simao.fagundes@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 8),
    ('socrates.goulart@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 9),
    ('tarcisio.haddad@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 10),
    ('teodoro.inacio@quadra.com.br', 'puc-campinas-basquete', 'puc-time-16', 'ATHLETE', 11)
) AS m(user_email, org_slug, team_slug, role, jersey)
JOIN users u ON u.email = m.user_email AND u.is_deleted = false
JOIN organizations o ON o.slug = m.org_slug AND o.is_deleted = false
JOIN teams t ON t.slug = m.team_slug AND t.is_deleted = false
WHERE NOT EXISTS (SELECT 1 FROM organization_user_affiliations oua WHERE oua.user_id = u.id AND oua.organization_id = o.id AND oua.role = m.role::org_role AND oua.team_id = t.id AND oua.is_deleted = false);

COMMIT;

-- SELECT count(*) FROM organizations WHERE slug = 'puc-campinas-basquete';  -- 1
-- SELECT count(*) FROM teams WHERE slug LIKE 'puc-time-%';                  -- 16
-- SELECT count(*) FROM users WHERE email LIKE '%@quadra.com.br';            -- 160
-- SELECT count(*) FROM organization_user_affiliations;                      -- 161
-- SELECT count(*) FROM organization_team_affiliations;                      -- 16

