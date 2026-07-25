-- DB-only check constraints
ALTER TABLE "seasons"
    ADD CONSTRAINT "seasons_date_range_chk"
    CHECK ("start_date" <= "end_date");

ALTER TABLE "tournament_categories"
    ADD CONSTRAINT "tournament_categories_slug_lowercase_chk"
    CHECK ("slug" IS NULL OR "slug" = lower("slug"));

ALTER TABLE "tournaments"
    ADD CONSTRAINT "tournaments_slug_lowercase_chk"
    CHECK ("slug" IS NULL OR "slug" = lower("slug"));

ALTER TABLE "tournaments"
    ADD CONSTRAINT "tournaments_date_range_chk"
    CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" <= "ends_at");

ALTER TABLE "tournaments"
    ADD CONSTRAINT "tournaments_champion_requires_completed_chk"
    CHECK ("champion_tournament_team_id" IS NULL OR "status" = 'COMPLETED');

ALTER TABLE "match_teams"
    ADD CONSTRAINT "match_teams_final_score_non_negative_chk"
    CHECK ("final_score" IS NULL OR "final_score" >= 0);

ALTER TABLE "match_teams"
    ADD CONSTRAINT "match_teams_result_loss_type_chk"
    CHECK (
        ("result" IS NULL AND "loss_type" IS NULL)
        OR ("result" = 'LOSS' AND "loss_type" IS NOT NULL)
        OR ("result" = 'WIN' AND "loss_type" IS NULL)
    );

ALTER TABLE "match_periods"
    ADD CONSTRAINT "match_periods_points_non_negative_chk"
    CHECK ("home_points" >= 0 AND "away_points" >= 0);

ALTER TABLE "player_match_statistics"
    ADD CONSTRAINT "player_match_stats_non_negative_chk"
    CHECK (
        ("pts" IS NULL OR "pts" >= 0)
        AND ("fgm" IS NULL OR "fgm" >= 0)
        AND ("fga" IS NULL OR "fga" >= 0)
        AND ("three_fgm" IS NULL OR "three_fgm" >= 0)
        AND ("three_fga" IS NULL OR "three_fga" >= 0)
        AND ("ftm" IS NULL OR "ftm" >= 0)
        AND ("fta" IS NULL OR "fta" >= 0)
        AND ("reb" IS NULL OR "reb" >= 0)
        AND ("ast" IS NULL OR "ast" >= 0)
        AND ("stl" IS NULL OR "stl" >= 0)
        AND ("blk" IS NULL OR "blk" >= 0)
        AND ("tov" IS NULL OR "tov" >= 0)
        AND ("pf" IS NULL OR "pf" >= 0)
        AND ("minutes_seconds" IS NULL OR "minutes_seconds" >= 0)
    );

ALTER TABLE "player_match_statistics"
    ADD CONSTRAINT "player_match_stats_made_vs_attempted_chk"
    CHECK (
        ("fgm" IS NULL OR "fga" IS NULL OR "fgm" <= "fga")
        AND ("three_fgm" IS NULL OR "three_fga" IS NULL OR "three_fgm" <= "three_fga")
        AND ("ftm" IS NULL OR "fta" IS NULL OR "ftm" <= "fta")
    );

-- DB-only partial unique indexes
CREATE UNIQUE INDEX "seasons_org_label_active_unique_idx"
    ON "seasons" ("organization_id", "label")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_categories_org_name_active_unique_idx"
    ON "tournament_categories" ("organization_id", "name")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_categories_org_slug_active_unique_idx"
    ON "tournament_categories" ("organization_id", "slug")
    WHERE "is_deleted" = false AND "slug" IS NOT NULL;

