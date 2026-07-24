-- =============================================================================
-- SPORTS MODULE DB-ONLY CONSTRAINT VERIFICATION
-- =============================================================================
--
-- Verifies that the DB-only rules from the sports module migrations actually
-- landed: every CHECK constraint fires, every partial UNIQUE index rejects a
-- duplicate, and the partial uniques are genuinely partial (a soft-deleted row
-- does not block re-inserting the same key).
--
-- Prerequisite: BOTH sports migrations must already be applied —
--   20260724191355_sports_module_schema
--   20260724191400_sports_module_constraints
--
-- Run (hand-run, once, against a database with those migrations applied):
--   psql "$DATABASE_URL" -f prisma/seeds/sports-schema-verification.sql
--
-- Safety: the whole script runs inside BEGIN...ROLLBACK. It creates its own
-- organization and its own fixture chain (no dependency on pre-existing seed
-- data), attempts every violation, then rolls everything back — it writes
-- nothing permanent, even on a fully clean pass.
--
-- Reading the output: a clean run prints only "OK: <rule>" NOTICEs. Any
-- "FAIL: <rule> ..." NOTICE, or an uncaught error aborting the script, means
-- that specific DB-only rule did not land as expected (or the fixture itself
-- is wrong — an uncaught error is always loud, never a silent false pass).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Fixture: one valid chain through every sports table, built once. Every DO
-- block below either reuses these ids directly, or builds its own throwaway
-- parent locally, so blocks never interfere with each other — a caught
-- exception rolls back everything the block itself did (PL/pgSQL EXCEPTION
-- is an implicit savepoint), and successful assertions never write past this
-- fixture's own transaction.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _fx (k text PRIMARY KEY, id int) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO organizations (name, slug, status, is_deleted, created_at, updated_at)
  VALUES ('CHK Org', 'chk-verify-org', 'ACTIVE', false, NOW(), NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('org', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO users (email, name, password_hash, updated_at)
  VALUES ('chk-u1@example.com', 'Check User 1', 'x', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('user1', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO users (email, name, password_hash, updated_at)
  VALUES ('chk-u2@example.com', 'Check User 2', 'x', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('user2', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO teams (name, short_name, slug, updated_at)
  VALUES ('Check Team 1', 'CK1', 'chk-team-1', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('team1', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO teams (name, short_name, slug, updated_at)
  VALUES ('Check Team 2', 'CK2', 'chk-team-2', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('team2', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO seasons (organization_id, label, start_date, end_date, status, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'CHK-Season', DATE '2026-01-01', DATE '2026-12-31', 'ACTIVE', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('season', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournament_categories (organization_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'Check Category', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('category', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournaments (organization_id, season_id, name, format, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'Check Tournament', 'LEAGUE', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('tournament', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournament_teams (organization_id, tournament_id, team_id, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'team1'), 'Check Team 1', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('tteam1', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournament_teams (organization_id, tournament_id, team_id, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'team2'), 'Check Team 2', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('tteam2', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournament_groups (organization_id, tournament_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 'Check Group', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('group', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournament_bracket_rounds (organization_id, tournament_id, number, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 1, NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('round', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO tournament_rosters (organization_id, tournament_id, tournament_team_id, user_id, role, status, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'tteam1'), (SELECT id FROM _fx WHERE k = 'user1'), 'ATHLETE', 'ACTIVE', 'Check Athlete 1', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('roster1', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('match', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('mteam1', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), (SELECT id FROM _fx WHERE k = 'tteam2'), 'AWAY', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('mteam2', (SELECT id FROM ins));

WITH ins AS (
  INSERT INTO match_rosters (organization_id, match_id, match_team_id, tournament_roster_id, user_id, role, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), (SELECT id FROM _fx WHERE k = 'mteam1'), (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user1'), 'ATHLETE', 'Check Athlete 1', NOW())
  RETURNING id)
INSERT INTO _fx VALUES ('mroster1', (SELECT id FROM ins));

-- =============================================================================
-- CHECK CONSTRAINTS (10)
-- =============================================================================

-- 1. seasons_date_range_chk
DO $$
BEGIN
  INSERT INTO seasons (organization_id, label, start_date, end_date, status, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-CHK season range', DATE '2026-12-31', DATE '2026-01-01', 'ACTIVE', NOW());
  RAISE EXCEPTION 'FAIL: seasons_date_range_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: seasons_date_range_chk';
END $$;

-- 2. tournament_categories_slug_lowercase_chk
DO $$
BEGIN
  INSERT INTO tournament_categories (organization_id, name, slug, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-CHK category slug', 'UPPER', NOW());
  RAISE EXCEPTION 'FAIL: tournament_categories_slug_lowercase_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: tournament_categories_slug_lowercase_chk';
END $$;

-- 3. tournaments_slug_lowercase_chk
DO $$
BEGIN
  INSERT INTO tournaments (organization_id, season_id, name, slug, format, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'V-CHK tournament slug', 'UPPER', 'LEAGUE', NOW());
  RAISE EXCEPTION 'FAIL: tournaments_slug_lowercase_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: tournaments_slug_lowercase_chk';
END $$;

-- 4. tournaments_date_range_chk
DO $$
BEGIN
  INSERT INTO tournaments (organization_id, season_id, name, format, starts_at, ends_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'V-CHK tournament dates', 'LEAGUE', TIMESTAMPTZ '2026-12-31', TIMESTAMPTZ '2026-01-01', NOW());
  RAISE EXCEPTION 'FAIL: tournaments_date_range_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: tournaments_date_range_chk';
END $$;

-- 5. tournaments_champion_requires_completed_chk
DO $$
BEGIN
  INSERT INTO tournaments (organization_id, season_id, name, format, status, champion_tournament_team_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'V-CHK tournament champion', 'LEAGUE', 'DRAFT', (SELECT id FROM _fx WHERE k = 'tteam1'), NOW());
  RAISE EXCEPTION 'FAIL: tournaments_champion_requires_completed_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: tournaments_champion_requires_completed_chk';
END $$;

-- 6. match_teams_final_score_non_negative_chk (fresh throwaway match)
DO $$
DECLARE
  v_match int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, final_score, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', -1, NOW());
  RAISE EXCEPTION 'FAIL: match_teams_final_score_non_negative_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: match_teams_final_score_non_negative_chk';
END $$;

-- 7. match_teams_result_loss_type_chk (fresh throwaway match)
DO $$
DECLARE
  v_match int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, result, loss_type, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', 'WIN', 'NORMAL', NOW());
  RAISE EXCEPTION 'FAIL: match_teams_result_loss_type_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: match_teams_result_loss_type_chk';
END $$;

-- 8. match_periods_points_non_negative_chk (fresh throwaway match)
DO $$
DECLARE
  v_match int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_periods (organization_id, match_id, period_number, period_type, home_points, away_points, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, 1, 'REGULAR', -1, 0, NOW());
  RAISE EXCEPTION 'FAIL: match_periods_points_non_negative_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: match_periods_points_non_negative_chk';
END $$;

-- 9. player_match_stats_non_negative_chk (fresh throwaway match + match_team)
DO $$
DECLARE
  v_match int;
  v_mteam int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW())
  RETURNING id INTO v_mteam;

  INSERT INTO player_match_statistics (organization_id, match_id, match_team_id, tournament_roster_id, user_id, pts, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, v_mteam, (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user1'), -1, NOW());
  RAISE EXCEPTION 'FAIL: player_match_stats_non_negative_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: player_match_stats_non_negative_chk';
END $$;

-- 10. player_match_stats_made_vs_attempted_chk (fresh throwaway match + match_team)
DO $$
DECLARE
  v_match int;
  v_mteam int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW())
  RETURNING id INTO v_mteam;

  INSERT INTO player_match_statistics (organization_id, match_id, match_team_id, tournament_roster_id, user_id, fgm, fga, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, v_mteam, (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user1'), 5, 3, NOW());
  RAISE EXCEPTION 'FAIL: player_match_stats_made_vs_attempted_chk did not fire';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK: player_match_stats_made_vs_attempted_chk';
END $$;

-- =============================================================================
-- PARTIAL UNIQUE INDEXES (18) — insert a valid row, then a duplicate on the
-- indexed columns, expect unique_violation on the duplicate. A caught
-- exception rolls back everything the block did, so reusing fixture ids
-- across blocks below is safe; where the fixture already holds a row on that
-- exact key, the block builds its own fresh parent instead (noted inline).
-- =============================================================================

-- 1. seasons_org_label_active_unique_idx
DO $$
BEGIN
  INSERT INTO seasons (organization_id, label, start_date, end_date, status, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-UNQ season', DATE '2026-01-01', DATE '2026-12-31', 'ACTIVE', NOW());

  INSERT INTO seasons (organization_id, label, start_date, end_date, status, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-UNQ season', DATE '2026-01-01', DATE '2026-12-31', 'ACTIVE', NOW());

  RAISE EXCEPTION 'FAIL: seasons_org_label_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: seasons_org_label_active_unique_idx';
END $$;

-- 2. tournament_categories_org_name_active_unique_idx
DO $$
BEGIN
  INSERT INTO tournament_categories (organization_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-UNQ category', NOW());

  INSERT INTO tournament_categories (organization_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-UNQ category', NOW());

  RAISE EXCEPTION 'FAIL: tournament_categories_org_name_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_categories_org_name_active_unique_idx';
END $$;

-- 3. tournament_categories_org_slug_active_unique_idx (both rows need equal non-null slug)
DO $$
BEGIN
  INSERT INTO tournament_categories (organization_id, name, slug, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-UNQ category slug a', 'v-unq-cat-slug', NOW());

  INSERT INTO tournament_categories (organization_id, name, slug, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-UNQ category slug b', 'v-unq-cat-slug', NOW());

  RAISE EXCEPTION 'FAIL: tournament_categories_org_slug_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_categories_org_slug_active_unique_idx';
END $$;

-- 4. tournaments_org_slug_active_unique_idx (non-null slug)
DO $$
BEGIN
  INSERT INTO tournaments (organization_id, season_id, name, slug, format, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'V-UNQ tournament a', 'v-unq-tournament-slug', 'LEAGUE', NOW());

  INSERT INTO tournaments (organization_id, season_id, name, slug, format, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'V-UNQ tournament b', 'v-unq-tournament-slug', 'LEAGUE', NOW());

  RAISE EXCEPTION 'FAIL: tournaments_org_slug_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournaments_org_slug_active_unique_idx';
END $$;

-- 5. tournament_teams_tournament_team_active_unique_idx
-- Fixture already has (tournament, team1) as tteam1, so this uses a fresh
-- throwaway tournament to keep the two probe rows self-contained.
DO $$
DECLARE
  v_tournament int;
BEGIN
  INSERT INTO tournaments (organization_id, season_id, name, format, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'season'), 'V-UNQ tteam parent', 'LEAGUE', NOW())
  RETURNING id INTO v_tournament;

  INSERT INTO tournament_teams (organization_id, tournament_id, team_id, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_tournament, (SELECT id FROM _fx WHERE k = 'team1'), 'V-UNQ Team', NOW());

  INSERT INTO tournament_teams (organization_id, tournament_id, team_id, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_tournament, (SELECT id FROM _fx WHERE k = 'team1'), 'V-UNQ Team', NOW());

  RAISE EXCEPTION 'FAIL: tournament_teams_tournament_team_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_teams_tournament_team_active_unique_idx';
END $$;

-- 6. tournament_rosters_tournament_user_active_unique_idx (role=ATHLETE, status=ACTIVE)
-- Fixture's roster1 already occupies (tournament, user1); this probe uses
-- user2, who has no tournament_rosters row yet, so it stays independent.
DO $$
BEGIN
  INSERT INTO tournament_rosters (organization_id, tournament_id, tournament_team_id, user_id, role, status, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'tteam1'), (SELECT id FROM _fx WHERE k = 'user2'), 'ATHLETE', 'ACTIVE', 'V-UNQ roster', NOW());

  INSERT INTO tournament_rosters (organization_id, tournament_id, tournament_team_id, user_id, role, status, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'tteam1'), (SELECT id FROM _fx WHERE k = 'user2'), 'ATHLETE', 'ACTIVE', 'V-UNQ roster', NOW());

  RAISE EXCEPTION 'FAIL: tournament_rosters_tournament_user_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_rosters_tournament_user_active_unique_idx';
END $$;

-- 7. tournament_groups_tournament_name_active_unique_idx
DO $$
BEGIN
  INSERT INTO tournament_groups (organization_id, tournament_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 'V-UNQ group', NOW());

  INSERT INTO tournament_groups (organization_id, tournament_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 'V-UNQ group', NOW());

  RAISE EXCEPTION 'FAIL: tournament_groups_tournament_name_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_groups_tournament_name_active_unique_idx';
END $$;

-- 8. tournament_group_teams_group_team_active_unique_idx (same group, same team)
DO $$
BEGIN
  INSERT INTO tournament_group_teams (organization_id, tournament_id, tournament_group_id, tournament_team_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'group'), (SELECT id FROM _fx WHERE k = 'tteam1'), NOW());

  INSERT INTO tournament_group_teams (organization_id, tournament_id, tournament_group_id, tournament_team_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'group'), (SELECT id FROM _fx WHERE k = 'tteam1'), NOW());

  RAISE EXCEPTION 'FAIL: tournament_group_teams_group_team_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_group_teams_group_team_active_unique_idx';
END $$;

-- 9. tournament_group_teams_tournament_team_active_unique_idx (distinct groups, same tournament+team)
DO $$
DECLARE
  v_group2 int;
BEGIN
  INSERT INTO tournament_groups (organization_id, tournament_id, name, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 'V-UNQ group 2', NOW())
  RETURNING id INTO v_group2;

  INSERT INTO tournament_group_teams (organization_id, tournament_id, tournament_group_id, tournament_team_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'group'), (SELECT id FROM _fx WHERE k = 'tteam1'), NOW());

  INSERT INTO tournament_group_teams (organization_id, tournament_id, tournament_group_id, tournament_team_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), v_group2, (SELECT id FROM _fx WHERE k = 'tteam1'), NOW());

  RAISE EXCEPTION 'FAIL: tournament_group_teams_tournament_team_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_group_teams_tournament_team_active_unique_idx';
END $$;

-- 10. tournament_bracket_rounds_tournament_number_active_uniq_idx
-- Fixture's round already occupies number=1, so this probe uses number=99.
DO $$
BEGIN
  INSERT INTO tournament_bracket_rounds (organization_id, tournament_id, number, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 99, NOW());

  INSERT INTO tournament_bracket_rounds (organization_id, tournament_id, number, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), 99, NOW());

  RAISE EXCEPTION 'FAIL: tournament_bracket_rounds_tournament_number_active_uniq_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_bracket_rounds_tournament_number_active_uniq_idx';
END $$;

-- 11. tournament_bracket_slots_round_position_active_unique_idx
DO $$
BEGIN
  INSERT INTO tournament_bracket_slots (organization_id, tournament_id, round_id, position, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'round'), 1, NOW());

  INSERT INTO tournament_bracket_slots (organization_id, tournament_id, round_id, position, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'round'), 1, NOW());

  RAISE EXCEPTION 'FAIL: tournament_bracket_slots_round_position_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_bracket_slots_round_position_active_unique_idx';
END $$;

-- 12. tournament_bracket_slots_match_active_unique_idx (two slots, same match_id, different positions)
DO $$
BEGIN
  INSERT INTO tournament_bracket_slots (organization_id, tournament_id, round_id, position, match_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'round'), 2, (SELECT id FROM _fx WHERE k = 'match'), NOW());

  INSERT INTO tournament_bracket_slots (organization_id, tournament_id, round_id, position, match_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'round'), 3, (SELECT id FROM _fx WHERE k = 'match'), NOW());

  RAISE EXCEPTION 'FAIL: tournament_bracket_slots_match_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: tournament_bracket_slots_match_active_unique_idx';
END $$;

-- 13. match_teams_match_side_active_unique_idx (fresh throwaway match; same side, different team)
DO $$
DECLARE
  v_match int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW());

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam2'), 'HOME', NOW());

  RAISE EXCEPTION 'FAIL: match_teams_match_side_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: match_teams_match_side_active_unique_idx';
END $$;

-- 14. match_teams_match_team_active_unique_idx (fresh throwaway match; same team, different side)
DO $$
DECLARE
  v_match int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW());

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'AWAY', NOW());

  RAISE EXCEPTION 'FAIL: match_teams_match_team_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: match_teams_match_team_active_unique_idx';
END $$;

-- 15. match_periods_match_period_active_unique_idx
DO $$
BEGIN
  INSERT INTO match_periods (organization_id, match_id, period_number, period_type, home_points, away_points, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), 1, 'REGULAR', 0, 0, NOW());

  INSERT INTO match_periods (organization_id, match_id, period_number, period_type, home_points, away_points, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), 1, 'REGULAR', 0, 0, NOW());

  RAISE EXCEPTION 'FAIL: match_periods_match_period_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: match_periods_match_period_active_unique_idx';
END $$;

-- 16. match_rosters_match_user_active_unique_idx (fresh throwaway match + match_team)
DO $$
DECLARE
  v_match int;
  v_mteam int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW())
  RETURNING id INTO v_mteam;

  INSERT INTO match_rosters (organization_id, match_id, match_team_id, tournament_roster_id, user_id, role, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, v_mteam, (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user1'), 'ATHLETE', 'V-UNQ mroster', NOW());

  INSERT INTO match_rosters (organization_id, match_id, match_team_id, tournament_roster_id, user_id, role, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, v_mteam, (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user1'), 'ATHLETE', 'V-UNQ mroster', NOW());

  RAISE EXCEPTION 'FAIL: match_rosters_match_user_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: match_rosters_match_user_active_unique_idx';
END $$;

-- 17. match_rosters_match_roster_active_unique_idx (fresh throwaway match + match_team; same roster, different user)
DO $$
DECLARE
  v_match int;
  v_mteam int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_teams (organization_id, match_id, tournament_team_id, side, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, (SELECT id FROM _fx WHERE k = 'tteam1'), 'HOME', NOW())
  RETURNING id INTO v_mteam;

  INSERT INTO match_rosters (organization_id, match_id, match_team_id, tournament_roster_id, user_id, role, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, v_mteam, (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user1'), 'ATHLETE', 'V-UNQ mroster a', NOW());

  INSERT INTO match_rosters (organization_id, match_id, match_team_id, tournament_roster_id, user_id, role, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, v_mteam, (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user2'), 'ATHLETE', 'V-UNQ mroster b', NOW());

  RAISE EXCEPTION 'FAIL: match_rosters_match_roster_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: match_rosters_match_roster_active_unique_idx';
END $$;

-- 18. player_match_stats_match_user_active_unique_idx
DO $$
BEGIN
  INSERT INTO player_match_statistics (organization_id, match_id, match_team_id, tournament_roster_id, user_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), (SELECT id FROM _fx WHERE k = 'mteam1'), (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user2'), NOW());

  INSERT INTO player_match_statistics (organization_id, match_id, match_team_id, tournament_roster_id, user_id, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'match'), (SELECT id FROM _fx WHERE k = 'mteam1'), (SELECT id FROM _fx WHERE k = 'roster1'), (SELECT id FROM _fx WHERE k = 'user2'), NOW());

  RAISE EXCEPTION 'FAIL: player_match_stats_match_user_active_unique_idx did not fire';
EXCEPTION
  WHEN unique_violation THEN RAISE NOTICE 'OK: player_match_stats_match_user_active_unique_idx';
END $$;

-- =============================================================================
-- SOFT-DELETE ROUND TRIPS (3) — proves each index is genuinely partial: insert
-- a row, soft-delete it, then insert a fresh row on the SAME key. The second
-- insert must SUCCEED; a unique_violation here means the index was wrongly
-- written as plain unique (missing its WHERE is_deleted = false clause).
-- =============================================================================

-- a. seasons_org_label_active_unique_idx
DO $$
DECLARE
  v_id int;
BEGIN
  INSERT INTO seasons (organization_id, label, start_date, end_date, status, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-SOFT season', DATE '2026-01-01', DATE '2026-12-31', 'ACTIVE', NOW())
  RETURNING id INTO v_id;

  UPDATE seasons SET is_deleted = true, updated_at = NOW() WHERE id = v_id;

  INSERT INTO seasons (organization_id, label, start_date, end_date, status, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), 'V-SOFT season', DATE '2026-01-01', DATE '2026-12-31', 'ACTIVE', NOW());

  RAISE NOTICE 'OK: seasons_org_label_active_unique_idx partial round-trip';
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'FAIL: seasons_org_label_active_unique_idx is not partial';
END $$;

-- b. match_periods_match_period_active_unique_idx (fresh throwaway match)
DO $$
DECLARE
  v_match int;
  v_id int;
BEGIN
  INSERT INTO matches (organization_id, tournament_id, scheduled_at, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), NOW(), NOW())
  RETURNING id INTO v_match;

  INSERT INTO match_periods (organization_id, match_id, period_number, period_type, home_points, away_points, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, 1, 'REGULAR', 0, 0, NOW())
  RETURNING id INTO v_id;

  UPDATE match_periods SET is_deleted = true, updated_at = NOW() WHERE id = v_id;

  INSERT INTO match_periods (organization_id, match_id, period_number, period_type, home_points, away_points, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), v_match, 1, 'REGULAR', 0, 0, NOW());

  RAISE NOTICE 'OK: match_periods_match_period_active_unique_idx partial round-trip';
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'FAIL: match_periods_match_period_active_unique_idx is not partial';
END $$;

-- c. tournament_rosters_tournament_user_active_unique_idx (role=ATHLETE, status=ACTIVE)
DO $$
DECLARE
  v_id int;
BEGIN
  INSERT INTO tournament_rosters (organization_id, tournament_id, tournament_team_id, user_id, role, status, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'tteam1'), (SELECT id FROM _fx WHERE k = 'user2'), 'ATHLETE', 'ACTIVE', 'V-SOFT roster', NOW())
  RETURNING id INTO v_id;

  UPDATE tournament_rosters SET is_deleted = true, updated_at = NOW() WHERE id = v_id;

  INSERT INTO tournament_rosters (organization_id, tournament_id, tournament_team_id, user_id, role, status, display_name_snapshot, updated_at)
  VALUES ((SELECT id FROM _fx WHERE k = 'org'), (SELECT id FROM _fx WHERE k = 'tournament'), (SELECT id FROM _fx WHERE k = 'tteam1'), (SELECT id FROM _fx WHERE k = 'user2'), 'ATHLETE', 'ACTIVE', 'V-SOFT roster', NOW());

  RAISE NOTICE 'OK: tournament_rosters_tournament_user_active_unique_idx partial round-trip';
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'FAIL: tournament_rosters_tournament_user_active_unique_idx is not partial';
END $$;

ROLLBACK;