CREATE UNIQUE INDEX "tournaments_org_slug_active_unique_idx"
    ON "tournaments" ("organization_id", "slug")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_teams_tournament_team_active_unique_idx"
    ON "tournament_teams" ("tournament_id", "team_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_rosters_tournament_user_active_unique_idx"
    ON "tournament_rosters" ("tournament_id", "user_id")
    WHERE "is_deleted" = false AND "role" = 'ATHLETE' AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "tournament_groups_tournament_name_active_unique_idx"
    ON "tournament_groups" ("tournament_id", "name")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_group_teams_group_team_active_unique_idx"
    ON "tournament_group_teams" ("tournament_group_id", "tournament_team_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_group_teams_tournament_team_active_unique_idx"
    ON "tournament_group_teams" ("tournament_id", "tournament_team_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_bracket_rounds_tournament_number_active_uniq_idx"
    ON "tournament_bracket_rounds" ("tournament_id", "number")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_bracket_slots_round_position_active_unique_idx"
    ON "tournament_bracket_slots" ("round_id", "position")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "tournament_bracket_slots_match_active_unique_idx"
    ON "tournament_bracket_slots" ("match_id")
    WHERE "is_deleted" = false AND "match_id" IS NOT NULL;

CREATE UNIQUE INDEX "match_teams_match_side_active_unique_idx"
    ON "match_teams" ("match_id", "side")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "match_teams_match_team_active_unique_idx"
    ON "match_teams" ("match_id", "tournament_team_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "match_periods_match_period_active_unique_idx"
    ON "match_periods" ("match_id", "period_number")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "match_rosters_match_user_active_unique_idx"
    ON "match_rosters" ("match_id", "user_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "match_rosters_match_roster_active_unique_idx"
    ON "match_rosters" ("match_id", "tournament_roster_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "player_match_stats_match_user_active_unique_idx"
    ON "player_match_statistics" ("match_id", "user_id")
    WHERE "is_deleted" = false;

-- DB-only partial indexes
CREATE INDEX "seasons_org_start_date_active_idx"
    ON "seasons" ("organization_id", "start_date")
    WHERE "is_deleted" = false;

CREATE INDEX "tournaments_org_season_active_idx"
    ON "tournaments" ("organization_id", "season_id")
    WHERE "is_deleted" = false;

CREATE INDEX "tournaments_org_category_active_idx"
    ON "tournaments" ("organization_id", "category_id")
    WHERE "is_deleted" = false;

CREATE INDEX "tournaments_org_status_active_idx"
    ON "tournaments" ("organization_id", "status")
    WHERE "is_deleted" = false;

CREATE INDEX "tournament_teams_org_team_active_idx"
    ON "tournament_teams" ("organization_id", "team_id")
    WHERE "is_deleted" = false;

CREATE INDEX "tournament_rosters_team_status_active_idx"
    ON "tournament_rosters" ("tournament_team_id", "status")
    WHERE "is_deleted" = false;

CREATE INDEX "tournament_rosters_org_user_active_idx"
    ON "tournament_rosters" ("organization_id", "user_id")
    WHERE "is_deleted" = false;

CREATE INDEX "matches_org_tournament_scheduled_active_idx"
    ON "matches" ("organization_id", "tournament_id", "scheduled_at")
    WHERE "is_deleted" = false;

CREATE INDEX "matches_org_status_scheduled_active_idx"
    ON "matches" ("organization_id", "status", "scheduled_at")
    WHERE "is_deleted" = false;

CREATE INDEX "match_teams_org_team_active_idx"
    ON "match_teams" ("organization_id", "tournament_team_id")
    WHERE "is_deleted" = false;

CREATE INDEX "match_periods_org_match_active_idx"
    ON "match_periods" ("organization_id", "match_id")
    WHERE "is_deleted" = false;

CREATE INDEX "match_rosters_team_status_active_idx"
    ON "match_rosters" ("match_team_id", "status")
    WHERE "is_deleted" = false;

CREATE INDEX "player_match_stats_org_user_active_idx"
    ON "player_match_statistics" ("organization_id", "user_id")
    WHERE "is_deleted" = false;

CREATE INDEX "player_match_stats_org_match_active_idx"
    ON "player_match_statistics" ("organization_id", "match_id")
    WHERE "is_deleted" = false;

CREATE INDEX "player_match_stats_team_active_idx"
    ON "player_match_statistics" ("match_team_id")
    WHERE "is_deleted" = false;
